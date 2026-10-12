// Minimal Node adapter: execute unmodified public Hatchable handlers on the VPS.
// Scheduler/admin/customer authentication routes are intentionally NOT exposed here.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {db} from 'hatchable';
import main from './api/main-football.js';
import health from './api/health.js';
const PORT=3002,PUBLIC=resolve('/app/public'),MAX_STATIC=2_000_000;
const log=e=>console.error(new Date().toISOString(),'R55_ORIGINAL_HANDLER_ERROR',String(e?.message||e).slice(0,180));
const json=(res,code,body)=>{res.statusCode=code;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify(body));};
const handlers={'/api/main-football':main,'/api/health':health};
// Continuity only: if the original VPS database has no daily snapshot yet,
// read the existing VERIFIED immutable Bongdalu/Neon cache. Never rewrite it,
// never turn an unverified research selection into a validated one.
async function readExistingLockedMirror(url,original){
  const r=await fetch('http://football-cache:3000/api/main-football?limit=5000&from_ts=0',{
    signal:AbortSignal.timeout(6000),headers:{accept:'application/json'}});
  if(!r.ok)throw Error('r55_mirror_http_'+r.status);
  const d=await r.json();
  if(d?.ok!==true||d?.locked!==true||d?.source!=='neon_locked_snapshot'||!Array.isArray(d.predictions))throw Error('r55_mirror_not_verified');
  const ids=new Set(),now=Date.now();
  const all=d.predictions.filter(x=>{
    if(!x?.id||ids.has(x.id)||!(Number(x.ts)>now)||Boolean(x.ah)===Boolean(x.ou))return false;
    ids.add(x.id);return true;
  }).map(x=>({...x,trusted_pick:false,research_only:true,
    verification_status:'legacy_locked_research_unvalidated',
    ah_release:!!x.ah,ou_release:!!x.ou,learning_methods:x.learning_methods||[],
    bookmaker_names:x.bookmaker_names||[]}));
  const wanted=url.searchParams.get('mode')==='featured'?all.filter(x=>x.top===true):all;
  const limit=Math.max(1,Math.min(5000,Number(url.searchParams.get('limit'))||30));
  const selected=wanted.slice(0,limit);
  return {...original,ok:true,found:true,locked:true,provisional:false,
    date:d.date,model:'R55 Bongdalu — verified immutable fallback',
    snapshot_total:d.predictions.length,hidden_started:d.predictions.length-all.length,
    total:wanted.length,predictions:selected,
    updated_at:d.updated_at||null,
    daily_stats:original.daily_stats||[],method_performance:original.method_performance||[],
    learning_ready:original.learning_ready||false,
    source:'neon_locked_snapshot',legacyFallback:true,stale:d.date!==new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
    note:'Nguồn dự phòng là snapshot đã khóa; chưa có bản chấm chính thức của VPS. Dự đoán chỉ để tham khảo.'};
}

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.txt':'text/plain; charset=utf-8','.xml':'application/xml'};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){json(res,405,{ok:false,error:'read_only'});return;}
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/healthz'){
    const r=await db.query('SELECT count(*)::int AS n FROM football_snapshots');
    json(res,200,{ok:true,service:'r55-original-source-vps',db:true,snapshotDays:r.rows[0]?.n||0,authRoutesPublic:false});
    return;
  }
  if(Object.hasOwn(handlers,u.pathname)){
    req.query=Object.fromEntries(u.searchParams.entries());
    let captured=null;
    const adapter={
      status(code){res.statusCode=code;return this;},
      setHeader(key,value){res.setHeader(key,value);return this;},
      json(body){captured=body;return this;}
    };
    await handlers[u.pathname](req,adapter);
    if(captured===null){json(res,500,{ok:false,error:'handler_missing_response'});return;}
    if(u.pathname==='/api/main-football'&&!captured.found){
      try{captured=await readExistingLockedMirror(u,captured);res.statusCode=200;}
      catch(e){log(e);}
    }
    json(res,res.statusCode||200,captured);
    return;
  }
  let path;
  try{path=decodeURIComponent(u.pathname);}catch{json(res,400,{ok:false,error:'invalid_path'});return;}
  if(path==='/'||path==='')path='/index.html';
  const file=resolve(PUBLIC,'.'+path);
  if(file!==PUBLIC&&!file.startsWith(PUBLIC+sep)){json(res,403,{ok:false,error:'forbidden'});return;}
  const type=MIME[extname(file).toLowerCase()];
  if(!type){json(res,404,{ok:false,error:'not_found'});return;}
  try{
    const content=await readFile(file);
    if(content.length>MAX_STATIC){json(res,413,{ok:false,error:'oversize'});return;}
    res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(content);
  }catch(e){json(res,e?.code==='ENOENT'?404:500,{ok:false,error:'not_found'});}
 }catch(e){log(e);if(!res.writableEnded)json(res,503,{ok:false,error:'original_service_unavailable'});}
});
server.listen(PORT,'0.0.0.0',()=>console.log('R55_ORIGINAL_SOURCE_ADAPTER_READY port='+PORT));
