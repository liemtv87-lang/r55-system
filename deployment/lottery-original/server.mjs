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
  // The upstream snapshot contains all 500 three-digit picks in a closed
  // <details> element. Open the existing DOM element, never recalculate picks.
  // This change applies to the main page and the licensed customer iframe.
  const expanded=routed.replace(
    /<details\\b([^>]*)>(\\s*<summary[^>]*>\\s*DÀN\\s*3\\s*CÀNG\\b)/i,
    (_all,attrs,summary)=>'<details'+(attrs||'')+
      (/\\bopen(?:\\s|=|$)/i.test(attrs)?'':' open')+'>'+summary
  );
  // Public footer QC; separate from prediction values and customer auth.
  const qcStyle=`<style id="kq247-xs-qc-style">
  .kq247-xs-qc{box-sizing:border-box;text-align:left;margin:20px auto 8px;padding:15px 13px;
    border:1px solid #c5d6ed;border-radius:14px;background:#f0f6ff;color:#12478f;
    box-shadow:0 4px 14px rgba(23,65,121,.09);font-family:system-ui,-apple-system,Arial,sans-serif}
  .kq247-xs-qc *{box-sizing:border-box}
  .kq247-xs-qc h3{margin:0 0 11px;color:#a51729;font-size:19px;font-weight:900}
  .kq247-xs-qc p{margin:7px 0;line-height:1.55;color:#1554a2;font-size:15px;font-weight:750}
  .kq247-xs-qc a{color:#c91828!important;font-weight:900;text-decoration:underline;
    overflow-wrap:anywhere}
  .kq247-xs-qc .kq247-xs-qc-links{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}
  .kq247-xs-qc .kq247-xs-qc-links a{display:inline-block;padding:10px 11px;
    border-radius:9px;background:white;border:1px solid #b9cbe5;text-decoration:none}
  @media(max-width:420px){.kq247-xs-qc{margin:15px 2px 6px;padding:12px}
    .kq247-xs-qc p{font-size:14px}.kq247-xs-qc .kq247-xs-qc-links a{font-size:13px}}
  </style>`;
  const qcBlock=`<section id="kq247-xs-qc" class="kq247-xs-qc" aria-label="KQ247 thông tin và liên kết">
    <h3>📢 KQ247 • TOOL PHÂN TÍCH DỰ ĐOÁN</h3>
    <p>📢 Tool phân tích dự đoán XSMB, MT, MN</p>
    <p>📢 Tool phân tích, dự đoán kèo bóng đá, chọn xiên 6, 8, 10 trận</p>
    <p>📢 Tool Vietlott 6x45, 6x55</p>
    <p>📱 Sử dụng link trên điện thoại dễ dàng – nhanh chóng – hiệu quả</p>
    <p>🎁 Có mã dùng thử Free 10 ngày</p>
    <p>⚽ Nhóm bóng đá: <a href="https://t.me/keochuyengia79" target="_blank" rel="noopener noreferrer">t.me/keochuyengia79</a></p>
    <p>🎯 Nhóm xổ số: <a href="https://t.me/xsbm999" target="_blank" rel="noopener noreferrer">t.me/xsbm999</a></p>
    <p>🛒 Mua tool / nhận lại mã: <a href="https://t.me/muatool_du_doan_bot" target="_blank" rel="noopener noreferrer">@muatool_du_doan_bot</a></p>
    <div class="kq247-xs-qc-links">
      <a href="https://t.me/xsbm999" target="_blank" rel="noopener noreferrer">NHÓM XỔ SỐ</a>
      <a href="https://t.me/keochuyengia79" target="_blank" rel="noopener noreferrer">NHÓM BÓNG ĐÁ</a>
      <a href="https://t.me/muatool_du_doan_bot" target="_blank" rel="noopener noreferrer">MUA TOOL / MÃ CỦA TÔI</a>
    </div>
  </section>`;
  const styled=expanded.includes('id="kq247-xs-qc-style"')?expanded:
    expanded.replace(/<\\/head>/i,qcStyle+'</head>');
  const finished=styled.includes('id="kq247-xs-qc"')?styled:
    styled.replace(/<\\/footer>/i,qcBlock+'</footer>');
  if(!/\\<details\\b[^>]*\\bopen\\b[^>]*>\\s*<summary[^>]*>\\s*DÀN\\s*3\\s*CÀNG/i.test(finished))
    console.warn('KQ247_XS_3C_UPSTREAM_ELEMENT_CHANGED');
  if(!finished.includes('id="kq247-xs-qc"'))console.warn('KQ247_XS_QC_FOOTER_MISSING');
  upstreamSnapshotBytes=html.length;lastCheck=new Date().toISOString();lastError=null;
  return send(res,200,req.method==='HEAD'?'':finished,'text/html; charset=utf-8');
 }catch(e){
  errorCount++;lastError=String(e?.message||e).slice(0,160);
  console.error('KQ247_XS_ORIGINAL_UPSTREAM_FAILED',lastError);
  if(!res.headersSent)send(res,503,{ok:false,error:'Nguồn dự đoán gốc đang gián đoạn, không sinh số thay thế',source:'neon_original'});
 }
});
server.listen(PORT,'0.0.0.0',()=>console.log('KQ247_XS_ORIGINAL_VPS_PROXY_READY PORT='+PORT));
