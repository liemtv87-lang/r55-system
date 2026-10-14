import {db} from 'hatchable';
import {isR55IgnoredFixture} from './lib/r55FixtureExclusions.js';

const getVNDay=()=>new Intl.DateTimeFormat('en-CA',{
  year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Ho_Chi_Minh'
}).format(new Date());
const toInt=(s,d)=>s==='all'?5000:(s==null||s==='')?d:Number.isFinite(Number(s))?Math.min(5000,Math.max(1,Math.trunc(Number(s)))):d;
const makePick=m=>{
 const k=m.market||{},ts=Number(m.ts)||Date.parse(m.kickoff||''),top=Number(m.priority)>=175;
 return {id:m.id,ts,home:m.home,away:m.away,league:m.league,country:m.country,
  provider:'Bongdalu',method:k.method||m.method,top,
  priority:Number(m.priority||0),bookmaker_count:Number(k.bookmakers||0),
  bookmaker:k.bookmaker||null,model_state:k.researchOnly===true?'research':'uncertified',
  ah:k.type==='AH'?{line:k.line,pick:k.pick==='HOME'?'CHỦ':'KHÁCH',price:k.odds}:null,
  ou:k.type==='OU'?{line:k.line,pick:k.pick==='OVER'?'TÀI':'XỈU',price:k.odds}:null,
  // Never repeat the old mirror's "trusted" flag for unbacktested forecasts.
  trusted_pick:false,source_detail:'native_bongdalu_r55_locked'};
};
function pickList(items,url){
 const showStarted=url.searchParams.get('from_ts')==='0'||url.searchParams.get('history')==='1';
 const now=Date.now();
 const matching=items.filter(p=>showStarted||(p.ts>now));
 const selected=url.searchParams.get('mode')==='featured'?matching.filter(p=>p.top):matching;
 selected.sort((a,b)=>url.searchParams.get("mode")==="featured"?(b.priority-a.priority||a.ts-b.ts):a.ts-b.ts);
 return {matching,selected,items:selected.slice(0,toInt(url.searchParams.get('limit'),30))};
}
async function locked(){
 const q=await db.query("SELECT day::text AS date,payload,locked_at FROM football_snapshots ORDER BY day DESC LIMIT 1");
 return q.rows[0]||null;
}
async function legacy(){
 const r=await fetch('http://football-cache:3000/api/main-football?limit=5000&from_ts=0',{
  headers:{accept:'application/json'},signal:AbortSignal.timeout(6500)});
 if(!r.ok)throw Error('verified_legacy_cache_http_'+r.status);
 const d=await r.json();
 if(!d?.ok||!Array.isArray(d.predictions))throw Error('verified_legacy_cache_invalid');
 return d;
}
export async function readMainFootball(url){
 // "preview=1" is intentionally distinct from the frozen 13:00 forecast;
 // clients must opt in explicitly and it is never mislabeled as locked.
 if(url.searchParams.get('preview')==='1'){
  const day=getVNDay();
  const q=await db.query("SELECT payload,updated_at FROM football_compact_stats WHERE scope=$1 LIMIT 1",["r55_native_preview_"+day]);
  const preview=q.rows[0]?.payload;
  if(!preview?.preview||!Array.isArray(preview.matches)||preview.matches.length<1)
   throw Error('native_preview_not_ready');
  // Read-time filter corrects stale unlocked previews without mutating archives.
  const active=preview.matches.filter(m=>!isR55IgnoredFixture(m));
  const list=active.map(makePick);
  const excludedCount=preview.matches.length-active.length;
  const pool=Math.max(list.length,Number(preview.scanProgress?.marketPool||preview.matches.length)-excludedCount);
  const {matching,selected,items}=pickList(list,url);
  return {ok:true,locked:false,preview:true,source:'Bongdalu',date:day,
   model:'R55 VPS risk-adjusted live preview',source_detail:'native_live_preview_unlocked',
   snapshot_total:list.length,marketPool:pool,
   coverage:pool?+(100*list.length/pool).toFixed(2):null,updated_at:q.rows[0].updated_at,
   hidden_started:list.length-matching.length,total:selected.length,predictions:items,
   oneMarketPerMatch:true,legacyFallback:false,stale:Date.now()-Date.parse(q.rows[0].updated_at)>4*3600000};
 }
 const n=await locked();
 const currentDay=getVNDay();
 const sourceIsNative=n?.date===currentDay&&n?.payload?.source==="Bongdalu verified H2H/AH/OU";
 if(sourceIsNative){
  const raw=Array.isArray(n.payload?.matches)?n.payload.matches:[];
  const list=raw.filter(m=>!isR55IgnoredFixture(m)).map(makePick);
  const {matching,selected,items}=pickList(list,url);
  return {ok:true,locked:true,source:'Bongdalu',date:n.date,model:'R55 VPS native',
   provider:'Bongdalu',source_detail:'native_locked_snapshot',snapshot_total:list.length,
   marketPool:Number(n.payload?.scanProgress?.marketPool||0),
   coverage:Number(n.payload?.scanProgress?.marketPool)>0?+(100*list.length/Number(n.payload.scanProgress.marketPool)).toFixed(1):null,
   hidden_started:list.length-matching.length,total:selected.length,predictions:items,
   updated_at:n.locked_at,oneMarketPerMatch:true,stale:false};
 }
 // Main and customer must never fall back to yesterday's predictions.
 // The approved 13:00 frozen snapshot is served above; before that, use only
 // the genuinely collected and calculated same-day (unlocked) Bongdalu preview.
 const q=await db.query("SELECT payload,updated_at FROM football_compact_stats WHERE scope=$1 LIMIT 1",["r55_native_preview_"+currentDay]);
 const preview=q.rows[0]?.payload;
 if(!preview?.preview||preview.locked!==false||preview.date!==currentDay||!Array.isArray(preview.matches)||!preview.matches.length)
  throw Error('today_prediction_not_ready');
 const list=preview.matches.filter(m=>!isR55IgnoredFixture(m)).map(makePick);
 const {matching,selected,items:predictions}=pickList(list,url);
 return {ok:true,locked:false,preview:true,source:'Bongdalu',date:currentDay,
  source_detail:'native_live_preview_unlocked',model:preview.model||'R55 native preview',
  snapshot_total:list.length,marketPool:Number(preview.scanProgress?.marketPool||0),
  coverage:Number(preview.scanProgress?.marketPool)>0?+(100*list.length/Number(preview.scanProgress.marketPool)).toFixed(2):null,
  hidden_started:list.length-matching.length,total:selected.length,predictions,
  updated_at:q.rows[0].updated_at,oneMarketPerMatch:true,legacyFallback:false,
  stale:Date.now()-Date.parse(q.rows[0].updated_at)>4*3600000};
}
export async function publicHandler(req,res){
 let url;try{url=new URL(req.url,'http://localhost')}catch{return false}
 const path=url.pathname;
 if(!['/api/main-football','/api/health'].includes(path))return false;
 res.setHeader('content-type','application/json; charset=utf-8');
 res.setHeader('cache-control','no-store');
 res.setHeader('x-kq247-engine','vps-native');
 try{
  const x=await readMainFootball(url);
  if(path==='/api/health'){
   res.writeHead(200);res.end(JSON.stringify({ok:true,engine:'vps-native',date:x.date,
    locked:x.locked,source:x.source,legacyFallback:!!x.legacyFallback,
    snapshot_total:x.snapshot_total,marketPool:x.marketPool||null,
    coverage:x.coverage||null,stale:!!x.stale}));
  }else{res.writeHead(200);res.end(JSON.stringify(x))}
 }catch(e){
  res.writeHead(503);
  res.end(JSON.stringify({ok:false,error:'prediction_data_not_ready',detail:String(e.message||e).slice(0,120)}));
 }
 return true;
}
