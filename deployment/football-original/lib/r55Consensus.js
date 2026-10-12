import {db} from "hatchable";
// Conservative MARKET-IMPLIED consensus, not a trained or backtested hit-rate claim.
const str=x=>String(x??"").trim();
const validDay=x=>/^\d{4}-\d{2}-\d{2}$/.test(x);
const med=a=>{const v=[...a].sort((a,b)=>a-b);return v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2};
const prioritize=league=>/(premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|libertadores|j1 league|j-league|uefa nations league)/i.test(league)?1:0;
const other=(m)=>m.type==="OU"?{type:"OU",pick:m.pick==="OVER"?"UNDER":"OVER",line:m.line}:{type:"AH",pick:m.pick==="HOME"?"AWAY":"HOME",line:-m.line};
const key=m=>[m.type,m.pick,Number(m.line).toFixed(2)].join(":");
export function rankFromOdds(match){
 const groups=new Map(), books=new Map();
 for(const m of Array.isArray(match.markets)?match.markets:[]){
  const bookmaker=str(m.bookmaker),odd=Number(m.odds),line=Number(m.line);
  if(!bookmaker||!Number.isFinite(line)||!Number.isFinite(odd)||odd<1.15||odd>5||!["AH","OU"].includes(m.type))continue;
  const mm={type:m.type,pick:m.pick,line,odds:odd,bookmaker};
  if(mm.type==="OU"&&!(line>=1.5&&line<=4.5))continue;
  if(mm.type==="AH"&&Math.abs(line)>2.5)continue;
  books.set(bookmaker+"|"+key(mm),mm);
 }
 for(const m of books.values()){
  const opposite=books.get(m.bookmaker+"|"+key(other(m)));
  if(!opposite)continue;
  const fair=(1/m.odds)/((1/m.odds)+(1/opposite.odds));
  if(!Number.isFinite(fair))continue;
  const k=key(m);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push({fair,odds:m.odds,bookmaker:m.bookmaker});
 }
 const candidates=[];
 for(const [k,a] of groups){
  if(a.length<2)continue;
  const [type,pick,lineText]=k.split(":");
  const line=Number(lineText),fair=med(a.map(x=>x.fair)),odds=med(a.map(x=>x.odds));
  const spread=Math.max(...a.map(x=>x.fair))-Math.min(...a.map(x=>x.fair));
  if(fair<0.535||fair>0.78||odds<1.50||odds>2.45||spread>0.12)continue;
  // Explicit 1.75 precaution: never favor OVER solely because of this line.
  if(type==="OU"&&pick==="OVER"&&line===1.75&&fair<0.64)continue;
  const score=Math.round((fair-spread*0.4+Math.min(a.length,8)*0.003)*1000)/10;
  candidates.push({type,pick,line,odds:Number(odds.toFixed(3)),confidence:Number(fair.toFixed(4)),bookmaker:a[0].bookmaker,bookmakers:a.length,marketSpread:Number(spread.toFixed(4)),score});
 }
 candidates.sort((a,b)=>b.score-a.score||b.bookmakers-a.bookmakers||a.type.localeCompare(b.type));
 return candidates[0]||null;
}
export async function buildDailySnapshot(day){
 if(!validDay(day))throw Error("invalid_day");
 const already=await db.query("SELECT locked_at FROM football_snapshots WHERE day=$1::date",[day]);
 if(already.rows.length)return {ok:true,date:day,alreadyLocked:true,locked:true};
 const q=await db.query(
 "SELECT fixture_id,kickoff,league,country,home,away,markets,source,fetched_at FROM football_market_cache WHERE kickoff>= (($1::date + interval '11 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh') AND kickoff < (($1::date + interval '1 day 12 hours 5 minutes') AT TIME ZONE 'Asia/Ho_Chi_Minh') AND fetched_at > now()-interval '8 hours' ORDER BY kickoff LIMIT 700",
 [day]);
 const selected=[];
 for(const v of q.rows){
  const markets=typeof v.markets==="string"?JSON.parse(v.markets):v.markets;
  const m=rankFromOdds({markets});
  if(!m)continue;
  selected.push({id:String(v.fixture_id),league:v.league,country:v.country,home:v.home,away:v.away,kickoff:new Date(v.kickoff).toISOString(),market:{type:m.type,pick:m.pick,line:m.line,odds:m.odds,confidence:m.confidence,bookmaker:m.bookmaker},score:m.score,priority:prioritize(v.league),bookmakerCount:m.bookmakers,sourceRef:v.source,method:"bookmaker_consensus_unvalidated"});
 }
 selected.sort((a,b)=>b.priority-a.priority||b.score-a.score||a.kickoff.localeCompare(b.kickoff));
 if(!selected.length)return {ok:false,date:day,locked:false,error:"no_eligible_market_consensus",cached:q.rows.length};
 const snapshot={date:day,source:"api-football:bookmaker-consensus",locked:true,generatedAt:new Date().toISOString(),model:"R55-odds-consensus-v1",disclaimer:"Market implied probability is not a verified prediction or historical win rate.",matches:selected.slice(0,200)};
 const result=await db.query("INSERT INTO football_snapshots(day,payload,source) VALUES ($1::date,$2::jsonb,$3) ON CONFLICT(day) DO NOTHING RETURNING day",[day,JSON.stringify(snapshot),snapshot.source]);
 return {ok:true,date:day,locked:result.rows.length>0,alreadyLocked:result.rows.length===0,matches:selected.length,cached:q.rows.length,method:snapshot.model};
}