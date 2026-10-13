// Original XSMB/XSMT/XSMN user interface, read through from the production
// Neon HTML function without reimplementing or changing any prediction logic.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const PORT=3004;
const REGIONS=new Set(['xsmb','xsmt','xsmn']);
const UPSTREAM='https://br-divine-resonance-az0qxt8z-kq247web.compute.c-3.ap-southeast-1.aws.neon.tech/';
const CLIENT='/app/public/client-vps.html';
let requestCount=0,errorCount=0,lastCheck=null,lastError=null,upstreamSnapshotBytes=0;
const send=(res,code,body,type='application/json; charset=utf-8')=>{
 res.writeHead(code,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(typeof body==='string'?body:JSON.stringify(body));
};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{ok:false,error:'read_only'});
  const u=new URL(req.url,'http://localhost'),region=u.searchParams.get('region')||'xsmb';
  if(u.pathname==='/healthz'){
   return send(res,200,{ok:true,service:'KQ247 XS ORIGINAL-UI VPS',
    regions:[...REGIONS],neonOriginalReadThrough:true,backendMigrated:false,
    requests:requestCount,errors:errorCount,lastCheck,lastError,upstreamSnapshotBytes});
  }
  if(!REGIONS.has(region))return send(res,400,{ok:false,error:'invalid_region'});
  if(['/xoso-khach','/xoso-khach/','/lottery/client.html'].includes(u.pathname)){
   const html=await readFile(CLIENT,'utf8');
   return send(res,200,req.method==='HEAD'?'':html,'text/html; charset=utf-8');
  }
  if(!['/xoso','/xoso/','/lottery','/lottery/'].includes(u.pathname))
   return send(res,404,{ok:false,error:'not_found'});
  const src=new URL(UPSTREAM);
  src.searchParams.set('region',region);
  for(const k of ['station','date','target']){
    const value=u.searchParams.get(k);
    if(value&&value.length<=100&&!/[<>\x00-\x1F]/.test(value))src.searchParams.set(k,value);
  }
  requestCount++;
  const r=await fetch(src.toString(),{
   headers:{accept:'text/html','user-agent':'KQ247-VinaHost-XS-Original-Source-Mirror/1.0'},
   signal:AbortSignal.timeout(10000),redirect:'follow'});
  if(!r.ok)throw Error('Neon original returned '+r.status);
  const type=r.headers.get('content-type')||'';
  if(!type.includes('text/html'))throw Error('unexpected original content type');
  const html=await r.text();
  if(html.length<3000||html.length>750000||!html.includes('<html'))
   throw Error('original UI incomplete');
  // The upstream Neon HTML uses href="/?region=xsmt" because its own
  // legacy homepage was the lottery app. On the shared VPS, "/" serves
  // football. Rebase ONLY the three lottery tab/station href links here,
  // rather than relying on redirects or changing the upstream snapshot.
  const routed=html.replace(/href=(["'])\/\?region=(xsmb|xsmt|xsmn)(?=[&"'#])/gi,
    (_match,quote,region)=>'href='+quote+'/xoso?region='+region.toLowerCase());
  upstreamSnapshotBytes=html.length;lastCheck=new Date().toISOString();lastError=null;
  return send(res,200,req.method==='HEAD'?'':routed,'text/html; charset=utf-8');
 }catch(e){
  errorCount++;lastError=String(e?.message||e).slice(0,160);
  console.error('KQ247_XS_ORIGINAL_UPSTREAM_FAILED',lastError);
  if(!res.headersSent)send(res,503,{ok:false,error:'Nguồn dự đoán gốc đang gián đoạn, không sinh số thay thế',source:'neon_original'});
 }
});
server.listen(PORT,'0.0.0.0',()=>console.log('KQ247_XS_ORIGINAL_VPS_PROXY_READY PORT='+PORT));
