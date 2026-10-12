import {db} from "hatchable";
import {boldTelegram} from "lib/r55TelegramFormat.js";
export const access="admin";
export const methods=["POST"];
const GROUP="@xsbm999";
const REGIONS={mb:"XSMB",mt:"XSMT",mn:"XSMN"};
const safe=s=>String(s??"").replace(/https?:\/\/\S+|(?:^|\s)(?:www\.)?\S+\.(?:app|pages\.dev|workers\.dev|onrender\.com|wix-site-host\.com)\S*/gi,"").replace(/[<>]/g,"").trim().slice(0,100);
const num=s=>/^\d{2}$/.test(String(s||""));
const scored=x=>Array.isArray(x)&&x.every(y=>num(y.num)&&Number.isInteger(Number(y.hits))&&Number(y.hits)>=0&&Number(y.hits)<=27);
function makeText(day,region,stations){
 const label=REGIONS[region];
 let totalHits=0,stationsWithHit=0;
 const lines=["📊 KQ247 • TỔNG KẾT "+label+" "+day.split("-").reverse().join("/"),
   "🔒 Đối chiếu dàn đã khóa trước giờ quay với kết quả thực tế",
   "🧾 BÁO CÁO THEO TỪNG ĐÀI"];
 for(const s of stations){
  const hit=s.lotto_scored.reduce((a,x)=>a+Number(x.hits),0);
  const nhays=s.lotto_scored.filter(x=>Number(x.hits)>0).length;
  totalHits+=hit;if(hit>0)stationsWithHit++;
  lines.push("━━━━━━━━━━━━━━","🏅 "+safe(s.station),
   "🎯 3 LÔ BẠCH THỦ: "+s.lotto_scored.map(x=>x.num+" ("+Number(x.hits)+" nháy)").join(" • "),
   "🎯 LÔ KÉP: "+s.doubles_scored.map(x=>x.num+" ("+Number(x.hits)+" nháy)").join(" • "),
   "✅ Trúng "+nhays+"/3 số • "+hit+" nháy");
 }
 lines.push("━━━━━━━━━━━━━━","📈 Toàn miền: "+stationsWithHit+"/"+stations.length+" đài có ≥1 nháy • tổng "+totalHits+" nháy",
   "ℹ️ Báo cáo đối chiếu số đã khóa; không phải dự đoán mới sau khi quay.");
 return boldTelegram(lines.join("\n"));
}
export default async function(req,res){
 return res.status(410).json({ok:false,disabled:true,reason:"lottery_single_sender_supabase_only"});
 const day=String(req.body?.day||""),regions=req.body?.regions;
 if(!/^20\d\d-\d\d-\d\d$/.test(day)||!regions||typeof regions!=="object")return res.status(400).json({ok:false,error:"invalid_report"});
 const sent=[];
 const bot=await db.query("SELECT secret FROM football_runtime_credentials WHERE name='telegram_group_bot_token' LIMIT 1");
 const token=bot.rows[0]?.secret||process.env.R55_TELEGRAM_BOT_TOKEN;
 if(!token)return res.status(503).json({ok:false,error:"telegram_token_missing"});
 for(const region of ["mb","mt","mn"]){
  const stations=regions[region];
  if(!Array.isArray(stations)||!stations.length)continue;
  if(stations.length>6||!stations.every(x=>safe(x.station).length>0&&scored(x.lotto_scored)&&x.lotto_scored.length===3&&scored(x.doubles_scored)&&x.doubles_scored.length<=2))
    return res.status(400).json({ok:false,error:"invalid_station_scores",region});
  const scope="xs_telegram_summary_"+day+"_"+region;
  const claimed=await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES ($1,$2::jsonb,now()) ON CONFLICT(scope) DO NOTHING RETURNING scope",[scope,JSON.stringify({state:"sending",day,region})]);
  if(!claimed.rows.length){const old=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",[scope]);sent.push({region,alreadySent:true,messageId:old.rows[0]?.payload?.messageId||null});continue;}
  const msg=makeText(day,region,stations);
  if(/(?:https?:\/\/\S*\.(?:app|workers\.dev|pages\.dev|onrender\.com))|kq247[^\s]*\.(?:app|com)/i.test(msg)){await db.query("DELETE FROM football_compact_stats WHERE scope=$1",[scope]);return res.status(422).json({ok:false,error:"customer_link_detected"});}
  try{
   const reply=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({chat_id:GROUP,text:msg,parse_mode:"HTML",disable_web_page_preview:true}),
    signal:AbortSignal.timeout(15000)});
   const output=await reply.json().catch(()=>({ok:false}));
   if(!reply.ok||output.ok!==true)throw Error("telegram_"+reply.status+"_"+String(output.description||"failed").slice(0,120));
   const messageId=output.result?.message_id;
   await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",[scope,JSON.stringify({state:"sent",day,region,messageId,stations:stations.length,format:"all_bold_full_qc_no_customer_links"})]);
   sent.push({region,ok:true,messageId,stations:stations.length});
  }catch(e){
   await db.query("DELETE FROM football_compact_stats WHERE scope=$1 AND payload->>'state'='sending'",[scope]);
   sent.push({region,ok:false,error:String(e.message||e).slice(0,160)});
  }
 }
 return res.status(sent.every(x=>x.ok||x.alreadySent)?200:503).json({ok:sent.every(x=>x.ok||x.alreadySent),day,group:GROUP,sent,footer:"full_QC",allBold:true,customerLinks:false});
}