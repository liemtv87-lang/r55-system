import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8080);
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const FOOTBALL_CHAT_ID = String(process.env.FOOTBALL_CHAT_ID || '-1002315121695').trim();
const LOTTERY_CHAT_ID = String(process.env.LOTTERY_CHAT_ID || '@xsbm999').trim();
const R55_URL = String(process.env.R55_URL || 'https://r55-unified-runtime.floot.app/api/background').trim();
const STATE_FILE = String(process.env.STATE_FILE || '/tmp/telegram-r55-state.json').trim();
const BUILD = 'TELEGRAM_R55_KICKOFF_MINUS_20_ONE_PER_HOUR_V3';
const BOT_TEST_MODE = process.env.BOT_TEST_MODE==='1';
const SENDER_DISABLED = process.env.SENDER_DISABLED==='1';
const LOTTERY_SENDER_DISABLED = process.env.LOTTERY_SENDER_DISABLED==='1';

const FOOTER = `
━━━━━━━━━━━━━━
* Bán tool Phân tích dự đoán XSMB, MT , MN
* tool Phân tích, dự đoán kèo bóng đá, chọn xiên 6,8,10 trận.
* Sử dụng link trên ĐT dễ dàng - nhanh chóng - hiệu quả
* Vào nhóm kèo bóng : https://t.me/keochuyengia79 
hoặc nhóm Xổ Số : https://t.me/xsbm999
Tool sử dụng Free 5 ngày tại @muatool_du_doan_bot ( dự đoán sớm)`;

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!s || typeof s !== 'object') throw new Error('bad state');
    s.kv ||= {};
    return s;
  } catch {
    return { kv: {}, cron: {} };
  }
}
let STATE = loadState();
function persistState() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(STATE), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error('STATE SAVE ERROR', e?.message || e);
  }
}
function cleanupState() {
  const now = Date.now();
  let dirty = false;
  for (const [k, x] of Object.entries(STATE.kv || {})) {
    if (x?.expiresAt && x.expiresAt <= now) { delete STATE.kv[k]; dirty = true; }
  }
  if (dirty) persistState();
}
function kvGet(key) {
  cleanupState();
  const x = STATE.kv?.[key];
  return x ? x.value : null;
}
function kvPut(key, value, ttlSec = 0) {
  STATE.kv ||= {};
  STATE.kv[key] = { value: String(value), expiresAt: ttlSec > 0 ? Date.now() + ttlSec * 1000 : 0 };
  persistState();
}
function kvList(prefix) {
  cleanupState();
  return Object.keys(STATE.kv || {}).filter(k => k.startsWith(prefix)).sort();
}

function vnParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date);
  const o = {}; for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  return { y:+o.year, m:+o.month, d:+o.day, h:+o.hour, min:+o.minute };
}
function vnDate(date = new Date()) { const v=vnParts(date); return `${v.y}-${String(v.m).padStart(2,'0')}-${String(v.d).padStart(2,'0')}`; }
function cleanNumber(value) { const x=Number(value); if(!Number.isFinite(x))return String(value??''); return Number.isInteger(x)?String(x):String(x).replace(/0+$/,'').replace(/\.$/,''); }
function ahLine(value){ const x=Number(value); if(!Number.isFinite(x))return String(value??''); if(x===0)return '0 (đồng banh)'; return x>0?`+${cleanNumber(x)}`:cleanNumber(x); }
function ahTeam(p){ if(p?.ah?.pick==='Home')return p.home; if(p?.ah?.pick==='Away')return p.away; return p?.ah?.pick||''; }
function kickoffVN(iso){ const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)); const o={}; for(const p of parts)if(p.type!=='literal')o[p.type]=p.value; return `${o.hour}:${o.minute} ${o.day}-${o.month} giờ VN`; }
function matchKey(p){ return String(p.id || `${p.date}|${p.home}|${p.away}`); }
function makeMessage(p){ return `⚽ ${p.home} - ${p.away}\n🏆 ${p.league||'Bóng đá'}\n⏰ ${kickoffVN(p.date)}\n\n🔸 KÈO CHÂU Á\n${ahTeam(p)} • ${ahLine(p.ah.line)}\n${p.ah.books||0} nhà cái\n\n🔹 TÀI / XỈU\n${p.ou.pick} ${cleanNumber(p.ou.line)}\n${p.ou.books||0} nhà cái\n\n${FOOTER}`; }

let R55_CACHE={until:0,data:null};
async function fetchR55(){ if(R55_CACHE.data&&Date.now()<R55_CACHE.until)return R55_CACHE.data; const r=await fetch(R55_URL,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)}); if(!r.ok)throw new Error(`R55 HTTP ${r.status}`); const d=await r.json(); if(!d||!Array.isArray(d.predictions))throw new Error('R55 không trả predictions'); R55_CACHE={until:Date.now()+5*60*1000,data:d}; return d; }
async function getCandidates(now=new Date()){ const d=await fetchR55(); const all=[...(Array.isArray(d.predictions)?d.predictions:[]),...(Array.isArray(d.featuredPredictions)?d.featuredPredictions:[])]; const uniq=new Map(); const nowMs=now.getTime(); for(const p of all){ if(!p?.date||!p?.home||!p?.away||!p?.ah||!p?.ou)continue; const t=Date.parse(p.date); if(!Number.isFinite(t)||t<nowMs||t>nowMs+36*3600e3)continue; const k=matchKey(p); if(!uniq.has(k))uniq.set(k,p); } return [...uniq.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)); }
async function nextUnsent(now=new Date()){
 const last=Number(kvGet('football:last-sent-ms')||0);
 if(last && now.getTime()-last<60*60*1000)return null;
 const due=(await getCandidates(now)).filter(p=>{
   const minutes=(Date.parse(p.date)-now.getTime())/60000;
   return minutes>=18 && minutes<=22 && !kvGet(`sent:${matchKey(p)}`);
 });
 due.sort((a,b)=>Math.abs((Date.parse(a.date)-now.getTime())/60000-20)-Math.abs((Date.parse(b.date)-now.getTime())/60000-20));
 return due[0]||null;
}

function splitTelegramText(text,maxLen=3500){ const src=String(text||'').trim(); if(!src)return[]; if(src.length<=maxLen)return[src]; const parts=[]; let cur=''; const flush=()=>{if(cur.trim())parts.push(cur.trim());cur='';}; for(const para0 of src.split(/\n\n+/)){ const para=para0.trim(); if(!para)continue; if(para.length>maxLen){flush();for(let i=0;i<para.length;i+=maxLen)parts.push(para.slice(i,i+maxLen));continue;} const cand=cur?`${cur}\n\n${para}`:para; if(cand.length>maxLen){flush();cur=para;}else cur=cand; } flush(); return parts; }
async function sendTelegramRaw(text,chatId){ if(SENDER_DISABLED)throw new Error('SENDER_DISABLED'); if(BOT_TEST_MODE){console.log('MOCK_TELEGRAM_SEND',chatId,String(text).length);return{ok:true,result:{message_id:123456}};} if(!TELEGRAM_BOT_TOKEN)throw new Error('Thiếu TELEGRAM_BOT_TOKEN'); const r=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})}); const j=await r.json(); if(!j.ok)throw new Error(j.description||`Telegram HTTP ${r.status}`); return j; }
async function sendTelegram(text,chatId){ const chunks=splitTelegramText(text); if(!chunks.length)throw new Error('Nội dung Telegram rỗng'); let last=null; const ids=[]; for(let i=0;i<chunks.length;i++){ const part=chunks.length>1?`(${i+1}/${chunks.length})\n${chunks[i]}`:chunks[i]; last=await sendTelegramRaw(part,chatId); ids.push(last?.result?.message_id??null); } if(last&&chunks.length>1){last.chunk_count=chunks.length;last.message_ids=ids;} return last; }
async function sendNext(now=new Date()){
 const p=await nextUnsent(now);
 if(!p)return{ok:true,sent:0,reason:'Chưa có trận trong cửa sổ 18–22 phút hoặc chưa đủ 60 phút từ tin trước'};
 const j=await sendTelegram(makeMessage(p),FOOTBALL_CHAT_ID);
 const sentAt=now.getTime(); STATE.kv ||= {};
 STATE.kv[`sent:${matchKey(p)}`]={value:new Date(sentAt).toISOString(),expiresAt:sentAt+3*24*3600*1000};
 STATE.kv['football:last-sent-ms']={value:String(sentAt),expiresAt:sentAt+3*24*3600*1000};
 persistState();
 return{ok:true,sent:1,message_id:j?.result?.message_id??null,chatId:FOOTBALL_CHAT_ID,match:`${p.home} - ${p.away}`,kickoff:p.date,minutesBeforeKickoff:Math.round((Date.parse(p.date)-sentAt)/60000)};
}

function withSalesFooter(input){
 let t=String(input||'').trim().replace(/(?:Liên hệ\s*(?::|mua tool:)[^\n]*?)(?:t\.me\/|@)thanhliem6999(?:\s*để mua tool)?/gi,'Mua tool tại: t.me/muatool_du_doan_bot').replace(/t\.me\/thanhliem6999/gi,'t.me/muatool_du_doan_bot').replace(/@thanhliem6999/gi,'@muatool_du_doan_bot');
 if(/Mua tool tại:\s*(?:https?:\/\/)?t\.me\/muatool_du_doan_bot/i.test(t))return t;
 if(/Bán tool Phân tích dự đoán/i.test(t))return t+'\nMua tool tại: t.me/muatool_du_doan_bot';
 return t+'\n\n'+FOOTER.trim();
}
function validLotteryRegion(r){return['xsmb','xsmt','xsmn'].includes(String(r||'').toLowerCase());}
function validDateKey(d){return/^20\d{2}-\d{2}-\d{2}$/.test(String(d||''));}
function safeStationKey(v){const s=String(v||'all').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');return s||'all';}
function snapshotKey(x){return`lottery:snapshot:${x.date}:${x.region}:${safeStationKey(x.station)}`;}
function sentLotteryKey(x){return`lottery:sent:${x.date}:${x.region}:${safeStationKey(x.station)}`;}
function listLotterySnapshots(date,region){const rows=[];for(const k of kvList(`lottery:snapshot:${date}:${region}:`)){try{const x=JSON.parse(kvGet(k));if(x?.text&&x.date===date&&x.region===region)rows.push(x);}catch{}} rows.sort((a,b)=>String(a.stationLabel||a.station).localeCompare(String(b.stationLabel||b.station),'vi'));return rows;}
async function sendLotterySnapshot(x){const sk=sentLotteryKey(x);if(kvGet(sk))return{ok:true,sent:0,skipped:'already-sent',station:x.station};if(LOTTERY_SENDER_DISABLED)return{ok:true,sent:0,skipped:'lottery-disabled',station:x.station};const chunks=splitTelegramText(withSalesFooter(x.text));const ids=[];for(let i=0;i<chunks.length;i++){let t=chunks[i];if(chunks.length>1)t=`(${i+1}/${chunks.length})\n${t}`;const j=await sendTelegram(t,LOTTERY_CHAT_ID);ids.push(j?.result?.message_id??null);}kvPut(sk,new Date().toISOString(),8*24*3600);return{ok:true,sent:chunks.length,station:x.station,messageIds:ids};}
async function sendLotteryRegion(region,date=vnDate()){const rows=listLotterySnapshots(date,region);if(!rows.length)return{ok:true,region,date,snapshots:0,sentMessages:0,pending:true,reason:'Chưa có snapshot đã khóa từ tool xổ số'};const results=[];let sentMessages=0;for(const x of rows){try{const r=await sendLotterySnapshot(x);results.push(r);sentMessages+=Number(r.sent||0);}catch(e){results.push({ok:false,station:x.station,sent:0,error:String(e?.message||e)});}}return{ok:true,region,date,snapshots:rows.length,sentMessages,results};}
async function sendLotteryDue(now=new Date()){const v=vnParts(now),date=vnDate(now),out=[];for(const [region,h] of [['xsmn',16],['xsmt',17],['xsmb',18]]){if(v.h===h&&v.min>=10&&v.min<15)out.push(await sendLotteryRegion(region,date));}return out;}

async function readJson(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>5*1024*1024)throw new Error('Body quá lớn');}return JSON.parse(data||'{}');}
function corsHeaders(req){const origin=String(req.headers.origin||'*');return{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','vary':'Origin'};}
function json(res,obj,status=200,headers={}){const body=JSON.stringify(obj);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),...headers});res.end(body);}

let LAST_TELEGRAM_CHECK = { at: 0, value: null };
async function checkTelegramReadOnly(){
 if(LAST_TELEGRAM_CHECK.value && Date.now()-LAST_TELEGRAM_CHECK.at<600000)return {...LAST_TELEGRAM_CHECK.value,cached:true};
 if(!TELEGRAM_BOT_TOKEN)return {ok:false,error:'Telegram token not configured'};
 const base=`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/`;
 const call=async (method,params={})=>{
  const r=await fetch(base+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(params),signal:AbortSignal.timeout(10000)});
  const j=await r.json();if(!j.ok)throw new Error(j.description||`${method} HTTP ${r.status}`);return j.result;
 };
 const out={ok:false,checkedAt:new Date().toISOString(),telegramAuth:false,chats:{}};
 try{
  const me=await call('getMe');out.telegramAuth=me?.is_bot===true;out.botUsername=me?.username||'';
  for(const [key,chatId] of [['football',FOOTBALL_CHAT_ID],['lottery',LOTTERY_CHAT_ID]]){
   try{
    const chat=await call('getChat',{chat_id:chatId});
    const membership=await call('getChatMember',{chat_id:chat.id,user_id:me.id});
    const st=membership?.status||'unknown';
    const canPost=st==='administrator'||st==='creator'||st==='member'||(st==='restricted'&&membership?.can_send_messages===true);
    out.chats[key]={ok:canPost,id:String(chat.id),type:chat.type,botStatus:st,canPost};
   }catch(e){out.chats[key]={ok:false,error:String(e?.message||e).slice(0,180)};}
  }
  out.ok=out.telegramAuth&&Object.values(out.chats).every(c=>c.ok===true);
 }catch(e){out.error=String(e?.message||e).slice(0,180);}
 LAST_TELEGRAM_CHECK={at:Date.now(),value:out};return out;
}

async function handler(req,res){const url=new URL(req.url,`http://${req.headers.host||'localhost'}`),p=url.pathname;
  if(BOT_TEST_MODE&&p==='/__test-tick'){const date=new Date(url.searchParams.get('at')||'');if(!Number.isFinite(date.getTime()))return json(res,{ok:false,error:'invalid at'},400);await cronTick(date);return json(res,{ok:true,cron:STATE.cron});}
  if(p==='/health')return json(res,{ok:true,build:BUILD,telegramTokenConfigured:Boolean(TELEGRAM_BOT_TOKEN),senderDisabled:SENDER_DISABLED,lotterySenderDisabled:LOTTERY_SENDER_DISABLED,r55:R55_URL,stateFile:STATE_FILE,schedule:{timezone:'Asia/Ho_Chi_Minh',football:'18–22 phút trước trận; tối đa 1 trận mỗi 60 phút',lottery:{xsmn:'16:10',xsmt:'17:10',xsmb:'18:10'}}});
  if(p==='/telegram-check')return json(res,await checkTelegramReadOnly());
  if(p==='/shared'&&req.method==='OPTIONS'){res.writeHead(204,corsHeaders(req));return res.end();}
  if(p==='/shared'&&req.method==='GET'){try{const values={};for(const k of kvList('shared:')){const v=kvGet(k);if(v!=null)values[k.slice(7)]=v;}return json(res,{ok:true,build:BUILD,values},200,corsHeaders(req));}catch(e){return json(res,{ok:false,error:String(e?.message||e)},500,corsHeaders(req));}}
  if(p==='/shared'&&req.method==='POST'){try{const j=await readJson(req),key=String(j.key||'').trim(),value=j.value;if(!key||key.length>240||typeof value!=='string'||value.length>4*1024*1024)return json(res,{ok:false,error:'shared key/value không hợp lệ'},400,corsHeaders(req));kvPut('shared:'+key,value,120*24*3600);return json(res,{ok:true,key,chars:value.length},200,corsHeaders(req));}catch(e){return json(res,{ok:false,error:String(e?.message||e)},500,corsHeaders(req));}}
  if(p==='/lottery-ingest'&&req.method==='OPTIONS'){res.writeHead(204,corsHeaders(req));return res.end();}
  if(p==='/lottery-ingest'&&req.method==='POST'){try{const b=await readJson(req);const region=String(b.region||'').toLowerCase(),date=String(b.date||''),station=safeStationKey(b.station||(region==='xsmb'?'xsmb':'all')),stationLabel=String(b.stationLabel||'').trim().slice(0,120),text=String(b.text||'').trim();if(!validLotteryRegion(region))return json(res,{ok:false,error:'region không hợp lệ'},400,corsHeaders(req));if(!validDateKey(date))return json(res,{ok:false,error:'date không hợp lệ'},400,corsHeaders(req));if(text.length<50||text.length>50000)return json(res,{ok:false,error:'Nội dung snapshot không hợp lệ'},400,corsHeaders(req));const x={region,date,station,stationLabel,text,build:String(b.build||'').slice(0,160),source:String(req.headers.origin||''),receivedAt:new Date().toISOString()};kvPut(snapshotKey(x),JSON.stringify(x),8*24*3600);return json(res,{ok:true,build:BUILD,saved:{region,date,station,stationLabel,chars:text.length}},200,corsHeaders(req));}catch(e){return json(res,{ok:false,build:BUILD,error:String(e?.message||e)},500,corsHeaders(req));}}
  if(p==='/lottery-preview'){try{const date=url.searchParams.get('date')||vnDate(),data={};for(const region of ['xsmb','xsmt','xsmn'])data[region]=listLotterySnapshots(date,region).map(x=>({station:x.station,stationLabel:x.stationLabel,chars:x.text.length,receivedAt:x.receivedAt}));return json(res,{ok:true,build:BUILD,date,data});}catch(e){return json(res,{ok:false,error:String(e?.message||e)},500);}}
  if(p==='/send-lottery'){try{const region=String(url.searchParams.get('region')||'').toLowerCase(),date=url.searchParams.get('date')||vnDate();if(!validLotteryRegion(region))return json(res,{ok:false,error:'Dùng ?region=xsmb hoặc xsmt hoặc xsmn'},400);return json(res,await sendLotteryRegion(region,date));}catch(e){return json(res,{ok:false,error:String(e?.message||e)},500);}}
  if(p==='/preview'){try{const candidates=await getCandidates(),next=await nextUnsent();return json(res,{ok:true,build:BUILD,source:R55_URL,totalFutureCandidates:candidates.length,next:next?{home:next.home,away:next.away,league:next.league,date:next.date,ah:`${ahTeam(next)} ${ahLine(next.ah.line)}`,ou:`${next.ou.pick} ${cleanNumber(next.ou.line)}`}:null});}catch(e){return json(res,{ok:false,error:String(e?.message||e)},500);}}
  if(p==='/send-next'){try{return json(res,await sendNext());}catch(e){return json(res,{ok:false,error:String(e?.message||e)},500);}}
  if(p==='/test-football')return json(res,{ok:true,dryRun:true,tokenConfigured:Boolean(TELEGRAM_BOT_TOKEN),senderDisabled:SENDER_DISABLED,schedule:'20min-before; max-1-per-60min',footer:FOOTER,chatId:FOOTBALL_CHAT_ID});
  if(p==='/test-lottery')return json(res,{ok:true,dryRun:true,tokenConfigured:Boolean(TELEGRAM_BOT_TOKEN),senderDisabled:SENDER_DISABLED,lotterySenderDisabled:LOTTERY_SENDER_DISABLED,schedule:{xsmn:'16:10',xsmt:'17:10',xsmb:'18:10'},footer:FOOTER,chatId:LOTTERY_CHAT_ID});
  res.writeHead(200,{'content-type':'text/plain; charset=utf-8'});res.end(`${BUILD}\n\n/health\n/preview\n/send-next\n/test-football\n/lottery-preview\n/send-lottery?region=xsmb\n/send-lottery?region=xsmt\n/send-lottery?region=xsmn\n/test-lottery`);
}

let cronBusy=false;
async function cronTick(now=new Date()){
 if(cronBusy)return;cronBusy=true;
 try{
  const v=vnParts(now), day=vnDate(now);STATE.cron ||= {};
  for(const [region,h] of [['xsmn',16],['xsmt',17],['xsmb',18]]){
   if(v.h!==h||v.min<10||v.min>=15||LOTTERY_SENDER_DISABLED)continue;
   const slot=`lottery:${day}:${region}`;
   // Retry only during the five-minute prescheduled window if snapshots are not ready.
   const rows=listLotterySnapshots(day,region);
   if(!rows.length){console.log('LOTTERY_PENDING',region,day);continue;}
   if(STATE.cron[slot])continue;
   const r=await sendLotteryRegion(region,day);
   console.log('LOTTERY_CRON',JSON.stringify(r));
   if(r.results?.every(x=>x.ok&&(!x.error))) {STATE.cron[slot]=new Date().toISOString();persistState();}
  }
  // Check every minute; the persistent 60-minute gate allows at most one match.
  try{const r=await sendNext(now);if(r.sent)console.log('FOOTBALL_CRON',JSON.stringify(r));}
  catch(e){console.error('FOOTBALL_CRON_ERROR',e?.message||e);}

 }catch(e){console.error('CRON_ERROR',e?.message||e)}finally{cronBusy=false}
}

const server=http.createServer((req,res)=>{handler(req,res).catch(e=>json(res,{ok:false,error:String(e?.message||e)},500));});
server.listen(PORT,'0.0.0.0',()=>{console.log(`${BUILD} listening on ${PORT}`);console.log(`R55=${R55_URL}`);console.log(`Telegram token configured=${Boolean(TELEGRAM_BOT_TOKEN)}`);console.log('SCHEDULE 16:10 MN 17:10 MT 18:10 MB; FOOTBALL 20 MIN BEFORE KICKOFF; MAX 1 PER 60 MIN');void cronTick();});
setInterval(()=>{void cronTick();},60_000).unref();