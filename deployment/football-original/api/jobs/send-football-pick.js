import {db,scheduler} from "hatchable";
import {matchMessage,researchMessage,validFootballMessage} from "lib/r55TelegramFormat.js";
import {releaseDecision,freshRanking} from "lib/r55ReleaseGate.js";
export const access="scheduler";export const methods=["POST"];
const group="@keochuyengia79";
const clean=s=>String(s||"").replace(/[<>]/g,"").slice(0,110);
const vn=ms=>new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit"}).format(new Date(ms));
export default async function(req,res){
 const day=String(req.body?.day||""),id=String(req.body?.id||""),attempt=Number(req.body?.attempt||0);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^BDL_\d{5,12}$/.test(id))return res.status(400).json({ok:false,error:"invalid_arguments"});
 const q=await db.query("SELECT payload,source FROM football_snapshots WHERE day=$1::date",[day]);
 if(q.rows[0]?.source!=="bongdalu-r55")return res.status(409).json({ok:false,error:"snapshot_not_verified"});
 const m=(q.rows[0].payload?.matches||[]).find(m=>m.id===id);
 const kickoff=Date.parse(m?.kickoff||""),now=Date.now();
 if(!m||!Number.isFinite(kickoff)||kickoff-now<5*60000||kickoff-now>40*60000)return res.status(409).json({ok:false,error:"not_in_prematch_window"});
 if(!["AH","OU"].includes(m.market?.type))return res.status(422).json({ok:false,error:"market_invalid"});
 const audit=await db.query("SELECT payload FROM football_compact_stats WHERE scope='r55_method_rank' LIMIT 1");
 const rank=audit.rows[0]?.payload;
 const gate=releaseDecision(m,rank?.methods,freshRanking(rank));
 if(!gate.ok){
  // Fail closed: never send research-only, unvalidated, stale or negative-EV
  // markets as public football picks. Historic frozen forecasts remain auditable.
  console.warn("R55_UNCERTIFIED_PICK_BLOCKED",JSON.stringify({day,id,reason:gate.reason,
   researchOnly:m.market?.researchOnly,bookmakers:m.market?.bookmakers,line:m.market?.line}));
  return res.status(200).json({ok:true,day,id,sent:false,blocked:true,
   reason:gate.reason,qualityGate:"verified_walk_forward_only"});
 }
 const previous=await db.query("SELECT updated_at FROM football_compact_stats WHERE scope LIKE 'r55_prematch_sent_%' AND payload->>'state'='sent' ORDER BY updated_at DESC LIMIT 1");
 if(previous.rows.length&&now-new Date(previous.rows[0].updated_at).getTime()<40*60000){
  // Scheduler/Telegram latency can make nominal 40-minute slots a few seconds short.
  // Defer until the actual cooldown expires instead of losing this one-shot.
  const retryAt=Math.max(now+60000,new Date(previous.rows[0].updated_at).getTime()+40*60000+1000);
  if(kickoff-retryAt>=5*60000){
   const task=await scheduler.at(new Date(retryAt),"/api/jobs/send-football-pick",{
    name:"r55-spacing-"+day+"-"+id+"-"+retryAt,payload:{day,id,attempt}
   });
   return res.status(202).json({ok:true,deferred:true,reason:"min_40_minutes_between_actual_posts",id,retryAt:new Date(retryAt).toISOString(),taskId:task.id});
  }
  return res.status(409).json({ok:false,error:"spacing_would_miss_prematch_window",id});
 }
 const message=gate.ok?matchMessage(m):researchMessage(m);
 if(!validFootballMessage(message))return res.status(422).json({ok:false,error:"telegram_format_missing_bold_qc_or_contains_rating",sent:false});
 const scope="r55_prematch_sent_"+day+"_"+id;
 const claimed=await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now() WHERE football_compact_stats.payload->>'state'='rejected' RETURNING scope",[scope,JSON.stringify({state:"sending",id,day,attempt})]);
 if(!claimed.rows.length)return res.json({ok:true,alreadySentOrClaimed:true,id});
 let token=process.env.R55_TELEGRAM_BOT_TOKEN||null;
 if(!token){const q=await db.query("SELECT secret FROM football_runtime_credentials WHERE name='telegram_group_bot_token'");token=q.rows[0]?.secret||null;}
 let error=null,body=null;
 if(!token)error="bot_token_unconfigured";
 else{
  try{
   const r=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({chat_id:group,text:message,parse_mode:"HTML",disable_web_page_preview:true}),
    signal:AbortSignal.timeout(12000)
   });
   const j=await r.json().catch(()=>({ok:false}));
   if(!r.ok||j.ok!==true)error="telegram_send_failed_"+r.status+"_"+String(j.description||"").slice(0,80);
   else if(!Number.isInteger(Number(j.result?.message_id)))error="telegram_accepted_without_message_id";
   else body={messageId:Number(j.result.message_id),group};
  }catch(e){error="telegram_transport_"+String(e.message||e).slice(0,90)}
 }
 if(error){
  // A network timeout or missing message ID might happen AFTER Telegram accepts
  // a message. Keep the claim permanently until an operator verifies delivery.
  // Never automatically resend in that ambiguous state.
  const uncertain=error.startsWith("telegram_transport_")||error==="telegram_accepted_without_message_id";
  if(uncertain){
   await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1 AND payload->>'state'='sending'",
     [scope,JSON.stringify({state:"delivery_uncertain",day,id,attempt,error,requiresReview:true,source:"bongdalu-r55"})]);
   return res.status(202).json({ok:false,day,id,deliveryUncertain:true,needsReview:true,automaticRetry:false,error});
  }
  // Telegram explicitly rejected the send, so retry only when enough time
  // remains before kickoff and the rejection was not caused by bad credentials.
  await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1 AND payload->>'state'='sending'",
    [scope,JSON.stringify({state:"rejected",day,id,attempt,error,source:"bongdalu-r55"})]);
  if(attempt<2&&kickoff-Date.now()>10*60000&&!/telegram_send_failed_(400|401|403)_/.test(error)){
   try{await scheduler.at(new Date(Date.now()+2*60000),"/api/jobs/send-football-pick",
     {name:"r55-retry-"+day+"-"+id+"-"+(attempt+1),payload:{day,id,attempt:attempt+1}});}catch{}
  }
  return res.status(503).json({ok:false,error,attempt,notSent:true,requiresReview:true});
 }
 await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",[scope,JSON.stringify({state:"sent",day,id,...body,source:"bongdalu-r55"})]);
 return res.json({ok:true,day,id,...body});
}