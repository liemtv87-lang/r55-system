import {db} from "hatchable";
import original from "lib/r55Original/worker.js";
import {createOriginalBrain,withOriginalBrain} from "lib/r55Original/native-store.js";
import {vnWindowDay} from "lib/apiFootball.js";

// The original, byte-preserved R55 source & AutoBrain modules supply all input.
// Nothing in this bridge invents odds, team names, scores, or backtest wins.
const CURSOR="r55-original-source-rotation";
const priority=s=>/(premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|libertadores|j1 league|j-league)/i.test(String(s||""))?1:0;
function toMarket(p,type){
 const v=p?.[type.toLowerCase()];
 if(!v)return null;
 const line=Number(v.line),odd=Number(v.avgOdd),strength=Number(v.strength);
 if(!Number.isFinite(line)||!Number.isFinite(odd)||!Number.isFinite(strength)||
   odd<1.50||odd>3.50||strength<0||strength>1||
   Math.abs(line*4-Math.round(line*4))>0.00001||
   Number(v.books||0)<2)return null;
 const side=String(v.pick||"");
 if(type==="AH"&&!["Home","Away"].includes(side))return null;
 if(type==="OU"&&(!["Over","Under"].includes(side)||line<1.5||line>5))return null;
 if(type==="OU"&&side==="Over"&&line===1.75&&strength<.64)return null;
 return {type,pick:side.toUpperCase(),line:type==="AH"&&side==="Away"?-line:line,
  odds:odd,confidence:null,bookmaker:Array.isArray(v.bookIds)?String(v.bookIds[0]||"Original R55"):"Original R55",
  originalStrength:strength,method:v.methodChampion||"book_weight",
  bookmakers:Number(v.books)};
}
export function chooseOriginalPicks(predictions,learned=[]){
 const winners=new Map((Array.isArray(learned)?learned:[])
  .filter(x=>x.eligible===true&&Number(x.n)>=50&&Number(x.days)>=5&&Number(x.wilsonLower)>.47&&Number(x.units)>0)
  .map(x=>[String(x.method)+"|"+String(x.type),Number(x.priority)||0]));
 const now=Date.now(),out=[],seen=new Set();
 for(const p of Array.isArray(predictions)?predictions:[]){
  const kickoff=new Date(p?.date||"").getTime();
  if(!Number.isFinite(kickoff)||kickoff<now-2*60*1000||kickoff>now+30*3600000)continue;
  const home=String(p.home||"").trim(),away=String(p.away||"").trim(),league=String(p.league||"").trim();
  if(!home||!away||!league||home===away)continue;
  const ah=toMarket(p,"AH"),ou=toMarket(p,"OU");
  if(!ah&&!ou)continue;
  const m=!ou?ah:!ah?ou:ah.originalStrength>=ou.originalStrength?ah:ou;
  const id=String(p.id||home+"-"+away+"-"+kickoff);
  if(seen.has(id))continue;seen.add(id);
  const method="original_r55_"+m.method;
  const learnedBonus=Math.min(8,Math.max(0,100*(winners.get(method+"|"+m.type)||0)));
  out.push({id,home,away,league,country:"",
   kickoff:new Date(kickoff).toISOString(),market:m,
   score:Number((m.originalStrength*100+learnedBonus).toFixed(2)),learningPriority:Number(learnedBonus.toFixed(2)),priority:priority(league),
   bookmakerCount:m.bookmakers,sourceRef:"original-r55-verified-market",
   method:"original_r55_"+m.method});
 }
 return out.sort((a,b)=>b.priority-a.priority||b.score-a.score||a.kickoff.localeCompare(b.kickoff)).slice(0,100);
}
export async function runOriginalR55Bridge(){
 const day=vnWindowDay();
 const existing=await db.query("SELECT locked_at FROM football_snapshots WHERE day=$1::date",[day]);
 if(existing.rows.length)return {ok:true,day,alreadyLocked:true,source:"original-r55"};
 const cur=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",[CURSOR]);
 const saved=cur.rows[0]?.payload||{},offset=Math.max(0,Number(saved.offset||0));
 const url=new URL("https://r55-original.internal/api/market");
 url.searchParams.set("offset",String(offset));
 url.searchParams.set("limit","2");
 url.searchParams.set("ts",String(Date.now()-10*60*1000));
 let market={},feed={predictions:[]},lastError="";
 try{
  const response=await original.fetch(new Request(url.toString()),{}, {waitUntil(){}});
  market=await response.json();
  if(!response.ok||market.ok!==true||!Array.isArray(market.rows))
    throw Error("original_source_unavailable_"+response.status);
  // Advance source cursor even for healthy empty sources, but do not invent rows.
  const next=market.nextOffset===null?0:Math.max(0,Number(market.nextOffset||offset+2));
  await db.query(
   "INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",
   [CURSOR,JSON.stringify({offset:next,lastCheckedAt:new Date().toISOString(),rows:market.rows.length,
    sourceHealth:market.sourceHealth||{},lastError:null})]
  );
  feed=await withOriginalBrain(async()=>{
   const brain=createOriginalBrain();
   const store=await brain.fetch(new Request("https://auto/pool",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({rows:market.rows,from:Date.now(),complete:false,checkedSources:2,
     origin:"hatchable-r55-original",sourceHealth:market.sourceHealth||{}})}));
   const saved=await store.json();
   if(!store.ok||!saved.ok)throw Error("original_pool_write_failed");
   const result=await brain.fetch(new Request("https://auto/telegram-feed?from="+
    (Date.now()-2*60*1000)+"&to="+(Date.now()+30*3600000)));
   if(!result.ok)throw Error("original_feed_http_"+result.status);
   return result.json();
  });
 }catch(e){
  lastError=String(e?.message||e).slice(0,190);
  return {ok:false,day,error:lastError,source:"original-r55",offset,verifiedRows:0,
   snapshotPublished:false};
 }
 const learned=await db.query("SELECT payload FROM football_compact_stats WHERE scope='r55_method_rank' LIMIT 1");
 const learnedMethods=learned.rows[0]?.payload?.methods||[];
 const selected=chooseOriginalPicks(feed.predictions,learnedMethods);
 // Never freeze a low-coverage day as a misleading 20/30-match snapshot.
 if(selected.length<20)return {ok:false,day,error:"insufficient_verified_r55_matches",
   source:"original-r55",offset,verifiedRows:market.rows.length,
   eligibleMatches:selected.length,snapshotPublished:false,
   sourceHealth:market.sourceHealth||{}};
 const snapshot={date:day,source:"original-r55-native-verified",model:"R55 original AutoBrain",
  locked:true,generatedAt:new Date().toISOString(),oneMarketPerMatch:true,
  disclaimer:"R55 heuristic scores are not calibrated win probabilities.",
  matches:selected};
 const inserted=await db.query(
  "INSERT INTO football_snapshots(day,payload,source) VALUES($1::date,$2::jsonb,$3) ON CONFLICT(day) DO NOTHING RETURNING day",
  [day,JSON.stringify(snapshot),snapshot.source]);
 return {ok:true,day,source:snapshot.source,verifiedRows:market.rows.length,
  eligibleMatches:selected.length,snapshotPublished:inserted.rows.length===1,
  alreadyLocked:inserted.rows.length===0};
}