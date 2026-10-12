import {db} from "hatchable";
import {matchMessage} from "lib/r55TelegramFormat.js";
export const access="admin";export const methods=["POST"];
export default async function(req,res){
 const day=String(req.body?.day||""),id=String(req.body?.id||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^BDL_\d{5,12}$/.test(id))return res.status(400).json({ok:false,error:"invalid_arguments"});
 const s=await db.query("SELECT payload FROM football_snapshots WHERE day=$1::date AND source='bongdalu-r55'",[day]);
 const m=s.rows[0]?.payload?.matches?.find(x=>x.id===id);
 if(!m)return res.status(404).json({ok:false,error:"verified_match_not_found"});
 const q=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",["r55_prematch_sent_"+day+"_"+id]);
 const messageId=Number(q.rows[0]?.payload?.messageId);
 if(!Number.isInteger(messageId)||messageId<1)return res.status(409).json({ok:false,error:"sent_message_not_found"});
 const c=await db.query("SELECT secret FROM football_runtime_credentials WHERE name='telegram_group_bot_token'");
 const token=c.rows[0]?.secret||process.env.R55_TELEGRAM_BOT_TOKEN;
 if(!token)return res.status(503).json({ok:false,error:"token_unavailable"});
 const call=await fetch("https://api.telegram.org/bot"+token+"/editMessageText",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({chat_id:"@keochuyengia79",message_id:messageId,text:matchMessage(m),parse_mode:"HTML",disable_web_page_preview:true}),
  signal:AbortSignal.timeout(12000)
 });
 const x=await call.json().catch(()=>({ok:false}));
 if(!call.ok||x.ok!==true)return res.status(502).json({ok:false,error:String(x.description||"telegram_edit_failed").slice(0,150),messageId});
 await db.query("UPDATE football_compact_stats SET payload=jsonb_set(payload,'{format}',to_jsonb('bold_qc_v2'::text)),updated_at=now() WHERE scope=$1",["r55_prematch_sent_"+day+"_"+id]);
 return res.json({ok:true,edited:true,day,id,messageId,group:"@keochuyengia79",bold:true,qcRestored:true});
}