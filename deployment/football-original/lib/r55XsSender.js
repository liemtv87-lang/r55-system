import { db } from "hatchable";
import {getLockedNeonRegion,previewMessage,vnParts} from "lib/r55LotteryTelegram.js";
import {getXsDraws} from "lib/r55XsDraws.js";
import {boldTelegram} from "lib/r55TelegramFormat.js";

const CHAT="-1004320899120";
const LABEL={xsmb:"XSMB",xsmt:"XSMT",xsmn:"XSMN"};
const canonical=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[đĐ]/g,"d").toLowerCase().replace(/\s+/g," ").trim();
function composeSummary(day,region,station,pick,draw){
  const hit=(n)=>draw.all2.filter(v=>v===n).length;
  const hitLotto=pick.lotto3.reduce((sum,n)=>sum+hit(n),0);
  const end2=draw.special.slice(-2),end3=draw.special.slice(-3);
  const lines=[
    "📊 KQ247 • TỔNG KẾT "+LABEL[region]+" "+day.split("-").reverse().join("/"),
    "📍 ĐÀI: "+station,
    "🔒 Đối chiếu dự đoán đã khóa với kết quả thực tế",
    "🎯 3 LÔ BẠCH THỦ: "+pick.lotto3.map(n=>n+" ("+hit(n)+" nháy)").join(" • "),
    "🔵 LÔ KÉP: "+pick.doubles.map(n=>n+" ("+hit(n)+" nháy)").join(" • "),
    "📈 Tổng nháy của 3 lô: "+hitLotto,
    "🏅 ĐỀ "+end2+": D50 "+(pick.dan50.includes(end2)?"✅":"❌")+" • D60 "+(pick.dan60.includes(end2)?"✅":"❌")+" • D75 "+(pick.dan75.includes(end2)?"✅":"❌"),
    "💎 3 CÀNG "+end3+": "+(pick.three_digit.includes(end3)?"✅":"❌"),
    "ℹ️ Báo cáo đã đối chiếu số khóa từ trước giờ quay."
  ];
  return boldTelegram(lines.join("\n"));
}
function validateMsg(text){
 if(!text.startsWith("<b>")||!text.endsWith("</b>")||text.length>4096||
    !text.includes("muatool_du_doan_bot")||!text.includes("Tool Vietlott 6x45 6x55"))
    throw Error("telegram_message_invalid_or_too_long_"+text.length);
}
async function accessToken(){
 const data=await db.query("SELECT secret FROM football_runtime_credentials WHERE name = 'telegram_group_bot_token' LIMIT 1");
 const token=String(data.rows[0]?.secret||"");
 if(token.length<20)throw Error("xs_telegram_token_unavailable");
 return token;
}
async function checkBot(token){
 const base="https://api.telegram.org/bot"+token+"/";
 const m=await(await fetch(base+"getMe",{signal:AbortSignal.timeout(12000)})).json();
 if(!m.ok||!Number.isInteger(m.result?.id))throw Error("xs_telegram_getme_failed");
 const a=await(await fetch(base+"getChatMember?chat_id="+CHAT+"&user_id="+m.result.id,{signal:AbortSignal.timeout(12000)})).json();
 if(!a.ok||!["administrator","creator"].includes(a.result?.status))throw Error("xs_bot_not_group_admin");
 return m.result.username;
}
export async function executeXs(region,phase,{dryRun=false,dayOverride=null}={}){
 if(!LABEL[region]||!["pre","result"].includes(phase))throw Error("invalid_xs_mode");
 const day=dayOverride||vnParts().day;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error("invalid_xs_day");
 const snapshot=await getLockedNeonRegion(region,day);
 if(snapshot.missing!==0||snapshot.valid<1||snapshot.valid!==snapshot.stations.length)throw Error("xs_snapshot_not_complete_"+region);
 const names=snapshot.stations.map(s=>s.station);
 const draws=phase==="result"?await getXsDraws(day,region,names):null;
 const messages=snapshot.stations.map(s=>{
   const text=phase==="pre"?previewMessage(region,s.station,s):composeSummary(day,region,s.station,s,draws[s.station]);
   validateMsg(text);
   return {station:s.station,text,chars:text.length,grade:phase==="result"?{special:draws[s.station].special}:null};
 });
 if(dryRun)return {ok:true,dryRun:true,region,phase,day,stations:messages.map(({station,chars,grade})=>({station,chars,grade}))};
 if(phase==="result"){
   const key="xs_telegram_summary_"+day+"_"+region.slice(-2).replace("mb","mb").replace("mt","mt").replace("mn","mn");
   const old=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1 LIMIT 1",[key]);
   if(old.rows[0]?.payload?.state==="sent")return {ok:true,skipped:"previous_sender_already_sent",region,phase,day};
 }
 const token=await accessToken();
 const bot=await checkBot(token);
 const sent=[];
 for(const item of messages){
   const station=canonical(item.station);
   const claim=await db.query("INSERT INTO xs_group_delivery_v1(day,region,station,phase,status,snapshot_data) VALUES($1,$2,$3,$4,'claimed',$5::jsonb) ON CONFLICT DO NOTHING RETURNING day",
      [day,region,station,phase,JSON.stringify({station:item.station,chars:item.chars})]);
   if(!claim.rows.length){
     const existing=await db.query("SELECT status,message_id FROM xs_group_delivery_v1 WHERE day=$1 AND region=$2 AND station=$3 AND phase=$4",
       [day,region,station,phase]);
     sent.push({station:item.station,skipped:true,status:existing.rows[0]?.status||"claimed",messageId:existing.rows[0]?.message_id||null});
     continue;
   }
   try{
     const response=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{
       method:"POST",headers:{"content-type":"application/json"},
       body:JSON.stringify({chat_id:CHAT,text:item.text,parse_mode:"HTML",disable_web_page_preview:true}),
       signal:AbortSignal.timeout(15000)
     });
     const data=await response.json();
     if(!response.ok||data.ok!==true||!data.result?.message_id)
       throw Error("telegram_rejected_"+response.status+"_"+String(data.description||"no_message_id").slice(0,80));
     await db.query("UPDATE xs_group_delivery_v1 SET status='sent', message_id=$5, updated_at=now() WHERE day=$1 AND region=$2 AND station=$3 AND phase=$4",
       [day,region,station,phase,data.result.message_id]);
     sent.push({station:item.station,sent:true,messageId:data.result.message_id});
   }catch(e){
     // A Telegram timeout can hide a successful delivery. Never blindly retry.
     const error=String(e?.message||e).slice(0,120);
     await db.query("UPDATE xs_group_delivery_v1 SET status='uncertain',error=$5,updated_at=now() WHERE day=$1 AND region=$2 AND station=$3 AND phase=$4",
       [day,region,station,phase,error]);
     sent.push({station:item.station,uncertain:true,error});
   }
 }
 return {ok:sent.every(x=>!x.uncertain),day,region,phase,bot,sent};
}