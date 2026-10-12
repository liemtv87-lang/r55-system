import {db} from "hatchable";
import {settle} from "lib/r55Settlement.js";
import {vnWindowDay} from "lib/apiFootball.js";
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const cols=["picks","settled","ah_win","ah_half_win","ah_push","ah_half_loss","ah_loss","ou_win","ou_half_win","ou_push","ou_half_loss","ou_loss"];
const kinds=["ah","ou"],outcomes=["win","half_win","push","half_loss","loss"];
const archiveKeys=["n","ah_n","ou_n","ah_sum","ou_sum","ah_profit","ou_profit",...kinds.flatMap(k=>outcomes.map(o=>k+"_"+o))];
const payload=x=>typeof x==="string"?JSON.parse(x):x;
const dayRow=x=>{
 const d={...x,day:String(x.prediction_date||x.day),picks:num(x.picks),settled:num(x.settled)};
 d.due_predictions=d.picks;d.settled_due=d.settled;
 d.unresolved_due=Math.max(0,d.picks-d.settled);d.nonfinal_or_rescheduled=0;
 d.coverage_ok=d.picks>0&&d.settled>=d.picks;
 for(const type of ["ah","ou"]){
  const w=num(d[type+"_win"])+.5*num(d[type+"_half_win"]),l=num(d[type+"_loss"])+.5*num(d[type+"_half_loss"]);
  d[type+"_rate"]=w+l?+(100*w/(w+l)).toFixed(2):0;
 }
 return d;
};
const summarize=arr=>Object.fromEntries(cols.map(k=>[k,arr.reduce((n,x)=>n+num(x[k]),0)]));
const methodsOf=a=>{
 const by=new Map();
 for(const x of a){const id=String(x.method||"no_method"),o=by.get(id)||{method:id,...Object.fromEntries(archiveKeys.map(k=>[k,0]))};
  for(const k of archiveKeys)o[k]+=num(x[k]);by.set(id,o);
 }
 return [...by.values()].map(x=>{
  const rate=k=>{const w=x[k+"_win"]+.5*x[k+"_half_win"],l=x[k+"_loss"]+.5*x[k+"_half_loss"];return w+l?+(w/(w+l)).toFixed(5):0};
  return {...x,ah_score:rate("ah"),ou_score:rate("ou"),ah_roi:x.ah_n?+(x.ah_profit/x.ah_n).toFixed(5):null,ou_roi:x.ou_n?+(x.ou_profit/x.ou_n).toFixed(5):null};
 });
};
export async function getCompactR55(){
 const q=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",["r55-bongdalu-rollup"]);
 return q.rows.length?payload(q.rows[0].payload):{daily:[],methodDaily:[],methodSummary:[],rolling30:{},rolling60:{},sourceCounts:{}};
}
export async function cleanupR55(){
 const today=vnWindowDay();
 const expired=await db.query("SELECT day::text,payload FROM football_snapshots WHERE source='bongdalu-r55' AND day<($1::date-interval '7 days') ORDER BY day",[today]);
 const old=await getCompactR55();
 const seen=new Set((old.daily||[]).map(x=>String(x.prediction_date||x.day)));
 const changes=[],safeToDelete=[];
 for(const s of expired.rows){
  if(seen.has(s.day))continue;
  const games=Array.isArray(payload(s.payload)?.matches)?payload(s.payload).matches:[];
  const ids=games.map(x=>String(x.id||"").replace(/^(?:BDL_|S01_)/,"")).filter(x=>/^\d{5,12}$/.test(x));
  const finals=ids.length?await db.query("SELECT fixture_id::text AS id,home_score,away_score FROM football_final_results WHERE source='bongdalu-ft-verified' AND fixture_status='FT' AND fixture_id::text=ANY($1::text[])",[ids]):{rows:[]};
  const results=new Map(finals.rows.map(x=>[x.id,x]));
  const record={prediction_date:s.day,...Object.fromEntries(cols.map(x=>[x,0]))};
  record.picks=games.length;
  const byMethod=new Map();
  for(const m of games){
   const f=results.get(String(m.id||"").replace(/^(?:BDL_|S01_)/,""));
   if(!f)continue;
   const score=settle(m.market,num(f.home_score),num(f.away_score));
   if(!score)continue;
   record.settled++;
   const kind=m.market?.type==="AH"?"ah":"ou";record[kind+"_"+score.result]++;
   const method=String(m.method||"bookmaker_consensus_unvalidated"),x=byMethod.get(method)||{prediction_date:s.day,method,...Object.fromEntries(archiveKeys.map(k=>[k,0]))};
   x.n++;x[kind+"_n"]++;x[kind+"_sum"]+=(score.unit+1)/2;
   x[kind+"_"+score.result]++;
   x[kind+"_profit"]+=score.profitUnits;
   byMethod.set(method,x);
  }
  old.daily=Array.isArray(old.daily)?old.daily:[];
  old.methodDaily=Array.isArray(old.methodDaily)?old.methodDaily:[];
  // A day cannot be condensed while any match remains without a verified FT.
  if(record.settled!==record.picks)continue;
  safeToDelete.push(s.day);
  old.daily.push(record);
  old.methodDaily.push(...byMethod.values());
  seen.add(s.day);changes.push({day:s.day,picks:record.picks,settled:record.settled});
 }
 old.daily=(old.daily||[]).sort((a,b)=>String(a.prediction_date||a.day).localeCompare(String(b.prediction_date||b.day))).slice(-60);
 old.methodDaily=(old.methodDaily||[]).filter(x=>old.daily.some(y=>String(y.prediction_date||y.day)===String(x.prediction_date))).slice(-600);
 old.methodSummary=methodsOf(old.methodDaily);
 old.rolling30={rows:old.daily.slice(-30).length,...summarize(old.daily.slice(-30))};
 old.rolling60={rows:old.daily.length,...summarize(old.daily)};
 old.updatedAt=new Date().toISOString();
 await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated_at=now()",["r55-bongdalu-rollup",JSON.stringify(old)]);
 const confirmed=await db.query("SELECT payload->>'updatedAt' AS updated FROM football_compact_stats WHERE scope=$1",["r55-bongdalu-rollup"]);
 if(confirmed.rows[0]?.updated!==old.updatedAt)throw Error("compact_stats_verification_failed");
 const removed=await Promise.all([
  safeToDelete.length?db.query("DELETE FROM football_snapshots WHERE source='bongdalu-r55' AND day::text=ANY($1::text[])",[safeToDelete]):Promise.resolve({rowCount:0}),
  db.query("DELETE FROM football_market_cache WHERE kickoff < (($1::date + interval '12 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh')",[today]),
  db.query("DELETE FROM football_final_results WHERE fetched_at<now()-interval '30 days' AND fixture_id NOT IN (SELECT substring(m->>'id' from '[0-9]+$')::bigint FROM football_snapshots s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payload->'matches','[]'::jsonb)) m WHERE s.source='bongdalu-r55' AND m->>'id' ~ '[0-9]+$')"),
  db.query("DELETE FROM football_feed_runs WHERE date<($1::date-interval '2 days')",[today]),
  db.query("DELETE FROM football_feed_quota WHERE day<($1::date-interval '2 days')",[today]),
  db.query("DELETE FROM football_compact_stats WHERE scope LIKE 'r55_preflight_%' AND updated_at<now()-interval '14 days'")
 ]);
 return {ok:true,operationalDay:today,compactAdded:changes,expiredSnapshotsCleared:safeToDelete.length,oldMarketRowsCleared:true,rowsAffected:removed.map(x=>x.rowCount??0),statsDays:old.daily.length,methodParameters:old.methodSummary.length};
}