import {db} from "hatchable";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 const q=await db.query("SELECT secret FROM football_runtime_credentials WHERE name='telegram_group_bot_token' LIMIT 1");
 const token=q.rows[0]?.secret;if(!token)return res.status(503).json({ok:false,error:"token_unavailable"});
 const base="https://api.telegram.org/bot"+token+"/";
 try{
  const [me,chat,member,admins,webhook]=await Promise.all([
   fetch(base+"getMe").then(r=>r.json()),
   fetch(base+"getChat?chat_id=@xsbm999").then(r=>r.json()),
   fetch(base+"getChatMember?chat_id=@xsbm999&user_id="+(await fetch(base+"getMe").then(r=>r.json())).result?.id).then(r=>r.json()),
   fetch(base+"getChatAdministrators?chat_id=@xsbm999").then(r=>r.json()),
   fetch(base+"getWebhookInfo").then(r=>r.json())
  ]);
  return res.json({ok:me.ok&&chat.ok&&member.ok,bot:me.result?.username,group:chat.result?.title||null,groupId:chat.result?.id||null,memberStatus:member.result?.status||null,adminBots:(admins.result||[]).filter(x=>x.user?.is_bot).map(x=>({name:x.user?.first_name,username:x.user?.username,status:x.status})),webhookConfigured:Boolean(webhook.result?.url),pendingUpdates:webhook.result?.pending_update_count||0,reason:!chat.ok?String(chat.description).slice(0,130):!member.ok?String(member.description).slice(0,130):null});
 }catch(e){return res.status(503).json({ok:false,error:String(e.message||e).slice(0,140)})}
}