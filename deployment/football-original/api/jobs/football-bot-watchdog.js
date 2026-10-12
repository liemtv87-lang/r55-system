import {db,scheduler} from "hatchable";
export const access="scheduler";
export const methods=["POST","GET"];
const vnDay=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const vnHour=()=>Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
export default async function(req,res){
 const day=vnDay(),hour=vnHour(),now=Date.now();
 try{
  const [snapshot,queue,last]=await Promise.all([
   db.query("SELECT source,locked_at FROM football_snapshots WHERE day=$1::date LIMIT 1",[day]),
   db.query("SELECT payload,updated_at FROM football_compact_stats WHERE scope=$1 LIMIT 1",["r55_prematch_queue_"+day]),
   db.query("SELECT updated_at FROM football_compact_stats WHERE scope LIKE 'r55_prematch_sent_%' AND payload->>'state'='sent' ORDER BY updated_at DESC LIMIT 1")
  ]);
  const source=snapshot.rows[0]?.source||null,verified=source==="bongdalu-r55";
  const queued=queue.rows[0]?.payload?.queued===true;
  const scope="r55_watchdog_"+day;
  let action="watching",nextTask=null;
  if(hour>=13&&hour<=20&&!queued){
   const prev=(await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",[scope])).rows[0]?.payload||{};
   const attempts=Number(prev.attempts||0),lastAttempt=Date.parse(String(prev.at||""))||0;
   if(attempts<3&&now-lastAttempt>25*60000){
    const route=verified?"/api/jobs/queue-football-picks":"/api/jobs/noon-lock";
    const payload=verified?{day}:{watchdog:true};
    // Reserve the retry before scheduling, so concurrent watchdog runs cannot
    // fan out duplicate jobs; queue and send endpoints remain idempotent.
    const next={attempts:attempts+1,at:new Date(now).toISOString(),route,verified,source};
    await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[scope,JSON.stringify(next)]);
    try{
     const job=await scheduler.at(new Date(now+60000),route,{name:"r55-watchdog-"+day+"-"+(attempts+1),payload});
     action=verified?"queue_recovery_scheduled":"snapshot_recovery_scheduled";
     nextTask=job.id;
    }catch(e){action="scheduler_error:"+String(e.message||e).slice(0,120)}
   }else action=attempts>=3?"retry_budget_exhausted":"awaiting_next_retry_window";
  }else if(hour<13)action="awaiting_13h_snapshot";
  const lastAt=last.rows[0]?.updated_at||null;
  console.log("R55_BOT_WATCHDOG",JSON.stringify({day,hour,verified,queued,action,nextTask,lastSent:lastAt}));
  return res.json({ok:true,day,hour,verifiedSnapshot:verified,queued,action,nextTask,lastPickPostedAt:lastAt});
 }catch(e){console.error("R55_BOT_WATCHDOG_ERROR",String(e.message||e).slice(0,180));return res.status(503).json({ok:false,error:"watchdog_check_failed"})}
}