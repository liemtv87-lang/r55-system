import {db,scheduler} from "hatchable";
import {resolveBongdaluBase,getBongdaluText,verifiedBongdaluInternals as V} from "lib/bongdaluR55.js";
const save=(scope,data)=>db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[scope,JSON.stringify(data)]);
const read=async scope=>(await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1 LIMIT 1",[scope])).rows[0]?.payload||null;
const hourVN=()=>Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
const slim=m=>{const {market,home,away,league,country,ts,kickoff,id,bongdaluId,sourceRef,score,method,bookmakerCount,history,provider,learningPriority,priority}=m;return{market,home,away,league,country,ts,kickoff,id,bongdaluId,sourceRef,score,method,bookmakerCount,history,provider,learningPriority,priority}};
const futureAtWrite=matches=>matches.filter(m=>{const ts=Date.parse(String(m?.kickoff||""));return Number.isFinite(ts)&&ts>Date.now()});
export async function processBongdaluChunk(mode){
 if(!["provisional","official"].includes(mode))throw Error("invalid_mode");
 const day=V.vnDay(),hour=hourVN(),official=mode==="official";
 if(official&&hour<13)return {ok:false,day,locked:false,error:"official_lock_before_13h_forbidden"};
 if(!official&&hour>=13)return {ok:false,day,locked:false,error:"provisional_window_closed"};
 if(official){
  const prev=await db.query("SELECT source,locked_at,jsonb_array_length(COALESCE(payload->'matches','[]'::jsonb)) AS n FROM football_snapshots WHERE day=$1::date",[day]);
  if(prev.rows.length){
   if(prev.rows[0].source!=="bongdalu-r55")return {ok:false,day,error:"previous_non_bongdalu_lock_preserved"};
   return {ok:true,day,completed:true,alreadyLocked:true,locked:true,eligible:prev.rows[0].n,lockedAt:prev.rows[0].locked_at};
  }
 }
 const scope="r55_build_"+mode+"_"+day;
 let state=await read(scope);
 if(!state){
  // The 13:00 scan must re-fetch the live feed and odds. Reuse only the
  // already-verified Bongdalu HOST from preflight to avoid slow rediscovery.
  // Never reuse provisional odds or treat them as the official snapshot.
  let rr=null;
  const preflight=official?await read("r55_build_provisional_"+day):null;
  if(preflight?.source){
   try{
    const js=await getBongdaluText(preflight.source,"gf/data/bf_vn1_nt.js","*/*",7500);
    if(js.split("A[").length>=21)rr={base:preflight.source,js};
   }catch{}
  }
  if(!rr)rr=await resolveBongdaluBase();
  const xmls=await Promise.all(V.BOOKS.map(async ([name,id])=>({name,text:await getBongdaluText(rr.base,"gf/data/odds/en/goal"+id+".xml","text/xml",9000).catch(()=>"")})));
  const odds=V.parseOdds(xmls);
  if(odds.size<50)return {ok:false,day,error:"bongdalu_verified_odds_insufficient",odds:odds.size};
  const all=V.parseFeed(rr.js,odds),now=Date.now();
  const start=Date.parse(day+"T06:00:00Z"),end=start+86400000+300000;
  // Only fixtures strictly after the live scan time can enter a new forecast.
  // A 5-minute look-back would incorrectly permit already-started matches.
  // Count every division, but only fixtures with actually published/priced AH and O/U.
  const priced=k=>k&&["homePrice","awayPrice","overPrice","underPrice"].every(n=>
    Number.isFinite(Number(k[n]))&&Number(k[n])>1.05&&Number(k[n])<=4);
  const pool=all.filter(m=>Number.isFinite(m.ts)&&m.ts>now&&m.ts<=end&&priced(m.market))
   .sort((a,b)=>b.priority-a.priority||b.market.bookmakerCount-a.market.bookmakerCount||a.ts-b.ts);
  if(pool.length===0)return {ok:false,day,error:"no_verified_priced_bongdalu_fixture",marketPool:0};
  const manifest={day,mode,cursor:0,pool,source:rr.base,sourceFixtureCount:all.length,matches:[],startedAt:new Date().toISOString()};
  await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO NOTHING",[scope,JSON.stringify(manifest)]);
  state=await read(scope);
 }
 if(!state||state.day!==day||state.mode!==mode)return {ok:false,day,error:"build_state_missing_or_wrong_day"};
 const start=Number(state.cursor||0),end=Math.min(start+60,state.pool.length);
 if(start>=state.pool.length){
  const ordered=[...(Array.isArray(state.matches)?state.matches:[])].sort((a,b)=>b.priority-a.priority||b.score-a.score||a.ts-b.ts);
  const lockedMatches=official?futureAtWrite(ordered):ordered;
  const payload={date:day,source:"Bongdalu verified H2H/AH/OU",model:"R55 Bongdalu Ensemble v3",locked:official,provisional:!official,
   generatedAt:new Date().toISOString(),oneMarketPerMatch:true,bookmakers:V.BOOKS.map(x=>x[0]),matches:lockedMatches,
   scanProgress:{checked:state.pool.length,marketPool:state.pool.length,complete:true,
     qualityCandidates:lockedMatches.filter(m=>m.market?.researchOnly===false).length,
     shadowOnly:lockedMatches.filter(m=>m.market?.researchOnly!==false).length},disclaimer:"Statistical model; predictions are not guaranteed."};
  if(!official){
   const prev=await read("r55_provisional_"+day);
   if(!prev?.scanProgress?.complete||!Array.isArray(prev?.matches)||prev.matches.length<ordered.length)await save("r55_provisional_"+day,payload);
   return {ok:true,day,mode,locked:false,provisional:true,completed:true,alreadyCompleted:true,eligible:ordered.length,checked:start,marketPool:state.pool.length,source:state.source};
  }
  // If a worker crashed after the last cursor commit but before insertion,
  // finish atomically from the verified saved work, without redoing the model.
  if(!state.pool.length||lockedMatches.length<Math.ceil(state.pool.length*.8))return {ok:false,day,error:"native_coverage_below_80_percent",eligible:lockedMatches.length,marketPool:state.pool.length};
  const wrote=await db.query("INSERT INTO football_snapshots(day,payload,source) VALUES($1::date,$2::jsonb,'bongdalu-r55') ON CONFLICT(day) DO NOTHING RETURNING day",[day,JSON.stringify(payload)]);
  if(!wrote.rows.length)return {ok:false,day,error:"day_already_locked_by_another_writer_no_override"};
  return {ok:true,day,mode,locked:true,completed:true,recoveredFinalization:true,eligible:lockedMatches.length,checked:start,marketPool:state.pool.length,source:state.source};
 }
 const learned=(await read("r55_method_rank"))?.methods||[];
 const chunk=state.pool.slice(start,end);
 const rows=[];
 for(let n=0;n<chunk.length;n+=12){
  rows.push(...await Promise.all(chunk.slice(n,n+12).map(async m=>({m,h:await V.history(state.source,m.bongdaluId,m.ts)}))));
 }
 const batch=rows.map(({m,h})=>h?V.makeMarket(m,h,learned):null).filter(Boolean).map(slim);
 const merged=[...(Array.isArray(state.matches)?state.matches:[]),...batch];
 const updated={...state,cursor:end,matches:merged,lastUpdated:new Date().toISOString()};
 const commit=await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1 AND COALESCE((payload->>'cursor')::int,0)=$3 RETURNING scope",[scope,JSON.stringify(updated),start]);
 if(!commit.rows.length)return {ok:false,day,error:"concurrent_chunk_conflict_retry",cursor:start};
 const complete=end>=state.pool.length;
 const ordered=merged.sort((a,b)=>b.priority-a.priority||b.score-a.score||a.ts-b.ts);
 const lockedMatches=official&&complete?futureAtWrite(ordered):ordered;
 const payload={date:day,source:"Bongdalu verified H2H/AH/OU",model:"R55 Bongdalu Ensemble v3",locked:official&&complete,provisional:!official,
  generatedAt:new Date().toISOString(),oneMarketPerMatch:true,bookmakers:V.BOOKS.map(x=>x[0]),matches:lockedMatches,
  scanProgress:{checked:end,marketPool:state.pool.length,complete,
   qualityCandidates:lockedMatches.filter(m=>m.market?.researchOnly===false).length,
   shadowOnly:lockedMatches.filter(m=>m.market?.researchOnly!==false).length},disclaimer:"Statistical model; predictions are not guaranteed."};
 if(!official){
  const previous=await read("r55_provisional_"+day);
  const previousCount=Array.isArray(previous?.matches)?previous.matches.length:0;
  if(complete||ordered.length>=previousCount)await save("r55_provisional_"+day,payload);
 }
 if(complete&&official){
  if(!state.pool.length||lockedMatches.length<Math.ceil(state.pool.length*.8))return {ok:false,day,error:"native_coverage_below_80_percent",eligible:lockedMatches.length,checked:end,marketPool:state.pool.length};
  const wrote=await db.query("INSERT INTO football_snapshots(day,payload,source) VALUES($1::date,$2::jsonb,'bongdalu-r55') ON CONFLICT(day) DO NOTHING RETURNING day",[day,JSON.stringify(payload)]);
  if(!wrote.rows.length)return {ok:false,day,error:"day_already_locked_by_another_writer_no_override"};
 }
 let queue=null;
 if(!complete){
  try{
   queue=await scheduler.at(new Date(Date.now()+10000),official?"/api/jobs/noon-lock":"/api/jobs/stage-forecast",{
    name:"r55-"+mode+"-"+day+"-"+end,payload:{day,mode,expectedCursor:end}});
  }catch(e){queue={error:String(e.message||e).slice(0,130)}}
 }
 return {ok:true,day,mode,locked:official&&complete,provisional:!official,completed:complete,eligible:lockedMatches.length,checked:end,marketPool:state.pool.length,source:state.source,scheduled:!!(queue&&!queue.error),queueError:queue?.error||null};
}