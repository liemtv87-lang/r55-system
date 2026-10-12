import http from 'node:http';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';

const SOURCE='https://br-divine-resonance-az0qxt8z-kq247bdapi.compute.c-3.ap-southeast-1.aws.neon.tech/?action=football-predictions&mode=all&limit=5000&from_ts=0';
const DATA_PATH='/cache/current.json';
const PORT=3000;
let state={lastAttempt:null,lastSuccess:null,error:null,predictions:0,sourceDate:null};
let cache=null,refreshing=false;
const log=msg=>console.log(new Date().toISOString()+' '+msg);
const json=(res,code,obj)=>{
 res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-KQ247-Staging':'read-only-cache'});
 res.end(JSON.stringify(obj));
};
const localVN=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const valid=d=>d&&d.ok===true&&d.locked===true&&d.source==='neon_locked_snapshot'&&
 /^20\d{2}-\d{2}-\d{2}$/.test(d.date)&&Array.isArray(d.predictions)&&d.predictions.length>0&&d.predictions.length<=5000&&
 new Set(d.predictions.map(x=>x.id)).size===d.predictions.length&&
 d.predictions.every(p=>/^BDL_\d{5,12}$/.test(String(p.id))&&Number.isFinite(Number(p.ts))&&(p.ah||p.ou));
const ids=d=>d.predictions.map(p=>p.id).sort().join(',');
async function load(){
 try{
  const saved=JSON.parse(await readFile(DATA_PATH,'utf8'));
  if(valid(saved)){cache=saved;state.sourceDate=saved.date;state.predictions=saved.predictions.length;log('restored_locked_snapshot '+saved.date+' '+saved.predictions.length);}
 }catch(e){log('no_locked_snapshot_cache: '+String(e?.code||e?.message||e).slice(0,70));}
}
async function saveSnapshot(d){
 await mkdir('/cache',{recursive:true});
 const archived='/cache/'+d.date+'.json';
 // Keep one immutable day file. Never silently overwrite a different snapshot for the same date.
 try{
  const prior=JSON.parse(await readFile(archived,'utf8'));
  if(!valid(prior)||ids(prior)!==ids(d))throw Error('locked_day_conflict');
  d=prior;
 }catch(e){
  if(e?.code!=='ENOENT')throw e;
  await writeFile(archived+'.tmp',JSON.stringify(d),{mode:0o600,flag:'wx'});
  await rename(archived+'.tmp',archived);
 }
 await writeFile(DATA_PATH+'.tmp',JSON.stringify(d),{mode:0o600});
 await rename(DATA_PATH+'.tmp',DATA_PATH);
 return d;
}
async function refresh(){
 if(refreshing)return;
 refreshing=true;state.lastAttempt=new Date().toISOString();
 try{
  const response=await fetch(SOURCE,{signal:AbortSignal.timeout(24000),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('source_http_'+response.status);
  const body=await response.text();
  if(body.length>4_000_000||body.length<100)throw Error('invalid_payload_length_'+body.length);
  let data=JSON.parse(body);
  if(!valid(data))throw Error('locked_source_schema_invalid');
  if(cache&&data.date<cache.date)throw Error('refuse_older_source_date');
  if(cache&&data.date===cache.date&&ids(data)!==ids(cache))throw Error('frozen_snapshot_id_conflict');
  data=await saveSnapshot(data);
  cache=data;
  Object.assign(state,{lastSuccess:new Date().toISOString(),error:null,predictions:data.predictions.length,sourceDate:data.date});
  log('verified_locked_snapshot '+data.date+' '+data.predictions.length);
 }catch(e){state.error=String(e.message||e).slice(0,160);log('locked_source_failed '+state.error);}
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
   ok:!!cache,mode:'staging_persisted_immutable_daily_snapshot',
   localDate:localVN(),lastSuccess:state.lastSuccess,sourceDate:state.sourceDate,
   source:'Neon signed immutable mirror of Bongdalu R55',cachedPredictions:state.predictions,
   refreshing,lastError:state.error
 });
 if(url.pathname==='/api/main-football'){
  if(!cache)return json(res,503,{ok:false,error:'cache_not_ready'});
  const requested=Number(url.searchParams.get('limit')||30);
  const limit=Number.isFinite(requested)?Math.min(5000,Math.max(1,Math.floor(requested))):30;
  const now=Date.now();
  const future=cache.predictions.filter(p=>Number(p.ts)>now);
  const picks=url.searchParams.get('mode')==='featured'?future.filter(p=>p.top===true):future;
  const exposed={...cache,snapshot_total:cache.predictions.length,hidden_started:cache.predictions.length-future.length,
    total:picks.length,predictions:picks.slice(0,limit)};
  res.setHeader('X-KQ247-Cache-Date',cache.date);
  return json(res,200,exposed);
 }
 return json(res,404,{ok:false,error:'unknown_route'});
});
server.listen(PORT,'0.0.0.0',()=>log('immutable_r55_cache_listening_'+PORT));
