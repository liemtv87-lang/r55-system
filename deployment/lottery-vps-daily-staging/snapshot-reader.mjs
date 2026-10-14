// KQ247 XSMB immutable, read-only PostgreSQL snapshot export viewer.
// No prediction calculations, Neon requests, history reads, or writes.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
const pad=x=>String(x).padStart(2,'0');
function currentDay(){
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
  .formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const d=p.year+'-'+p.month+'-'+p.day;
 return p.hour+':'+p.minute>='19:30'?new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10):d;
}
const yesterday=d=>new Date(Date.parse(d+'T12:00:00Z')-86400000).toISOString().slice(0,10);
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const valid=(o,d)=>{
 const p=o?.prediction,sets=p?.de;
 if(!p||!sets||p.predictionDate!==d||p.sourceDate!==yesterday(d)||o.sourceDate!==yesterday(d)||
  p.region!=='mb'||p.station!=='XSMB'||p.sourceDraws!==500||
  p.lottoAudit?.coveredPositions!==107||p.lottoAudit?.supportedRules<1000||
  p.lotto3?.length!==3||p.doubles?.length!==2)throw Error('BAD_DATE_OR_MODEL');
 const tests=[['dan50',50],['dan60',60],['dan75',75],['three_digit',500]];
 for(const [key,n] of tests)if(!Array.isArray(sets[key])||sets[key].length!==n||
   new Set(sets[key]).size!==n)throw Error('BAD_POOL_'+key);
 if(sets.three_digit.some(v=>typeof v!=='string'||!/^\d{3}$/.test(v)||
  v[0]===sets.three_digit_hard_excluded_hundred||!sets.dan75.includes(v.slice(-2))))throw Error('BAD_THREE_DIGIT');
 if(sets.dan75.some(v=>typeof v!=='string'||!/^\d{2}$/.test(v)||v[0]===sets.hard_excluded_head))throw Error('BAD_DAN75');
 return p;
};
const datetag=d=>d.split('-').reverse().join('/');
const numbers=(arr,k=10)=>arr.map((x,i)=>'<b>'+esc(x)+'</b>'+((i+1)%k===0?'　':'; ')).join('');
const section=(name,arr,id)=>'<section><h2>'+esc(name)+' ('+arr.length+')</h2><div class="numbers" id="'+id+'">'+numbers(arr)+'</div><button onclick="copyGroup(\''+id+'\')">SAO CHÉP</button></section>';
function render(p,lockedAt){
 const d=p.de;
 return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>KQ247 XSMB • '+datetag(p.predictionDate)+'</title>'+
 '<style>*{box-sizing:border-box}body{background:#f0f5fb;font:15px system-ui,Arial,sans-serif;margin:0;color:#193957}header{background:#fff;border-bottom:2px solid #d0e2f5;padding:12px}main{max-width:1050px;margin:auto;padding:12px}nav{margin-top:12px;display:flex;gap:10px}nav a{background:#e4efff;border-radius:9px;padding:8px 14px;color:#125bad;text-decoration:none;font-weight:900}nav a.on{color:white;background:#0c62bc}h1,h2{color:#af2031}h1{font-size:22px}h2{font-size:18px}section{background:#fff;border-radius:14px;padding:15px;margin:12px 0;box-shadow:0 2px 9px #12345610}.numbers{line-height:2.05;color:#075dc0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.numbers b{font-size:17px;margin-right:5px}.picks{font-size:28px;font-weight:950;color:#0a62b8}button{margin-top:12px;background:#0d64ba;border:0;color:#fff;border-radius:8px;padding:10px 14px;font-weight:850;cursor:pointer}details summary{font-size:19px;color:#b12635;font-weight:900;cursor:pointer}.note{font-size:13px;background:#fff7e9;border:1px solid #e4d0a7;border-radius:7px;padding:9px}.meta{font-size:13px;color:#526a80;margin:10px 0}a{color:#ac233b;font-weight:800}</style></head><body>'+
 '<header><b style="font-size:20px;color:#1155ab">KQ247 • PHÂN TÍCH XỔ SỐ</b><nav><a class="on" href="/xoso?region=xsmb">MB</a><a href="/xoso?region=xsmt">MT</a><a href="/xoso?region=xsmn">MN</a></nav></header>'+
 '<main><p class="note">Dự đoán chỉ mang tính tham khảo. Không đảm bảo kết quả.</p>'+
 '<h1>XSMB • Dự đoán ngày '+datetag(p.predictionDate)+'</h1><p class="meta">Sử dụng đủ 27 giải ngày '+datetag(p.sourceDate)+' và 500 kỳ lịch sử; snapshot PostgreSQL VPS đã khóa '+esc(new Date(lockedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))+'.</p>'+
 '<section><h2>3 LÔ BẠCH THỦ</h2><div class="picks" id="lo3">'+p.lotto3.map(esc).join(' – ')+'</div><button onclick="copyGroup(\'lo3\')">SAO CHÉP</button>'+
 '<h2>2 LÔ KÉP</h2><div class="picks" id="kep">'+p.doubles.map(esc).join(' – ')+'</div><button onclick="copyGroup(\'kep\')">SAO CHÉP</button></section>'+
 section('DÀN ĐỀ 50 SỐ',d.dan50,'dan50')+section('DÀN ĐỀ 60 SỐ',d.dan60,'dan60')+section('DÀN ĐỀ 75 SỐ',d.dan75,'dan75')+
 '<section><details open><summary>DÀN 3 CÀNG (500 SỐ, THUỘC DÀN 75)</summary><div class="numbers" id="baCang">'+numbers(d.three_digit,15)+'</div>'+
 '<button onclick="copyGroup(\'baCang\')">SAO CHÉP 500 SỐ</button></details></section>'+
 '<section><h2>📢 TOOL KQ247</h2><p>Xổ số 3 miền • Kèo bóng đá • Vietlott 6/45, 6/55 • Free 10 ngày</p>'+
 '<p>Nhóm XS: <a href="https://t.me/xsbm999">t.me/xsbm999</a> | Nhóm bóng đá: <a href="https://t.me/keochuyengia79">t.me/keochuyengia79</a> | <a href="https://t.me/muatool_du_doan_bot">Mua tool / lấy lại mã</a></p></section>'+
 '</main><script>function copyGroup(id){navigator.clipboard.writeText(document.getElementById(id).innerText.trim()).then(()=>alert("Đã sao chép")).catch(()=>{})}</script></body></html>';
}
const fail=d=>'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<body style="font:16px system-ui;padding:20px"><h2 style="color:#a62437">XSMB '+datetag(d)+' – Chưa có snapshot mới đã khóa</h2>'+
 '<p>Đang kiểm tra dữ liệu thực tế. Không hiển thị dự đoán ngày cũ thay cho ngày mới.</p><a href="/xoso?region=xsmb">Kiểm tra lại</a></body></html>';
function send(res,status,body,type='text/html; charset=utf-8'){
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'private,no-store,max-age=0','X-Content-Type-Options':'nosniff',
 'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'"});
 res.end(body);
}
const server=http.createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method))return send(res,405,'Read-only','text/plain');
 const u=new URL(req.url,'http://localhost'),day=currentDay();
 if(u.pathname==='/healthz'){
  let ready=false;try{valid(JSON.parse(await readFile('/locked/xsmb-'+day+'.json','utf8')),day);ready=true}catch{}
  return send(res,200,JSON.stringify({ok:true,readOnly:true,source:'POSTGRES_LOCKED_EXPORT',region:'xsmb',day,hasCurrentLockedSnapshot:ready}),'application/json');
 }
 if(!['/xoso','/xoso/'].includes(u.pathname)||!['xsmb',null].includes(u.searchParams.get('region')))return send(res,404,'Not Found','text/plain');
 try{
  const o=JSON.parse(await readFile('/locked/xsmb-'+day+'.json','utf8')),p=valid(o,day);
  return send(res,200,req.method==='HEAD'?'':render(p,o.lockedAt));
 }catch(e){console.error('XSMB_LOCKED_SNAPSHOT_MISSING',day,String(e.message).slice(0,120));
  return send(res,503,req.method==='HEAD'?'':fail(day));}
});
server.listen(3018,'0.0.0.0',()=>console.log('KQ247_XSMB_LOCKED_READONLY_HTML_READY'));
