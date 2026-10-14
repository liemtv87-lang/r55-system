// KQ247 3-region locked snapshot read-only browser. This service cannot generate predictions.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const dateLabel=d=>d.split('-').reverse().join('/');
function activeDay(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}
function valid(r,day){
 const x=r?.payload;
 if(!x||!['mb','mt','mn'].includes(r.region)||r.region!==x.region||r.station!==x.station||
  x.sourceDate!==r.sourceDate||x.predictionDate!==r.predictionDate||
  x.sourcePrizes!==(r.region==='mb'?27:18)||x.digitPositions!==(r.region==='mb'?107:82)||!x.allPrizesUsed||!x.allPositionsUsed||
  !x.exclusionsValidated||x.previousForecastsUsed!==false||
  x.audit?.bridgeSourceDrawCount!==1||x.audit?.bridgeSourceStation!==r.station||
  x.audit?.coveredPositions!==(r.region==='mb'?107:82)||r.predictionDate<day)throw Error('INVALID_LOCKED_SNAPSHOT');
 for(const [key,len,size] of [['lotto3',3,2],['doubles',2,2],['dan50',50,2],['dan60',60,2],['dan75',75,2],['three_digit',500,3]]){
  if(!Array.isArray(x[key])||x[key].length!==len||new Set(x[key]).size!==len||
   x[key].some(z=>typeof z!=='string'||z.length!==size||!/^\d+$/.test(z)))throw Error('INVALID_DAN_'+key);
 }
 if(x.three_digit.some(z=>!x.dan75.includes(z.slice(-2)))||
  x.dan50.some(z=>!x.dan60.includes(z))||x.dan60.some(z=>!x.dan75.includes(z))||
  x.lotto3.concat(x.doubles).some(z=>(x.audit.excludedNumbers||[]).includes(z)))throw Error('FAILED_HARD_FILTER');
 return x;
}
function pool(label,nums,id){
 return '<section><h2>'+esc(label)+' ('+nums.length+' số)</h2><div class="nums" id="'+id+'">'+
 nums.map(x=>'<b>'+esc(x)+'</b>').join(' ; ')+'</div><button onclick="copyPool(\''+id+'\')">SAO CHÉP</button></section>';
}
function page(region,records,selected){
 const opts=records.map(r=>'<a href="/xoso?region=xs'+region+'&station='+encodeURIComponent(r.station)+'">'+
 esc(r.station)+' • '+dateLabel(r.predictionDate)+'</a>').join('');
 const title=region==='mb'?'XSMB':region==='mt'?'XSMT':'XSMN';
 const x=selected?.payload;
 let body='<section><h2>Chọn đài để xem snapshot đã khóa</h2></section>';
 if(x){
  body='<h1>'+title+' • '+esc(selected.station)+' • '+dateLabel(selected.predictionDate)+'</h1>'+
   '<p class="info">Chỉ dùng tất cả '+(region==='mb'?'27 giải (107 vị trí)':'18 giải (82 vị trí)')+' kỳ '+dateLabel(selected.sourceDate)+
   ' của chính đài '+esc(selected.station)+'. Snapshot PostgreSQL VPS đã khóa, chỉ đọc.</p>'+
   '<section><h2>3 LÔ BẠCH THỦ</h2><p class="picks">'+x.lotto3.map(esc).join(' – ')+'</p>'+
   '<h2>2 LÔ KÉP</h2><p class="picks">'+x.doubles.map(esc).join(' – ')+'</p></section>'+
   pool('DÀN ĐỀ 50',x.dan50,'d50')+pool('DÀN ĐỀ 60',x.dan60,'d60')+
   pool('DÀN ĐỀ 75',x.dan75,'d75')+pool('DÀN 3 CÀNG',x.three_digit,'three');
 }
 return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>KQ247 • '+title+'</title><style>body{margin:0;background:#f0f5fb;font:15px system-ui,sans-serif;color:#24425d}header{padding:14px;background:white}main{margin:auto;max-width:980px;padding:12px}h1,h2{color:#a61c30}h1{font-size:21px}h2{font-size:18px}nav,aside{display:flex;gap:8px;flex-wrap:wrap}nav a,aside a{padding:9px;background:#e1ecfc;border-radius:8px;color:#18569a;text-decoration:none;font-weight:bold}section{padding:14px;background:white;border-radius:10px;margin:13px 0}.nums{line-height:2.2;color:#0564bc;overflow-wrap:anywhere}.nums b{font-size:17px}.picks{font-weight:950;font-size:27px;color:#085eb5}button{margin-top:10px;padding:8px 12px;border:0;background:#065eae;color:#fff;border-radius:7px;font-weight:bold}.info{font-size:13px}</style></head><body>'+
 '<header><strong>KQ247 • PHÂN TÍCH XỔ SỐ</strong><nav><a href="/xoso?region=xsmb">MB</a><a href="/xoso?region=xsmt">MT</a><a href="/xoso?region=xsmn">MN</a></nav></header>'+
 '<main><p class="info">Dự đoán chỉ mang tính tham khảo, không bảo đảm trúng thưởng.</p><aside>'+opts+
 '</aside>'+body+'<section><h2>📢 TOOL KQ247</h2><p>Tool XSMB/MT/MN • Bóng đá • Vietlott • Free 10 ngày</p>'+
 '<p><a href="https://t.me/xsbm999">Nhóm xổ số</a> • <a href="https://t.me/keochuyengia79">Nhóm bóng đá</a></p></section></main>'+
 '<script>function copyPool(id){navigator.clipboard.writeText(document.getElementById(id).innerText.trim()).catch(()=>{})}</script></body></html>';
}
function reply(res,status,body,type='text/html; charset=utf-8'){
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'private,no-store,max-age=0','X-Content-Type-Options':'nosniff',
 'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"});res.end(body);
}
http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method))return reply(res,405,'Read only','text/plain');
 try{
  const u=new URL(req.url,'http://localhost'),d=activeDay();
  let records=[];
  try{
   const raw=JSON.parse(await readFile('/locked/station-locked-index.json','utf8'));
   if(raw.type!=='READ_ONLY_LOCKED_STATION_PREDICTIONS'||!Array.isArray(raw.records))throw Error('INVALID_INDEX');
   records=raw.records.filter(x=>{try{valid(x,d);return true;}catch{return false;}});
  }catch(e){console.error('NO_LOCKED_INDEX',e.message);return reply(res,503,'Chưa có snapshot đã khóa');}
  if(u.pathname==='/healthz')return reply(res,200,JSON.stringify({ok:true,readonly:true,mt:records.filter(r=>r.region==='mt').length,
    mn:records.filter(r=>r.region==='mn').length,mb:records.filter(r=>r.region==='mb').length}),'application/json');
  const r=u.searchParams.get('region'),region=r==='xsmb'?'mb':r==='xsmt'?'mt':r==='xsmn'?'mn':null;
  if(!region||!['/xoso','/xoso/'].includes(u.pathname))return reply(res,404,'Not found','text/plain');
  const available=records.filter(x=>x.region===region).sort((a,b)=>a.predictionDate.localeCompare(b.predictionDate)||a.station.localeCompare(b.station,'vi'));
  if(!available.length)return reply(res,503,'Chưa có snapshot mới đã khóa của miền này');
  const station=u.searchParams.get('station'),selected=station?available.find(x=>x.station===station):available[0];
  if(!selected)return reply(res,404,'Đài chưa có snapshot hợp lệ');
  return reply(res,200,req.method==='HEAD'?'':page(region,available,selected));
 }catch(e){console.error('SNAPSHOT_VIEW_ERROR',e.message);return reply(res,503,'Chờ snapshot','text/plain');}
}).listen(3019,'0.0.0.0',()=>console.log('KQ247_MT_MN_READONLY_STAGED'));
