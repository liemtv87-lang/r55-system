import {scheduler} from "hatchable";
import {vnParts} from "lib/r55LotteryTelegram.js";
export const access="scheduler";
export const methods=["GET","POST"];
// A declared cron is limited to 1h minimum; create one-time tasks for each minute.
// Disabled: Supabase is the single lottery Telegram sender; keep this endpoint unscheduled for diagnostics only.
export default async function(req,res){
 const now=new Date(),v=vnParts(now);
 const region=v.hour===16?"xsmn":v.hour===17?"xsmt":v.hour===18?"xsmb":null;
 if(!region)return res.json({ok:true,skipped:true,reason:"outside_lottery_hour"});
 const out=[];
 for(const minute of [10,12,14]){
  const at=new Date(now);at.setUTCMinutes(minute,0,0);
  if(at.getTime()<Date.now()+60000)continue;
  try{
   const t=await scheduler.at(at,"/api/jobs/lottery-telegram-picks",{
    name:"xs-neon-"+v.day+"-"+region+"-"+minute,
    payload:{day:v.day,region,attemptMinute:minute}
   });
   out.push({minute,time:at.toISOString(),taskId:t.id,ok:true});
  }catch(e){out.push({minute,ok:false,error:String(e?.message||e).slice(0,140)})}
 }
 const ok=out.length>0&&out.every(x=>x.ok);
 return res.status(ok?200:503).json({ok,date:v.day,region,armed:out,source:"Neon locked web only",noCustomerLinks:true});
}