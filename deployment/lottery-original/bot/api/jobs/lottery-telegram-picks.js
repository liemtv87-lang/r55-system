import {db} from "hatchable";
import {getLockedNeonRegion,previewMessage,TELEGRAM_XS_GROUP,vnParts} from "lib/r55LotteryTelegram.js";
export const access="scheduler";
export const methods=["POST","GET"];
// Invoked by individually armed one-time tasks at 16:10/12/14 MN, 17:10/12/14 MT and 18:10/12/14 MB (VN).
export default async function(req,res){
 return res.status(410).json({ok:false,disabled:true,reason:"single_sender_supabase_only"});
 const at=vnParts(),region=at.hour===16?"xsmn":at.hour===17?"xsmt":at.hour===18?"xsmb":null;
 if(!region||![10,12,14].includes(at.minute))return res.json({ok:true,skipped:true,reason:"outside_predraw_schedule",...at});
 let loaded;try{loaded=await getLockedNeonRegion(region,at.day)}catch(e){return res.status(503).json({ok:false,region,error:String(e?.message||e).slice(0,140)})}
 if(loaded.missing)return res.status(503).json({ok:false,region,day:at.day,reason:"not_all_station_snapshots_approved",stations:loaded.stations.map(x=>({station:x.station,ok:x.ok,error:x.error||null}))});
 const credential=await db.query("SELECT secret FROM football_runtime_credentials WHERE name='telegram_group_bot_token' LIMIT 1");
 const token=credential.rows[0]?.secret||process.env.R55_TELEGRAM_BOT_TOKEN;
 if(!token)return res.status(503).json({ok:false,error:"telegram_group_token_unavailable"});
 const sent=[];
 for(const station of loaded.stations){
  const key="xs_locked_pick_"+at.day+"_"+region+"_"+encodeURIComponent(station.station);
  const prior=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",[key]);
  if(prior.rows[0]?.payload?.status==="sent"){sent.push({station:station.station,alreadySent:true,messageId:prior.rows[0].payload.messageId});continue}
  // One-time DB claim to prevent concurrent Telegram sends across retry invocations.
  const claim=await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO NOTHING RETURNING scope",[key,JSON.stringify({status:"sending",day:at.day,region,station:station.station})]);
  if(!claim.rows.length){sent.push({station:station.station,alreadyClaimed:true});continue}
  try{
   const content=previewMessage(region,station.station,station);
   const response=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({chat_id:TELEGRAM_XS_GROUP,text:content,parse_mode:"HTML",disable_web_page_preview:true}),
    signal:AbortSignal.timeout(12000)
   });
   const payload=await response.json().catch(()=>({ok:false}));
   if(!response.ok||payload.ok!==true)throw Error("telegram_"+response.status+"_"+String(payload.description||"send_failed").slice(0,80));
   const messageId=payload.result?.message_id;
   await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",[key,JSON.stringify({status:"sent",day:at.day,region,station:station.station,messageId,source:"neon_main_locked_only",format:"all_bold_full_qc_no_customer_urls"})]);
   sent.push({station:station.station,ok:true,messageId});
  }catch(e){
   // A Telegram timeout can mean the message WAS accepted. Never automatically
   // release the station claim: this was the unsafe retry path that can spam a station.
   // Keep an explicit review-required state until message existence is verified.
   const reason=String(e?.message||e).slice(0,140);
   await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1 AND payload->>'status'='sending'",
     [key,JSON.stringify({status:"delivery_uncertain",day:at.day,region,station:station.station,error:reason})]).catch(()=>{});
   sent.push({station:station.station,ok:false,needsReview:true,error:reason});
  }
 }
 const ok=sent.every(x=>x.ok||x.alreadySent);
 return res.status(ok?200:503).json({ok,day:at.day,region,sent,source:"neon_main",allBold:true,customerLinks:false});
}