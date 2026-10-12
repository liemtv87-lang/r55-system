// KQ247 sales migration: read-only, no Telegram consumer or PayOS changes until an explicitly verified cutover.
// All license data stays in the original Neon DB, never regenerated or mirrored.
import http from 'node:http';
import {Pool} from 'pg';
const PORT=Number(process.env.PORT||3010);
const HOST='0.0.0.0';
const ORIGIN='https://64-120-92-172.sslip.io';
const CLIENT={football:ORIGIN+'/client.html',lottery:ORIGIN+'/xoso-khach?region=xsmb'};
const PRODUCTS=['football','lottery','vietlott'];
const DB=process.env.SALES_DATABASE_URL||process.env.NEON_DATABASE_URL||'';
const DB_HOST=(()=>{try{return new URL(DB).hostname}catch{return ''}})();
const LOCAL_DATABASE=['football-db','localhost','127.0.0.1','kq247-r55-postgres'].includes(DB_HOST);
const TOKEN=process.env.TELEGRAM_SALES_BOT_TOKEN||'';
const WEBHOOK_SECRET=process.env.TELEGRAM_SALES_WEBHOOK_SECRET||'';
const ACTIVE=process.env.SALES_BOT_ACTIVE==='1'&&!!DB&&!!TOKEN&&!!WEBHOOK_SECRET;
const pool=DB?new Pool({connectionString:DB,ssl:LOCAL_DATABASE?false:{rejectUnauthorized:true},max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:6500}):null;
let lastError=null,lastHandled=null,dbOK=false,licensesCount=null;
const sanitize=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const locale=v=>v?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa kích hoạt';
function remaining(value){
 if(!value)return 'Chưa kích hoạt – thời hạn chưa bắt đầu';
 const diff=new Date(value).getTime()-Date.now();
 return diff<=0?'Hết hạn':diff<86400000?'Còn '+Math.ceil(diff/3600000)+' giờ':'Còn '+Math.ceil(diff/86400000)+' ngày';
}
const names={football:'⚽ BÓNG ĐÁ',lottery:'🎯 XỔ SỐ',vietlott:'🍀 VIETLOTT'};
const money=n=>Number(n||0).toLocaleString('vi-VN')+' VND';
async function query(text,params=[]){if(!pool)throw Error('neon_credentials_pending');return (await pool.query({text,values:params})).rows;}
async function latestLinks(){
 const rows=await query("SELECT key,value FROM sales_config WHERE key IN ('client_vietlott_url','customer_vietlott_url')");
 const m=Object.fromEntries(rows.map(x=>[x.key,x.value]));
 const vl=m.client_vietlott_url||m.customer_vietlott_url||'';
 let validVL='';
 try{
   const u=new URL(vl);
   if(u.protocol==='https:'&&(u.searchParams.get('client')==='1'||/\/(?:client|index)\.html$/i.test(u.pathname)))validVL=u.href;
 }catch{}
 return {...CLIENT,vietlott:validVL};
}
function failIfMainLink(links) {
 for(const [p,url] of Object.entries(links)){
  if(!url)continue;
  const u=new URL(url);
  if(p==='football'&&u.href!==CLIENT.football)throw Error('football_not_customer_link');
  if(p==='lottery'&&u.href!==CLIENT.lottery)throw Error('lottery_not_customer_link');
  if(p==='vietlott'&&(/\/(?:api|admin|xoso)(?:\/|$)/i.test(u.pathname)||u.searchParams.get('product')==='football'))throw Error('vietlott_not_customer_link');
 }
}
async function telegram(method,args){
 const r=await fetch('https://api.telegram.org/bot'+TOKEN+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(12000)});
 const j=await r.json().catch(()=>({}));
 if(!r.ok||j.ok!==true)throw Error('telegram_'+method+'_failed');
 return j;
}
async function send(chatId,text,keyboard=null){
 const opts={chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true};
 if(keyboard)opts.reply_markup={inline_keyboard:keyboard};
 return telegram('sendMessage',opts);
}
async function recover(chat,user){
 const links=await latestLinks();failIfMainLink(links);
 const licenses=await query("SELECT id,product,code_value,code_hint,status,expires_at,activated_at,duration_days,bound_device_hash,bound_fingerprint_hash FROM sales_licenses WHERE telegram_user_id=$1 ORDER BY created_at DESC LIMIT 50",[user]);
 const active=licenses.filter(x=>x.status==='active'&&(!x.expires_at||new Date(x.expires_at).getTime()>Date.now()));
 const rows=[];
 for(const p of PRODUCTS)if(links[p])rows.push([{text:names[p]+' • LINK BẢN KHÁCH',url:links[p]}]);
 rows.push([{text:'🛒 MỞ MENU',callback_data:'menu'}]);
 if(!licenses.length){await send(chat,'Chưa tìm thấy mã đã cấp cho tài khoản Telegram này.',rows);return;}
 if(!active.length){await send(chat,'Chưa có mã còn hiệu lực. Mã đã hết hạn không được cấp lại.',rows);return;}
 await send(chat,'🔑 <b>MÃ CỦA TÔI & LINK MỚI NHẤT</b>\nĐã tìm thấy '+active.length+' mã còn hạn. Mã gốc và khóa thiết bị không thay đổi.');
 for(const x of active){
  const url=links[x.product];
  if(!url)continue;
  const code=x.code_value||x.code_hint||'Không đọc được mã đầy đủ';
  const locked=x.bound_device_hash||x.bound_fingerprint_hash?'Đã khóa với thiết bị cũ':'Chưa khóa thiết bị';
  await send(chat,names[x.product]+'\nMã của bạn: <code>'+sanitize(code)+'</code>\nHạn dùng: '+sanitize(locale(x.expires_at))+'\n'+remaining(x.expires_at)+'\nThiết bị: '+locked+'\n\nLink <b>BẢN KHÁCH</b> mới nhất: '+sanitize(url),[[{text:'🌐 MỞ BẢN KHÁCH MỚI NHẤT',url}],[{text:'🔑 MÃ CỦA TÔI',callback_data:'recover_codes'}]]);
 }
}
async function menu(chat){
 const links=await latestLinks();failIfMainLink(links);
 const plans=await query('SELECT product,duration_days,label,price_vnd FROM sales_plans WHERE enabled=true ORDER BY product,duration_days');
 const rows=[[{text:'🔑 MÃ CỦA TÔI & LINK MỚI NHẤT',callback_data:'recover_codes'}]];
 for(const p of PRODUCTS){
  if(links[p])rows.push([{text:names[p]+' • BẢN KHÁCH MỚI NHẤT',url:links[p]}]);
  for(const x of plans.filter(x=>x.product===p)){
   // Keep the selling flow on the existing active seller until the fully audited VPS payment cutover.
   rows.push([{text:names[p]+' • '+x.label+' • '+(Number(x.price_vnd)===0?'Free':money(x.price_vnd)),callback_data:'product_info_'+p+'_'+x.duration_days}]);
  }
 }
 await send(chat,'KQ247 • <b>BOT BÁN TOOL</b>\nCác mã khách đang dùng tiếp tục được giữ nguyên.\nBấm MÃ CỦA TÔI để xem mã và link bản khách mới nhất.',rows);
}
async function onTelegram(update){
 const q=update.callback_query,m=update.message;
 const actor=q?.from||m?.from;
 const chat=q?.message?.chat||m?.chat;
 if(!actor?.id||!chat||chat.type!=='private'||Number(chat.id)!==Number(actor.id))return;
 if(q){try{await telegram('answerCallbackQuery',{callback_query_id:q.id})}catch{}}
 const cmd=String(q?.data||m?.text||'').trim().toLowerCase();
 if(['recover_codes','/recover','/mycodes','/mymacode','/laylaima','/start recover'].includes(cmd))await recover(chat.id,actor.id);
 else if(cmd.startsWith('product_info_'))await send(chat.id,'Thông tin gói đã được lưu. Thanh toán trên VPS sẽ được bật sau khi đối chiếu PayOS và bảo đảm không cấp trùng mã.\nGõ /menu hoặc mở bot hiện hành để mua.');
 else await menu(chat.id);
 lastHandled=new Date().toISOString();
}
const respond=(res,code,payload)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(payload));};
const app=http.createServer(async(req,res)=>{
 try{
  if(req.method==='GET'&&req.url==='/healthz'){
   if(pool){try{const data=await query('SELECT count(*)::int AS n FROM sales_licenses');licensesCount=Number(data[0]?.n??0);dbOK=licensesCount>0}catch(e){dbOK=false;licensesCount=null;lastError=String(e.message).slice(0,120)}}
   return respond(res,200,{ok:true,service:'kq247-sales-vps',standby:!ACTIVE,active:ACTIVE,database_ready:dbOK,local_database:LOCAL_DATABASE,licenses_count:licensesCount,telegram_configured:!!TOKEN,webhook_protected:!!WEBHOOK_SECRET,payos_active:false,lastHandled,lastError});
  }
  if(req.method!=='POST'||req.url!=='/telegram')return respond(res,404,{ok:false,error:'not_found'});
  if(!ACTIVE)return respond(res,503,{ok:false,error:'sales_vps_standby'});
  if(req.headers['x-telegram-bot-api-secret-token']!==WEBHOOK_SECRET)return respond(res,401,{ok:false,error:'unauthorized'});
  let raw='';for await(const p of req){raw+=p;if(raw.length>65000)return respond(res,413,{ok:false})}
  await onTelegram(JSON.parse(raw));return respond(res,200,{ok:true});
 }catch(e){lastError=String(e?.message||e).slice(0,160);console.error('KQ247_SALES_VPS_ERROR',lastError);return respond(res,503,{ok:false,error:'service_failed'});}
});
app.listen(PORT,HOST,()=>console.log('KQ247_SALES_VPS_STANDBY_READY PORT='+PORT));
