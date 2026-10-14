import http from 'node:http';
import {db,closePool} from 'hatchable';
import {publicHandler} from './publicApi.mjs';
import {inspectBongdalu,inspectBongdaluHistoryProbe,resolveBongdaluBase,getBongdaluText,verifiedBongdaluInternals as V} from 'lib/bongdaluR55.js';
import {processBongdaluChunk} from 'lib/r55ChunkedBuild.js';
import {isR55IgnoredFixture} from 'lib/r55FixtureExclusions.js';
import {gradeAndLearn} from 'lib/r55Ops.js';

const PORT=3001,DELAY=60_000;
const minimum=process.env.NATIVE_MIN_DAY||'2099-01-01';
const dayVN=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hourVN=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
const minuteVN=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',minute:'2-digit'}).format(new Date()));
const state={lastProbe:null,lastProbeOK:false,source:null,lastBuild:null,lastBuildStatus:null,lastGrade:null,lastGradeOK:null,lastError:null,active:false,at:new Date().toISOString()};
const log=(...args)=>console.log(new Date().toISOString(),...args.map(x=>typeof x==='string'?x:JSON.stringify(x)));
async function dbReady(){const r=await db.query('SELECT 1 AS ready');return r.rows?.[0]?.ready===1;}
async function probe(){
 const x=await inspectBongdalu();
 state.lastProbe=new Date().toISOString();state.lastProbeOK=x.eligibleWindowMarket>=20;
 state.source=x.base;state.lastError=null;
 log('NATIVE_BONGDALU_SOURCE',JSON.stringify({url:x.base,fixtureCount:x.fixtureCount,marketCount:x.marketCount,oddsCount:x.oddsCount,eligibleWindowMarket:x.eligibleWindowMarket}));
 return x;
}
async function status(){
 const q=await db.query("SELECT day::text,source,locked_at,jsonb_array_length(payload->'matches')::int AS matches FROM football_snapshots ORDER BY day DESC LIMIT 8");
 return q.rows;
}
async function build(mode){
 state.active=true;state.lastBuild=new Date().toISOString();state.lastBuildStatus='working';
 try{
  const outputs=[];
  for(let i=0;i<45;i++){
   const r=await processBongdaluChunk(mode);
   outputs.push({ok:r.ok,completed:r.completed,day:r.day,eligible:r.eligible,checked:r.checked,marketPool:r.marketPool,error:r.error||null});
   log('R55_NATIVE_CHUNK',JSON.stringify(outputs.at(-1)));
   if(!r.ok){state.lastError=r.error||'native_chunk_failed';state.lastBuildStatus='failed';return {ok:false,iterations:i+1,last:r};}
   if(r.completed){state.lastError=null;state.lastBuildStatus=mode==='official'?'locked':'provisional_complete';return {ok:true,iterations:i+1,last:r};}
  }
  state.lastBuildStatus='too_many_chunks';return {ok:false,error:'excessive_chunk_count',iterations:outputs.length};
 }finally{state.active=false;}
}
async function grade(){
 state.active=true;
 try{
  const a=await gradeAndLearn();
  state.lastGrade=new Date().toISOString();state.lastGradeOK=a.ok;
  if(!a.ok)state.lastError=a.source?.error||'grade_failed';
  log('R55_NATIVE_GRADE',JSON.stringify({ok:a.ok,days:a.days.length,methods:a.ranking.length,learningReady:a.learningReady,source:a.source?.source,confirmed:a.source?.confirmed}));
  return {ok:a.ok,days:a.days.length,methods:a.ranking.length,learningReady:a.learningReady,source:a.source};
 }finally{state.active=false;}
}
async function report(){
 const items=await status();
 const health={ok:await dbReady(),engine:'r55_native_vps',mode:'shadow_no_telegram_no_customer_cutover',date:dayVN(),minOfficialDay:minimum,
  ...state,snapshots:items};
 return health;
}
const onceKey=(kind,date)=>kind+'_'+date;
async function finishJob(key,ok,details){
 await db.query("INSERT INTO r55_native_runs(job_key,completed_at,ok,summary) VALUES($1,now(),$2,$3::jsonb) ON CONFLICT(job_key) DO UPDATE SET completed_at=now(),ok=EXCLUDED.ok,summary=EXCLUDED.summary",[key,ok,JSON.stringify(details||{})]);
}
async function successful(key){
 const q=await db.query("SELECT ok FROM r55_native_runs WHERE job_key=$1 LIMIT 1",[key]);
 return q.rows[0]?.ok===true;
}
let inTick=false,lastGradeSlot=-1,lastBuildSlot=-1;
async function tick(){
 if(inTick||state.active)return;
 inTick=true;
 try{
  const date=dayVN(),hour=hourVN(),minute=minuteVN(),slot=hour*6+Math.floor(minute/10);
  if(hour>=11&&hour<=12){
   const key=onceKey('preflight',date);
   if(!await successful(key)&&minute<=20){
    try{const p=await probe(); await finishJob(key,p.eligibleWindowMarket>=20,{eligible:p.eligibleWindowMarket,marketCount:p.marketCount});}
    catch(e){log('NATIVE_PREFLIGHT_FAILED',String(e.message||e));}
   }
   if(hour>=11&&minute>=15&&lastBuildSlot!==slot){
    lastBuildSlot=slot;
    try{await build('provisional')}catch(e){state.lastError=String(e.message||e);log('NATIVE_PREVIEW_FAILED',state.lastError);}
   }
  }
  // Never touch today's official lock when this shadow system starts midday.
  // The earliest eligible cycle is explicitly configured on deployment.
  if(date>=minimum&&hour>=13&&hour<=23&&lastBuildSlot!==slot){
   lastBuildSlot=slot;
   const locked=(await status()).some(x=>x.day===date&&x.source==='bongdalu-r55');
   if(!locked){
    try{await build('official')}catch(e){state.lastError=String(e.message||e);log('NATIVE_OFFICIAL_FAILED',state.lastError);}
   }
  }
  // Grade from 13:30 VN onward. On a redeploy/restart after 13:30,
  // immediately run the missed grade instead of waiting until 15:30.
  // This is necessary because the Telegram report waits for a fresh FT sync.
  const afterReportDeadline=hour>13||(hour===13&&minute>=30);
  const regularGrade=hour>=13&&hour%2===1&&minute>=30&&lastGradeSlot!==hour;
  if(date>=minimum&&afterReportDeadline&&(lastGradeSlot===-1||regularGrade)){
   lastGradeSlot=hour;
   try{await grade()}catch(e){state.lastError=String(e.message||e);log('NATIVE_GRADE_FAILED',state.lastError);}
  }
 }catch(e){state.lastError=String(e.message||e);log('NATIVE_TICK_FAILED',state.lastError);}
 finally{inTick=false;}
}
async function run(){
 const cmd=process.argv[2]||'serve';
 if(cmd==='probe'){await dbReady();const p=await probe();log('NATIVE_PROBE_OK='+Boolean(p.fixtureCount>20&&p.marketCount>20));return;}
 if(cmd==='model-probe'){
  const p=await inspectBongdaluHistoryProbe(false);
  log('R55_NATIVE_MODEL_PROBE',JSON.stringify({source:'Bongdalu',tested:p.tested,ready:p.ready,modeled:p.results.filter(x=>!!x.prediction).length,examples:p.results.filter(x=>x.prediction).slice(0,2).map(x=>({id:x.id,league:x.league,market:x.prediction}))}));
  if(p.ready<1||p.results.every(x=>!x.prediction))throw Error('native_bongdalu_h2h_or_model_not_ready');
  return;
 }
 if(cmd==='history-all'){
  const {auditAllMarketHistories}=await import('./historyAudit.mjs');
  const audit=await auditAllMarketHistories();
  if(!audit.complete)process.exitCode=3;
  return;
 }
 if(cmd==='model-batch'){
  // Exhaustive audit: every Bongdalu fixture in the validated feed gets an
  // individual H2H/form history attempt. Only fixtures with actual AH/OU odds
  // and future kickoff inside the operative window may become forecasts.
  const source=await resolveBongdaluBase();
  const xmls=await Promise.all(V.BOOKS.map(async([name,id])=>({
    name,id,text:await getBongdaluText(source.base,'gf/data/odds/en/goal'+id+'.xml','text/xml',12000).catch(()=>'')
  })));
  const markets=V.parseOdds(xmls),records=V.parseFeed(source.js,markets);
  const now=Date.now(),day=V.vnDay();
  const end=Date.parse(day+'T06:00:00Z')+86400000+300000;
  // User denominator: ALL divisions with genuinely priced AH/O-U, never only majors.
  const priced=k=>k&&["homePrice","awayPrice","overPrice","underPrice"].every(n=>
    Number.isFinite(Number(k[n]))&&Number(k[n])>1.05&&Number(k[n])<=4);
  const eligible=records.filter(m=>m.ts>now&&m.ts<=end&&priced(m.market)&&!isR55IgnoredFixture(m));
  const eligibleIds=new Set(eligible.map(m=>m.id));
  const matches=[],exceptions=[],missingHistory=[];
  let attempted=0,historyReady=0,full20Both=0,partial20=0,h2hAvailable=0,modelAttempted=0;
  for(let i=0;i<records.length;i+=8){
    const batch=records.slice(i,i+8);
    const histories=await Promise.all(batch.map(async m=>{
      try{return {m,h:await V.history(source.base,m.bongdaluId,m.ts),err:null}}
      catch(e){return {m,h:null,err:String(e?.message||e).slice(0,100)}}
    }));
    for(const {m,h,err} of histories){
      attempted++;
      if(!h){
        missingHistory.push(m.id);
        if(err)exceptions.push({id:m.id,reason:err});
        continue;
      }
      historyReady++;
      if(Number(h.home?.n)>=20&&Number(h.away?.n)>=20)full20Both++;
      else partial20++;
      if(Number(h.h2h?.n)>0)h2hAvailable++;
      if(!eligibleIds.has(m.id))continue;
      modelAttempted++;
      try{
        const p=V.makeMarket(m,h,[]);
        if(p)matches.push(p);
      }catch(e){exceptions.push({id:m.id,reason:'model:'+String(e?.message||e).slice(0,80)})}
    }
    log('R55_NATIVE_FULL_HISTORY_PROGRESS',JSON.stringify({
      checked:attempted,all:records.length,historyReady,missing:missingHistory.length,
      full20Both,eligible:eligible.length,modelAttempted,modeled:matches.length
    }));
  }
  const accepted=matches.filter(m=>m.market?.researchOnly===false);
  const report={ok:attempted===records.length&&records.length>0,day,
    checkedAt:new Date().toISOString(),source:source.base,feedFixtures:records.length,
    fixtureIdsUnique:new Set(records.map(m=>m.id)).size,
    withMarket:records.filter(m=>!!m.market).length,
    eligibleFuture:eligible.length,historyAttempted:attempted,historyReady,
    missingHistory:missingHistory.length,full20Both,partial20,h2hAvailable,
    modelAttempted,modeled:matches.length,qualityCandidates:accepted.length,
    researchOnly:matches.length-accepted.length,
    uniqueForecastIds:new Set(matches.map(m=>m.id)).size,
    missingSample:missingHistory.slice(0,25),
    exceptionSample:exceptions.slice(0,12)};
  // Persist counts for subsequent monitoring, not the 303 raw HTML histories.
  await db.query(
    "INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",
    ["r55_vps_exhaustive_history_"+day,JSON.stringify(report)]
  );
  log('R55_NATIVE_FULL_HISTORY_AUDIT',JSON.stringify(report));
  if(!report.ok||report.uniqueForecastIds!==report.modeled||
     report.eligibleFuture<1||report.modeled/report.eligibleFuture<.8)
   throw Error('native_80pct_coverage_requirement_failed');
  // Preserve today's immutable official lock. The new risk-adjusted picks
  // can be inspected separately as a plainly labeled fresh VPS preview.
  const preview={date:day,generatedAt:new Date().toISOString(),source:'Bongdalu',
    locked:false,preview:true,model:'R55 native risk-adjusted shadow',
    oneMarketPerMatch:true,scanProgress:{checked:attempted,marketPool:eligible.length,
      modeled:matches.length,coverage:+(100*matches.length/eligible.length).toFixed(2),
      qualityCandidates:accepted.length},matches};
  await db.query(
    "INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",
    ["r55_native_preview_"+day,JSON.stringify(preview)]
  );
  log('R55_VPS_PREVIEW_READY',JSON.stringify({day,predictions:matches.length,
    coverage:preview.scanProgress.coverage,locked:false,qualityCandidates:accepted.length}));
  return;
 }
 if(cmd==='snapshot-status'){log('NATIVE_SNAPSHOT_STATUS',JSON.stringify(await report()));return;}
 if(cmd==='grade'){const x=await grade();if(!x.ok)process.exitCode=2;return;}
 if(cmd!=='serve')throw Error('unknown_command');
 await dbReady();
 const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(await publicHandler(req,res))return;
  if(req.url?.split('?')[0]!=='/healthz'){res.writeHead(404);res.end();return;}
  try{const result=await report();res.writeHead(result.ok?200:503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));}
  catch(e){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:String(e.message||e)}));}
 });
 server.listen(PORT,'0.0.0.0',()=>log('R55_NATIVE_SHADOW_RUNNING on '+PORT+' earliest official='+minimum));
 setInterval(()=>void tick(),DELAY).unref();
 await tick();
}
try{await run()}catch(e){log('R55_NATIVE_FATAL',String(e.stack||e));process.exitCode=1;}
if(process.argv[2]&&process.argv[2]!=='serve')await closePool().catch(()=>{});
