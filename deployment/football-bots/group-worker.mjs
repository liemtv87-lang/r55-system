// R55 Telegram group VPS worker: safe standby until an operator completes the single-sender cutover.
// Bot token MUST come from the VPS environment; never from git, API URLs or public files.
import http from 'node:http';
import {Pool} from 'pg';
import {matchMessage,boldTelegram,validFootballMessage} from './lib/r55TelegramFormat.js';
import {settle} from './lib/r55Settlement.js';
const CHANNEL='@keochuyengia79';
const pool=new Pool({connectionString:process.env.DATABASE_URL, max:3,connectionTimeoutMillis:6000});
const active=process.env.R55_VPS_GROUP_BOT_ACTIVE==='1';
const token=process.env.R55_GROUP_BOT_TOKEN||process.env.TELEGRAM_LOTTERY_BOT_TOKEN||'';
const delay=60000;
let ticking=false,lastCheck=null,lastResult=null,lastError=null;
const log=(name,obj)=>console.log(new Date().toISOString(),name,JSON.stringify(obj));
const vnDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const vnHour=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
const vnMinute=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',minute:'2-digit'}).format(new Date()));
const cleanMarket=m=>{
 const k=m?.market||{},odd=Number(k.odds),line=Number(k.line);
 if(!['AH','OU'].includes(k.type)||!Number.isFinite(odd)||odd<1.5||odd>3.5||
    !Number.isFinite(line)||Math.abs(line*4-Math.round(line*4))>1e-7)return false;
 return(k.type==='AH'?['HOME','AWAY']:['OVER','UNDER']).includes(k.pick);
};
const fixture=x=>String(x?.id||'').match(/^BDL_(\d{5,12})$/)?.[1]||null;
const recentSent=async()=>{
 const q=await pool.query("SELECT updated_at FROM football_compact_stats WHERE scope LIKE 'r55_prematch_sent_%' AND payload->>'state'='sent' AND payload->>'messageId' IS NOT NULL ORDER BY updated_at DESC LIMIT 1");
 return q.rows[0]?.updated_at?new Date(q.rows[0].updated_at).getTime():0;
};
async function send(text){
 if(!active||!token)throw Error('group_bot_not_enabled_or_token_missing');
 const r=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({chat_id:CHANNEL,text,parse_mode:'HTML',disable_web_page_preview:true}),
  signal:AbortSignal.timeout(11000)});
 const j=await r.json().catch(()=>({ok:false}));
 if(!r.ok||j.ok!==true||!Number.isInteger(Number(j.result?.message_id)))
  throw Error('telegram_missing_ack_'+r.status);
 return Number(j.result.message_id);
}
async function sendPick(){
 const now=Date.now(),last=await recentSent();
 if(now-last<40*60000)return {reason:'min_40_minutes'};
 const day=vnDate();
 const q=await pool.query("SELECT day::text AS day,payload FROM football_snapshots WHERE day>=($1::date-interval '1 day') ORDER BY day DESC LIMIT 2",[day]);
 const choices=[];
 for(const x of q.rows){
  const matches=typeof x.payload==='string'?JSON.parse(x.payload).matches:x.payload?.matches;
  for(const m of matches||[]){
   if(!fixture(m)||!cleanMarket(m))continue;
   const t=Date.parse(m.kickoff||''),until=t-now;
   if(!Number.isFinite(t)||until<5*60000||until>40*60000)continue;
   const weight=(Number(m.priority)||0)*100+
      (Number(m.market?.bookmakers)||0)*5+
      (Number(m.market?.worstEV)||0)*8-
      Math.abs(until-20*60000)/60000;
   choices.push({m,day:x.day,weight});
  }
 }
 choices.sort((a,b)=>b.weight-a.weight||Date.parse(a.m.kickoff)-Date.parse(b.m.kickoff));
 for(const x of choices.slice(0,20)){
  const key='r55_prematch_sent_'+x.day+'_'+x.m.id;
  const v=await pool.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO NOTHING RETURNING scope",
   [key,JSON.stringify({state:'sending',source:'bongdalu-r55',day:x.day,id:x.m.id,owner:'vinahost-vps'})]);
  if(!v.rowCount)continue;
  try{
   const msg=matchMessage(x.m);
   if(!validFootballMessage(msg))throw Error('football_message_not_exact_or_incomplete');
   const messageId=await send(msg);
   await pool.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",
    [key,JSON.stringify({state:'sent',source:'bongdalu-r55',day:x.day,id:x.m.id,
      messageId,group:CHANNEL,owner:'vinahost-vps',certified:false})]);
   return {sent:true,id:x.m.id,day:x.day,messageId,certified:false};
  }catch(e){
   // A Telegram timeout is ambiguous. Do not retry blindly or duplicate a message.
   await pool.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",
    [key,JSON.stringify({state:'delivery_uncertain',requiresReview:true,error:String(e.message||e).slice(0,130),day:x.day,id:x.m.id})]);
   throw e;
  }
 }
 return {reason:choices.length?'already_claimed':'no_fixture_5_to_40_min'};
}
const utcWindow=day=>new Date(day+'T05:05:00Z');
const noonGradeDeadline=()=>Date.parse(vnDate()+'T13:30:00+07:00');
async function freshFtGrade(){
 // Never send today's summary based on yesterday's score sync or a still-running job.
 try{
  const r=await fetch('http://football-native:3001/healthz',{signal:AbortSignal.timeout(7000)});
  if(!r.ok)return false;
  const h=await r.json();
  return h.ok===true&&h.lastGradeOK===true&&Number.isFinite(Date.parse(h.lastGrade||''))&&Date.parse(h.lastGrade)>=noonGradeDeadline();
 }catch{return false}
}
async function editSummary(messageId,text){
 if(!Number.isInteger(Number(messageId))||Number(messageId)<1)throw Error('invalid_previous_summary_message_id');
 const r=await fetch('https://api.telegram.org/bot'+token+'/editMessageText',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:CHANNEL,message_id:Number(messageId),
   text,parse_mode:'HTML',disable_web_page_preview:true}),signal:AbortSignal.timeout(11000)});
 const j=await r.json().catch(()=>({ok:false}));
 if(j.ok)return true;
 if(String(j.description||'').toLowerCase().includes('message is not modified'))return true;
 throw Error('telegram_edit_summary_failed_'+r.status);
}
const summaryMessage=report=>{
 const decided=report.win+report.half_win+report.half_loss+report.loss;
 const rate=decided?((report.win+.5*report.half_win)*100/decided).toFixed(1)+'%':'chưa đủ kết quả';
 const body='📊 KQ247 TỔNG KẾT SAU 13:30 VN\nKhung: 12:05 hôm trước → 12:05 hôm nay\n'+
  '⚽ Tổng số trận TOOL đã lên kèo: '+report.total+'\n✅ FT xác minh: '+report.settled+
  '\n⏳ Chưa có FT: '+(report.pending+report.notDue)+
  '\n🟢 Thắng: '+report.win+' | Thắng 1/2: '+report.half_win+
  '\n⚪ Hòa kèo: '+report.push+'\n🔴 Thua 1/2: '+report.half_loss+' | Thua: '+report.loss+
  '\n📈 Tỷ lệ thắng quy đổi: '+rate+'\n📊 Lãi/lỗ quy đổi: '+report.units;
 return boldTelegram(body);
};
async function noonGrade(){
 const today=vnDate(),yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const key='r55_telegram_sent_'+yesterday;
 if(!await freshFtGrade())return {reason:'awaiting_verified_ft_sync_after_1330'};
 const prior=await pool.query("SELECT payload FROM football_compact_stats WHERE scope=$1 LIMIT 1",[key]);
 const start=utcWindow(yesterday),end=utcWindow(today);
 const beforeYesterday=new Date(Date.parse(yesterday+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 // The public tool publishes one immutable daily Bongdalu snapshot. Count
 // ALL eligible market selections whose kickoff belongs to this report
 // window, not just the small subset the Telegram bot happened to post.
 // The previous two locked daily snapshots can contain fixtures in this
 // 12:05-to-12:05 reporting window.
 const snapshots=await pool.query(
  "SELECT day::text AS day,locked_at,payload FROM football_snapshots WHERE source='bongdalu-r55' AND day IN ($1::date,$2::date) ORDER BY day",
  [beforeYesterday,yesterday]);
 const byFixture=new Map(),from=start.getTime(),to=end.getTime();
 for(const snap of snapshots.rows){
  if(!snap.locked_at)continue;
  const lockedAt=new Date(snap.locked_at).getTime();
  const matches=typeof snap.payload==='string'?JSON.parse(snap.payload).matches:snap.payload?.matches;
  for(const m of matches||[]){
   const id=fixture(m),kick=Date.parse(m.kickoff||'');
   if(!id||!cleanMarket(m)||!Number.isFinite(kick)||kick<from||kick>=to||
      !Number.isFinite(lockedAt)||lockedAt>kick)continue;
   // Newer, still-prematch snapshot takes priority, never grade a retrospective selection.
   byFixture.set(id,{market:m.market,kickoff:kick,id});
  }
 }
 const final=await pool.query(
  "SELECT fixture_id::text AS id,home_score,away_score FROM football_final_results WHERE source='bongdalu-ft-verified' AND fixture_status='FT'");
 const finals=new Map(final.rows.map(x=>[x.id,x]));
 const report={total:byFixture.size,settled:0,pending:0,notDue:0,win:0,half_win:0,push:0,half_loss:0,loss:0,units:0,
  source:'all_locked_tool_predictions',windowStart:start.toISOString(),windowEnd:end.toISOString()};
 for(const entry of byFixture.values()){
  if(entry.kickoff>Date.now()-150*60000){report.notDue++;continue}
  const ft=finals.get(entry.id);
  const result=ft?settle(entry.market,Number(ft.home_score),Number(ft.away_score)):null;
  if(!result){report.pending++;continue}
  report.settled++;report[result.result]++;report.units+=result.profitUnits;
 }
 report.units=Number(report.units.toFixed(3));
 if(!snapshots.rows.length||!report.total)return {reason:'no_locked_tool_predictions_for_reporting_window'};
 const previous=prior.rows[0]?.payload;
 // A missing verified FT must never be advertised as zero wins/losses.
 // Leave the old message unchanged and retry when Bongdalu FT arrives.
 if(report.total>0&&report.settled===0&&report.pending>0)
  return {reason:'awaiting_confirmed_full_time_scores',posted:report.total,pending:report.pending};
 if(previous){
  if(previous.state!=='sent'||!previous.messageId)return {reason:'summary_delivery_claimed_or_uncertain'};
  if(previous.report?.source===report.source&&JSON.stringify(previous.report)===JSON.stringify(report))return {reason:'summary_up_to_date'};
  await editSummary(previous.messageId,summaryMessage(report));
  await pool.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",
   [key,JSON.stringify({...previous,report,editedAt:new Date().toISOString(),status:'corrected_after_verified_ft'})]);
  return {edited:true,messageId:previous.messageId,summary:report};
 }
 const claim=await pool.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO NOTHING RETURNING scope",
 [key,JSON.stringify({state:'sending',source:'bongdalu-r55',owner:'vinahost-vps',day:yesterday})]);
 if(!claim.rowCount)return {reason:'summary_claimed_by_another_process'};
 try{
  const messageId=await send(summaryMessage(report));
  await pool.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",
   [key,JSON.stringify({state:'sent',messageId,source:'bongdalu-r55',owner:'vinahost-vps',day:yesterday,report})]);
  return {sent:true,messageId,summary:report};
 }catch(e){
  await pool.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",
   [key,JSON.stringify({state:'delivery_uncertain',requiresReview:true,error:String(e.message||e).slice(0,130),day:yesterday})]);
  throw e;
 }
}
async function tick(){
 if(ticking||!active||!token)return;
 ticking=true;
 try{
  const hour=vnHour(),minute=vnMinute();
  let result=null;
  // Send or update the 12:05-to-12:05 report only after the 13:30 FT
  // refresh has completed. Keep prematch alerts active while it catches up.
  if(hour>=13&&!(hour===13&&minute<30)){
   const summary=await noonGrade();
   result=(summary.sent||summary.edited)?summary:await sendPick();
  }else result=await sendPick();
  lastResult=result;lastCheck=new Date().toISOString();
  if(result&&(result.sent||result.messageId))log('R55_VPS_GROUP_SEND_ACK',result);
 }catch(e){lastError=String(e.message||e).slice(0,180);console.error('R55_VPS_GROUP_TICK_FAILED',lastError);}
 finally{ticking=false;}
}
const health=http.createServer((req,res)=>{
 if(req.url!=='/healthz'){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify({ok:true,service:'r55-vps-telegram-group',active,tokenConfigured:!!token,
  lastCheck,lastResult,lastError,primarySender:active&&!!token}));
});
health.listen(3030,'0.0.0.0',()=>{
 log('R55_VPS_GROUP_BOOT',{active,tokenConfigured:!!token,group:CHANNEL});
 if(active&&!token)console.error('R55_VPS_GROUP_NOT_ARMED_MISSING_TOKEN');
});
setInterval(()=>void tick(),delay);
void tick();
