import {db,config} from "hatchable";
const HOST="https://v3.football.api-sports.io";
const UTC=new Intl.DateTimeFormat("en-CA",{timeZone:"UTC",year:"numeric",month:"2-digit",day:"2-digit"});
const VN=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"});
const utcDay=()=>UTC.format(new Date());
export const vnToday=()=>VN.format(new Date());
// Operational football day begins at 13:00 Vietnam time; before that show yesterday's locked snapshot.
export const vnWindowDay=()=>VN.format(new Date(Date.now()-13*3600000));
const s=x=>String(x??"").trim();
const validOdd=x=>{const n=Number(x);return Number.isFinite(n)&&n>=1.01&&n<=10?n:null};
const exact25=x=>{if(x===null||x===undefined||String(x).trim()==="")return null;const n=Number(x);return Number.isFinite(n)&&Math.abs(n)<=8&&Math.abs(n*4-Math.round(n*4))<1e-8?n:null};
export function extractMarkets(bets,bookmaker){
 const out=[];
 for(const b of Array.isArray(bets)?bets:[]){
  const name=s(b.name).toLowerCase();
  const kind=/^(asian handicap|handicap asian)$/i.test(name)?"AH":/^(goals over\/under|over\/under goals|total goals)$/i.test(name)?"OU":null;
  if(!kind)continue;
  for(const v of Array.isArray(b.values)?b.values:[]){
   const text=s(v.value);
   const odd=validOdd(v.odd);
   if(!odd)continue;
   if(v.suspended===true)continue;
   const match=kind==="OU"?/^(over|under)(?:\s+([0-9]+(?:\.[0-9]+)?))?$/i.exec(text):
     /^(home|away)(?:\s+([+-]?[0-9]+(?:\.[0-9]+)?))?$/i.exec(text);
   if(!match)continue;
   // Pre-match API-Sports odds can encode the AH/OU line in value or handicap.
   const valueLine=match[2],fieldLine=s(v.handicap);
   const line=exact25(valueLine!==undefined?valueLine:fieldLine);
   if(line===null)continue;
   if(valueLine!==undefined&&fieldLine&&exact25(fieldLine)!==null&&Math.abs(Number(valueLine)-Number(fieldLine))>0.001)continue;
   const pick=match[1].toUpperCase();
   out.push({type:kind,pick,line,odds:odd,bookmaker:s(bookmaker).slice(0,100)});
  }
 }
 return out;
}
function normalize(odds,fixture){
 const id=Number(odds.fixture?.id);
 if(!Number.isInteger(id))return null;
 const teams=fixture?.teams||{};
 const home=s(teams.home?.name),away=s(teams.away?.name);
 const league=s(fixture?.league?.name),country=s(fixture?.league?.country);
 const rawKick=fixture?.fixture?.date,dt=new Date(rawKick||"");
 if(!home||!away||!league||!Number.isFinite(dt.getTime()))return null;
 const bookmakers=[],markets=[];
 for(const b of Array.isArray(odds.bookmakers)?odds.bookmakers.slice(0,25):[]){
  const bk=s(b.name);
  const m=extractMarkets(b.bets,bk);
  if(m.length){bookmakers.push(bk);markets.push(...m)}
 }
 if(!markets.length)return null;
 return {id,kickoff:dt.toISOString(),home,away,league,country,bookmakers:[...new Set(bookmakers)],markets:markets.slice(0,250),updated:odds.update||null};
}
async function consumeQuota(){
 const r=await db.query(
 "INSERT INTO football_feed_quota(day,source,calls) VALUES ($1::date,'api-football',1) ON CONFLICT(day,source) DO UPDATE SET calls=football_feed_quota.calls+1 WHERE football_feed_quota.calls<65 RETURNING calls",
 [utcDay()]);
 return r.rows[0]?.calls||null;
}
async function apiGet(url,key){
 const used=await consumeQuota();
 if(!used)throw Error("provider_daily_quota_guard_65");
 const response=await fetch(HOST+url,{headers:{"x-apisports-key":key,"accept":"application/json"},timeout_ms:16000});
 if(!response.ok)throw Error("provider_http_"+response.status);
 const obj=await response.json();
 if(obj?.errors && ((Array.isArray(obj.errors)&&obj.errors.length)||(!Array.isArray(obj.errors)&&Object.keys(obj.errors).length))){
  throw Error("provider_response_errors");
 }
 return obj;
}
export async function checkConfig(){
 try{const key=await config.get("R55_API_FOOTBALL_KEY");return typeof key==="string"&&key.trim().length>10;}catch{return false}
}
export async function pollMarkets(){
 const key=await config.get("R55_API_FOOTBALL_KEY").catch(()=>null);
 if(!key||String(key).trim().length<10)return {ok:false,error:"provider_key_not_configured",skipped:true};
 const day=vnToday();
 const run=await db.query("INSERT INTO football_feed_runs(date,provider,state) VALUES ($1::date,'api-football','running') RETURNING id",[day]);
 const runId=run.rows[0].id;
 try{
  // A snapshot covers noon today to 12:05 tomorrow in Vietnam time.
  const nextDay=new Date(day+"T12:00:00Z");nextDay.setUTCDate(nextDay.getUTCDate()+1);
  const priorDay=new Date(day+"T12:00:00Z");priorDay.setUTCDate(priorDay.getUTCDate()-1);
  const dates=[day,nextDay.toISOString().slice(0,10)];
  // One fixture response covers prior-day completed matches as well as future games.
  const fixtures=await apiGet("/fixtures?from="+priorDay.toISOString().slice(0,10)+"&to="+dates[1]+"&timezone=Asia%2FHo_Chi_Minh",key);
  const map=new Map((Array.isArray(fixtures.response)?fixtures.response:[]).map(f=>[Number(f?.fixture?.id),f]));
  // Capture completed score only for IDs that actually appear in a previously locked snapshot.
  const past=await db.query("SELECT payload FROM football_snapshots WHERE day BETWEEN ($1::date - INTERVAL '2 days') AND $1::date",[day]);
  const pickedIds=new Set();
  for(const item of past.rows){
   let snapshot=item.payload;
   if(typeof snapshot==="string")try{snapshot=JSON.parse(snapshot)}catch{snapshot=null}
   for(const m of Array.isArray(snapshot?.matches)?snapshot.matches:[])if(/^\d+$/.test(String(m.id||"")))pickedIds.add(Number(m.id));
  }
  let resultsSaved=0;
  for(const f of map.values()){
   const id=Number(f?.fixture?.id),status=String(f?.fixture?.status?.short||"");
   const home=Number(f?.score?.fulltime?.home),away=Number(f?.score?.fulltime?.away);
   if(!pickedIds.has(id)||!["FT","AET","PEN"].includes(status)||
      f?.score?.fulltime?.home==null||f?.score?.fulltime?.away==null||
      !Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0)continue;
   const row=await db.query("INSERT INTO football_final_results(fixture_id,home_score,away_score,fixture_status) VALUES($1,$2,$3,$4) ON CONFLICT(fixture_id) DO NOTHING RETURNING fixture_id",[id,home,away,status]);
   resultsSaved+=row.rows.length;
  }
  let all=[];
  for(const feedDay of dates){
   let page=1,totalPages=1;
   while(page<=Math.min(totalPages,3)){
    const odds=await apiGet("/odds?date="+feedDay+"&timezone=Asia%2FHo_Chi_Minh&page="+page,key);
    totalPages=Math.max(1,Math.min(99,Number(odds.paging?.total)||1));
    all.push(...(Array.isArray(odds.response)?odds.response:[]));
    page++;
   }
  }
  let saved=0,markets=0;
  for(const odd of all){
   const match=normalize(odd,map.get(Number(odd.fixture?.id)));
   if(!match)continue;
   const hasFuture=new Date(match.kickoff).getTime()>=Date.now()-3600000;
   if(!hasFuture)continue;
   await db.query(
    "INSERT INTO football_market_cache(fixture_id,kickoff,league,country,home,away,markets,bookmakers,source,source_updated_at,fetched_at) VALUES ($1,$2::timestamptz,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'api-football',$9::timestamptz,now()) ON CONFLICT(fixture_id) DO UPDATE SET kickoff=EXCLUDED.kickoff,league=EXCLUDED.league,country=EXCLUDED.country,home=EXCLUDED.home,away=EXCLUDED.away,markets=EXCLUDED.markets,bookmakers=EXCLUDED.bookmakers,source_updated_at=EXCLUDED.source_updated_at,fetched_at=now()",
    [match.id,match.kickoff,match.league,match.country,match.home,match.away,JSON.stringify(match.markets),JSON.stringify(match.bookmakers),match.updated]);
   saved++;markets+=match.markets.length;
  }
  const q=await db.query("SELECT calls FROM football_feed_quota WHERE day=$1::date AND source='api-football'",[utcDay()]);
  await db.query("UPDATE football_feed_runs SET state=$2,fixture_count=$3,odds_count=$4,market_count=$5,quota_remaining=$6,finished_at=now() WHERE id=$1",[runId,"success",map.size,saved,markets,65-Number(q.rows[0]?.calls||0)]);
  return {ok:true,date:day,fixtures:map.size,withMarkets:saved,markets,resultsSaved,quotaRemaining:65-Number(q.rows[0]?.calls||0),snapshotLocked:false};
 }catch(e){
  const reason=String(e?.message||e).slice(0,180);
  await db.query("UPDATE football_feed_runs SET state='failed',reason=$2,finished_at=now() WHERE id=$1",[runId,reason]).catch(()=>{});
  return {ok:false,date:day,error:reason,snapshotLocked:false};
 }
}