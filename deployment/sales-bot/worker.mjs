// KQ247 VinaHost sales bot: single active Telegram owner; never log credentials or customer codes.
// Safe standby by default. A payment bot at the old host must be disabled before enabling polling here.
import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
const {Pool}=pg;
const PRODUCTS={football:'⚽ Bóng đá',lottery:'🎯 Xổ số',vietlott:'🎟 Vietlott'};
const TAG={football:'BD',lottery:'XS',vietlott:'VL'};
const ACTIVE=process.env.KQ247_SALES_BOT_ACTIVE==='1';
const TOKEN=process.env.TELEGRAM_SALES_BOT_TOKEN||'';
const DB=process.env.NEON_DATABASE_URL||'';
const pool=DB?new Pool({connectionString:DB,max:3,connectionTimeoutMillis:7000,idleTimeoutMillis:15000}):null;
let lastPoll=null,lastError=null,updateOffset=0;
const sleep=t=>new Promise(r=>setTimeout(r,t));
const escapeHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const vnDate=d=>new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(d));
const money=n=>Number(n).toLocaleString('vi-VN')+'đ';
const keyboard=rows=>({inline_keyboard:rows});
const nav=()=>keyboard([
 [{text:'🔐 MÃ CỦA TÔI & LINK MỚI NHẤT',callback_data:'mycodes'}],
 [{text:'⚽ Bóng đá',callback_data:'plans:football'},{text:'🎯 Xổ số',callback_data:'plans:lottery'}],
 [{text:'🎟 Vietlott',callback_data:'plans:vietlott'}]
]);
async function telegram(method,payload){
 const r=await fetch('https://api.telegram.org/bot'+TOKEN+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(33000)});
 const j=await r.json().catch(()=>({ok:false}));
 if(!r.ok||j.ok!==true)throw Error('telegram_'+method+'_failed_'+r.status);
 return j.result;
}
async function send(chat_id,text,reply_markup=nav()){
 return telegram('sendMessage',{chat_id,text,parse_mode:'HTML',disable_web_page_preview:true,reply_markup});
}
async function validClientUrl(product){
 const key='client_'+product+'_url';
 const r=await pool.query(
   "SELECT c.value FROM sales_config c WHERE c.key=$1 AND EXISTS (SELECT 1 FROM sales_link_history h WHERE h.product=$2 AND h.link_role='client' AND h.url=c.value AND h.is_current=true) LIMIT 1",
   [key,product]);
 const s=r.rows[0]?.value;
 if(!s)return null;
 try{
  const u=new URL(s);
  if(u.protocol!=='https:'||u.username||u.password)return null;
  if(product==='football' && u.pathname!=='/client.html')return null;
  if(product==='lottery' && u.pathname!=='/xoso-khach')return null;
  if(product==='vietlott' && !(u.pathname.endsWith('/client.html')||(u.searchParams.get('client')==='1'&&u.searchParams.get('product')==='vietlott')))return null;
  return u.href;
 }catch{return null}
}
async function myCodes(chat,userId){
 const r=await pool.query(
  "SELECT product,code_value,duration_days,status,activated_at,expires_at FROM sales_licenses WHERE telegram_user_id=$1 AND product=ANY($2::text[]) ORDER BY created_at DESC LIMIT 120",
  [String(userId),Object.keys(PRODUCTS)]);
 let n=0;
 const lines=['🔐 <b>MÃ CỦA TÔI & LINK KHÁCH MỚI NHẤT</b>'];
 for(const [product,title] of Object.entries(PRODUCTS)){
  const mine=r.rows.filter(x=>x.product===product&&x.status==='active'&&(!x.expires_at||new Date(x.expires_at).getTime()>Date.now()));
  const url=await validClientUrl(product);
  if(!mine.length)continue;
  lines.push('\n<b>'+title+'</b>');
  for(const x of mine.slice(0,10)){
   if(!x.code_value)continue;
   n++;
   lines.push('Mã: <code>'+escapeHtml(x.code_value)+'</code>');
   lines.push(x.expires_at?'Hạn: '+vnDate(x.expires_at):'Chưa kích hoạt — thời hạn bắt đầu khi sử dụng');
  }
  if(url)lines.push('Bản khách mới nhất: '+escapeHtml(url));
  else lines.push('⚠️ Đường dẫn bản khách đang được xác minh. Không chuyển sang bản chính.');
 }
 if(!n)lines.push('\nChưa tìm thấy mã còn sử dụng hoặc chưa kích hoạt gắn với tài khoản Telegram này. Nếu từng nhận mã qua tài khoản khác, hãy liên hệ chủ bot.');
 await send(chat,lines.join('\n'),nav());
}
async function showPlans(chat,product){
 if(!PRODUCTS[product])return;
 const r=await pool.query('SELECT duration_days,price_vnd,label FROM sales_plans WHERE product=$1 AND enabled=true ORDER BY duration_days',[product]);
 const lines=['<b>'+PRODUCTS[product]+'</b>','Gói và mức giá hiện hành:'];
 const rows=[];
 for(const p of r.rows){
  lines.push('• '+escapeHtml(p.label)+' — '+money(p.price_vnd));
  if(Number(p.price_vnd)===0)rows.push([{text:'🆓 Nhận mã Free 10 ngày',callback_data:'trial:'+product}]);
 }
 lines.push('\nCác đơn thanh toán chỉ được xử lý khi cổng thanh toán VPS đã được xác minh. Mã cũ vẫn giữ nguyên.');
 rows.push([{text:'🔐 Mã của tôi',callback_data:'mycodes'}],[{text:'⬅️ Menu',callback_data:'home'}]);
 await send(chat,lines.join('\n'),keyboard(rows));
}
async function freeTrial(chat,userId,product){
 if(!PRODUCTS[product])return;
 const client=await pool.connect();
 let prior,created=false;
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[String(userId)+':trial:'+product]);
  const r=await client.query('SELECT code_value,status,expires_at FROM sales_licenses WHERE telegram_user_id=$1 AND product=$2 AND duration_days=10 ORDER BY created_at DESC LIMIT 1',[String(userId),product]);
  prior=r.rows[0];
  if(!prior){
   const code=TAG[product]+'-'+crypto.randomBytes(10).toString('hex').toUpperCase();
   const hash=crypto.createHash('sha256').update(code).digest('hex');
   await client.query("INSERT INTO sales_licenses(code_hash,code_hint,code_value,product,duration_days,status,telegram_user_id) VALUES($1,$2,$3,$4,10,'active',$5)",
    [hash,code.slice(-4),code,product,String(userId)]);
   prior={code_value:code,status:'active',expires_at:null};
   created=true;
  }
  await client.query('COMMIT');
 }catch(err){await client.query('ROLLBACK').catch(()=>{});throw err}finally{client.release()}
 if(!created)await send(chat,'Thiết bị/tài khoản đã được cấp mã thử sản phẩm này. Hãy vào <b>Mã của tôi</b> để xem mã còn hạn; không cấp thêm mã thử trùng.',nav());
 else{
  const url=await validClientUrl(product);
  await send(chat,'Đã cấp mã Free 10 ngày cho '+PRODUCTS[product]+':\n<code>'+escapeHtml(prior.code_value)+'</code>\n'+(url?'Link bản khách: '+escapeHtml(url):'Link bản khách đang được xác minh.')+'\nThời hạn bắt đầu khi kích hoạt trên thiết bị.',nav());
 }
}

const LEGACY_HOSTS={
 football:new Set(['kq247-football-live.onrender.com','kq247-r55-football-2jid7f.v2.appdeploy.ai','kq247-r55-football.hatchable.site','instant-hooyydiodwjk-liemtv87-1408.wix-site-host.com','instant-ilanhgsdsxyz-liemtv87-1408.wix-site-host.com']),
 lottery:new Set(['kq247-xoso-khach-v29.onrender.com','kq247-xo-so-neon-public-a2f9qy.v2.appdeploy.ai','kq247-xoso-r9-v2.lovable.app','instant-xxvnqbpglxvz-liemtv87-1408.wix-site-host.com','instant-ucmxdfgdjrlt-liemtv87-1408.wix-site-host.com']),
 vietlott:new Set(['vietlott-auto-hoc.liemtv87.workers.dev','vietlott-r32-runner-free.onrender.com','snapdeploy-vietlott-bridge-df5xvz.v2.appdeploy.ai'])
};
function legacyProduct(text){
 const direct=String(text||'').trim().toLowerCase().match(/^\/?(?:link|links)\s+(bd|football|xs|xoso|lottery|vl|vietlott)$/);
 if(direct)return ({bd:'football',football:'football',xs:'lottery',xoso:'lottery',lottery:'lottery',vl:'vietlott',vietlott:'vietlott'})[direct[1]];
 const match=String(text||'').match(/https?:\/\/[^\s<>"]+/i);
 if(!match)return null;
 let u;try{u=new URL(match[0]);}catch{return null}
 const host=u.hostname.toLowerCase();
 if(host==='kq247-xoso-khach-v29.onrender.com'&&u.searchParams.get('product')==='vietlott')return 'vietlott';
 if(host.endsWith('.sslip.io')&&host.startsWith('vietlott.'))return 'vietlott';
 if(host==='64-120-92-172.sslip.io'){
  if(u.pathname.startsWith('/xoso'))return 'lottery';
  if(u.pathname.startsWith('/vietlott'))return 'vietlott';
  return 'football';
 }
 for(const [product,hosts] of Object.entries(LEGACY_HOSTS))if(hosts.has(host))return product;
 return null;
}
async function sendLatestClient(chat,product){
 const link=await validClientUrl(product);
 if(!link)return send(chat,'⚠️ Link bản khách '+escapeHtml(PRODUCTS[product])+' đang được kiểm tra, không trả link bản chính.',nav());
 return send(chat,'✅ <b>LINK BẢN KHÁCH MỚI NHẤT</b>\n'+PRODUCTS[product]+'\n'+escapeHtml(link)+'\n\nMã của khách đang sử dụng giữ nguyên. Chọn <b>MÃ CỦA TÔI</b> để lấy lại mã.',nav());
}

async function handle(update){
 const msg=update.message||update.callback_query?.message;
 if(!msg||msg.chat?.type!=='private')return;
 const user=update.callback_query?.from||update.message?.from;
 if(!user?.id)return;
 const chat=msg.chat.id;
 if(update.callback_query)await telegram('answerCallbackQuery',{callback_query_id:update.callback_query.id});
 const cmd=update.callback_query?.data||update.message?.text?.trim()||'';
 if(cmd==='mycodes'||cmd.startsWith('/mycodes')||cmd.startsWith('/mycode'))return myCodes(chat,user.id);
 const mapped=legacyProduct(cmd);if(mapped)return sendLatestClient(chat,mapped);
 if(cmd.startsWith('plans:'))return showPlans(chat,cmd.slice(6));
 if(cmd.startsWith('trial:'))return freeTrial(chat,user.id,cmd.slice(6));
 if(cmd==='home'||cmd.startsWith('/start')||cmd.startsWith('/menu'))return send(chat,'KQ247 — chọn sản phẩm hoặc lấy lại mã và link bản khách mới nhất.',nav());
 return send(chat,'Chọn <b>Mã của tôi & link mới nhất</b> hoặc sản phẩm cần xem.',nav());
}
const health=http.createServer((req,res)=>{
 if(req.url!=='/healthz'){res.writeHead(404).end();return}
 res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify({ok:true,service:'kq247-sales-vps',active:ACTIVE,tokenConfigured:!!TOKEN,databaseConfigured:!!DB,lastPoll,lastError}));
});
health.listen(Number(process.env.PORT||3032),'0.0.0.0');
async function main(){
 if(!ACTIVE){console.log('SALES_VPS_STANDBY=YES');return}
 if(!TOKEN||!DB){lastError='missing_sales_secrets';console.error(lastError);return}
 for(;;){
  try{
   const webhook=await telegram('getWebhookInfo',{});
   if(webhook?.url){lastError='old_webhook_still_active';await sleep(30000);continue}
   const updates=await telegram('getUpdates',{offset:updateOffset,timeout:25,allowed_updates:['message','callback_query']});
   for(const item of updates){
    updateOffset=item.update_id+1;
    try{await handle(item)}catch(e){console.error('SALES_UPDATE_ERROR',String(e.message).slice(0,150))}
   }
   lastPoll=new Date().toISOString();lastError=null;
  }catch(e){lastError=String(e.message).slice(0,150);console.error('SALES_POLL_ERROR',lastError);await sleep(10000)}
 }
}
main().catch(e=>{lastError=String(e.message).slice(0,150);console.error('SALES_BOOT_ERROR',lastError)});
