import {db} from "hatchable";
import {boldTelegram} from "lib/r55TelegramFormat.js";
export const access="admin";
export const methods=["POST"];
const MAP={mb:"XSMB",mt:"XSMT",mn:"XSMN"};
const number=(x,n)=>new RegExp("^\\d{"+n+"}$").test(String(x||""));
const clean=x=>String(x||"").replace(/[<>&]/g,"").slice(0,80);
const state=x=>x?"✅ TRÚNG":"❌ TRƯỢT";
function message(day,region,stations){
 const totals={d50:0,d60:0,d75:0,three:0};
 const lines=["🎯 TỔNG KẾT XỔ SỐ KQ247 • "+MAP[region],"📅 Ngày: "+day.split("-").reverse().join("/"),"🔒 Chấm đúng dự đoán đã khóa"];
 for(const s of stations){
  const hit=s.lotto.reduce((v,x)=>v+Number(x.hits),0);
  const nums=s.lotto.filter(x=>x.hits>0).length;
  for(const k of Object.keys(totals))totals[k]+=s[k]?1:0;
  lines.push("━━━━━━━━━━━━━━","📍 "+clean(s.station),"🏆 Giải đặc biệt: "+s.special,
   "🎲 3 LÔ BẠCH THỦ: "+s.lotto.map(x=>x.num+" = "+x.hits+" nháy").join(" | "),
   "🔵 LÔ KÉP: "+s.doubles.map(x=>x.num+" = "+x.hits+" nháy").join(" | "),
   "🏅 ĐỀ "+s.de2+": D50 "+state(s.d50)+" • D60 "+state(s.d60)+" • D75 "+state(s.d75),
   "💎 3 CÀNG "+s.c3+": "+state(s.three),
   "📊 LÔ: "+nums+"/3 số có nháy • "+hit+" nháy");
 }
 lines.push("━━━━━━━━━━━━━━","📊 TỔNG KẾT TOÀN MIỀN ("+stations.length+" đài)",
   "🏅 DÀN 50: "+totals.d50+"/"+stations.length+" đài trúng",
   "🏅 DÀN 60: "+totals.d60+"/"+stations.length+" đài trúng",
   "🏅 DÀN 75: "+totals.d75+"/"+stations.length+" đài trúng",
   "💎 3 CÀNG: "+totals.three+"/"+stations.length+" đài trúng",
   "ℹ️ Chỉ đối chiếu dàn đã khóa trước khi quay.");
 const t=boldTelegram(lines.join("\n"));
 if(t.length>4000)throw Error("telegram_message_over_limit");
 if(/(?:client=1|onrender\.com|wix-site-host\.com|lovable\.app)/i.test(t))throw Error("customer_url_forbidden");
 return {text:t,totals};
}
const goodScores=(s)=>s&&typeof s.station==="string"&&s.station.length>0&&s.station.length<95&&
 number(s.special,s.special.length)&&s.special.length>=5&&s.special.length<=6&&
 number(s.de2,2)&&s.special.endsWith(s.de2)&&number(s.c3,3)&&s.special.endsWith(s.c3)&&
 ["d50","d60","d75","three"].every(k=>typeof s[k]==="boolean")&&
 Array.isArray(s.lotto)&&s.lotto.length===3&&Array.isArray(s.doubles)&&s.doubles.length===2&&
 [...s.lotto,...s.doubles].every(x=>number(x.num,2)&&Number.isInteger(x.hits)&&x.hits>=0&&x.hits<=27);
export default async function(req,res){
 const day=String(req.body?.day||""),region=String(req.body?.region||""),stations=req.body?.stations;
 if(day!=="2026-10-10"||!MAP[region]||!Array.isArray(stations)||stations.length!==(region==="mb"?1:region==="mt"?3:4)||!stations.every(goodScores))
  return res.status(400).json({ok:false,error:"unverified_or_incomplete_grade_payload"});
 const key="xs_telegram_summary_"+day+"_"+region;
 const st=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1 LIMIT 1",[key]);
 const existing=st.rows[0]?.payload;
 if(existing?.state!=="sent"||!Number.isInteger(Number(existing.messageId)))return res.status(409).json({ok:false,error:"original_post_not_confirmed"});
 const {text,totals}=message(day,region,stations);
 const creds=await db.query("SELECT secret FROM football_runtime_credentials WHERE name='telegram_group_bot_token' LIMIT 1");
 const token=creds.rows[0]?.secret;
 if(!token)return res.status(503).json({ok:false,error:"bot_token_not_configured"});
 const url="https://api.telegram.org/bot"+token+"/editMessageText";
 let raw;
 try{
  const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({chat_id:"@xsbm999",message_id:Number(existing.messageId),text,parse_mode:"HTML",disable_web_page_preview:true}),
   signal:AbortSignal.timeout(16000)});
  raw=await r.json().catch(()=>({ok:false}));
  if(!r.ok||raw.ok!==true)return res.status(502).json({ok:false,region,messageId:existing.messageId,error:String(raw.description||"telegram_edit_rejected").slice(0,155)});
 }catch(e){return res.status(503).json({ok:false,error:String(e.message||e).slice(0,120)})}
 await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",
  [key,JSON.stringify({...existing,format:"old_style_lotto_d50_d60_d75_3c_qc_bold",edited:true,editedAt:new Date().toISOString(),stats:totals})]);
 return res.json({ok:true,region,day,messageId:Number(existing.messageId),stations:stations.length,stats:totals,edited:true,linksToClient:false,allBold:true});
}