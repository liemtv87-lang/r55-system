import http from 'node:http';
import {db,closePool} from 'hatchable';
import {inspectBongdalu,inspectBongdaluHistoryProbe,resolveBongdaluBase,getBongdaluText,verifiedBongdaluInternals as V} from 'lib/bongdaluR55.js';
import {processBongdaluChunk} from 'lib/r55ChunkedBuild.js';
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
  if(hour>=13&&date>=minimum&&minute>=30&&hour%2===1&&lastGradeSlot!==hour){
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
 if(cmd==='model-batch'){
  const source=await resolveBongdaluBase();
  const xmls=await Promise.all(V.BOOKS.map(async([name,id])=>({
    name,text:await getBongdaluText(source.base,'gf/data/odds/en/goal'+id+'.xml','text/xml',12000).catch(()=>'')
  })));
  const markets=V.parseOdds(xmls);
  const records=V.parseFeed(source.js,markets);
  const now=Date.now(),day=V.vnDay();
  const end=Date.parse(day+'T06:00:00Z')+86400000+300000;
  const pool=records.filter(m=>m.ts>now&&m.ts<=end&&m.market&&!V.excluded(m.league+' '+m.home+' '+m.away))
    .sort((a,b)=>b.priority-a.priority||b.market.bookmakerCount-a.market.bookmakerCount||a.ts-b.ts);
  const wanted=Math.min(150,Math.max(1,Number(process.env.MODEL_BATCH_LIMIT||150)));
  const selected=pool.slice(0,wanted);
  const matches=[];
  let attempted=0,historyReady=0;
  for(let i=0;i<selected.length;i+=12){
    const batch=selected.slice(i,i+12);
    const history=await Promise.all(batch.map(async m=>({m,h:await V.history(source.base,m.bongdaluId)})));
    for(const {m,h} of history){
      attempted++;
      if(!h)continue;
      historyReady++;
      const forecast=V.makeMarket(m,h,[]);
      if(forecast)matches.push(forecast);
    }
    log('R55_NATIVE_MODEL_BATCH_PROGRESS',JSON.stringify({attempted,total:selected.length,historyReady,modeled:matches.length}));
  }
  const accepted=matches.filter(m=>m.market?.researchOnly===false);
  const data={ok:matches.length>=Math.min(20,selected.length),day,source:source.base,
    totalFromFeed:records.length,withMarkets:records.filter(m=>!!m.market).length,
    eligibleFuture:pool.length,attempted,historyReady,modeled:matches.length,
    qualityCandidates:accepted.length,researchOnly:matches.length-accepted.length,
    uniqueForecastIds:new Set(matches.map(m=>m.id)).size,
    examples:matches.slice(0,3).map(m=>({id:m.id,league:m.league,market:m.market.type,choice:m.market.pick,line:m.market.line,odds:m.market.odds}))};
  log('R55_NATIVE_MODEL_BATCH',JSON.stringify(data));
  if(!data.ok||data.uniqueForecastIds!==data.modeled)throw Error('native_batch_incomplete');
  return;
 }
 if(cmd==='snapshot-status'){log('NATIVE_SNAPSHOT_STATUS',JSON.stringify(await report()));return;}
 if(cmd==='grade'){const x=await grade();if(!x.ok)process.exitCode=2;return;}
 if(cmd!=='serve')throw Error('unknown_command');
 await dbReady();
 const server=http.createServer(async(req,res)=>{
  if(req.method!=='GET'||req.url?.split('?')[0]!=='/healthz'){res.writeHead(404);res.end();return;}
  try{const result=await report();res.writeHead(result.ok?200:503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));}
  catch(e){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,error:String(e.message||e)}));}
 });
 server.listen(PORT,'0.0.0.0',()=>log('R55_NATIVE_SHADOW_RUNNING on '+PORT+' earliest official='+minimum));
 setInterval(()=>void tick(),DELAY).unref();
 await tick();
}
try{await run()}catch(e){log('R55_NATIVE_FATAL',String(e.stack||e));process.exitCode=1;}
if(process.argv[2]&&process.argv[2]!=='serve')await closePool().catch(()=>{});
