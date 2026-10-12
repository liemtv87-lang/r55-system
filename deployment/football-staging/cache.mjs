import http from 'node:http';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';

const SOURCE='https://kq247-r55-football.hatchable.site/api/main-football?mode=all&limit=5000';
const DATA_PATH='/cache/current.json';
const PORT=3000;
let state={lastAttempt:null,lastSuccess:null,error:null,predictions:0,sourceDate:null};
let cache=null,refreshing=false;
const log=(msg)=>console.log(new Date().toISOString()+' '+msg);
const json=(res,code,obj)=>{
 res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-KQ247-Staging':'read-only-cache'});
 res.end(JSON.stringify(obj));
};
const localVN=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const valid=(data)=>data&&data.ok===true&&data.source==='Bongdalu'&&
 /^20\d{2}-\d{2}-\d{2}$/.test(data.date)&&Array.isArray(data.predictions)&&
 data.predictions.every(p=>typeof p.id==='string'&&Number.isFinite(Number(p.ts))&&
 (p.ah||p.ou));
async function load(){
 try{
  const saved=JSON.parse(await readFile(DATA_PATH,'utf8'));
  if(valid(saved)){cache=saved;state.sourceDate=saved.date;state.predictions=saved.predictions.length;log('restored local cache '+saved.date+' '+saved.predictions.length);}
 }catch(e){log('no existing cache: '+String(e?.code||e?.message||e).slice(0,70));}
}
async function refresh(){
 if(refreshing)return;
 refreshing=true;state.lastAttempt=new Date().toISOString();
 try{
  const response=await fetch(SOURCE,{signal:AbortSignal.timeout(24000),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('source_http_'+response.status);
  const body=await response.text();
  if(body.length>4_000_000||body.length<100)throw Error('invalid_payload_length_'+body.length);
  const data=JSON.parse(body);
  if(!valid(data))throw Error('source_schema_not_valid');
  if(cache&&data.date<cache.date)throw Error('refuse_older_source_date');
  await mkdir('/cache',{recursive:true});
  await writeFile(DATA_PATH+'.tmp',JSON.stringify(data),{mode:0o600});
  await rename(DATA_PATH+'.tmp',DATA_PATH);
  cache=data;
  Object.assign(state,{lastSuccess:new Date().toISOString(),error:null,predictions:data.predictions.length,sourceDate:data.date});
  log('cache_refreshed '+data.date+' '+data.predictions.length);
 }catch(e){state.error=String(e.message||e).slice(0,160);log('cache_refresh_failed '+state.error);}
 finally{refreshing=false;}
}
await load();
await refresh();
setInterval(refresh,5*60_000).unref();
const server=http.createServer((req,res)=>{
 let url;
 try{url=new URL(req.url,'http://localhost')}catch{return json(res,400,{ok:false,error:'bad_url'})}
 if(req.method!=='GET')return json(res,405,{ok:false,error:'read_only'});
 if(url.pathname==='/healthz')return json(res,cache?200:503,{
   ok:!!cache,mode:'staging_read_only_public_predictions_cache',
   localDate:localVN(),lastSuccess:state.lastSuccess,
   sourceDate:state.sourceDate,source:'Bongdalu via R55 Hatchable',
   cachedPredictions:state.predictions,refreshing,lastError:state.error
 });
 if(url.pathname==='/api/main-football'){
  if(!cache)return json(res,503,{ok:false,error:'cache_not_ready'});
  const requested=Number(url.searchParams.get('limit')||30);
  const limit=Number.isFinite(requested)?Math.min(5000,Math.max(1,Math.floor(requested))):30;
  const picks=url.searchParams.get('mode')==='featured'?cache.predictions.filter(p=>p.top===true):cache.predictions;
  const exposed={...cache,predictions:picks.slice(0,limit)};
  res.setHeader('X-KQ247-Cache-Date',cache.date);
  return json(res,200,exposed);
 }
 return json(res,404,{ok:false,error:'unknown_route'});
});
server.listen(PORT,'0.0.0.0',()=>log('cache_api_listening_'+PORT));
