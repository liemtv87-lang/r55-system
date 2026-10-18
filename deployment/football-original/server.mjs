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
