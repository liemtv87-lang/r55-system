import {scheduler} from "hatchable";
import {vnParts} from "lib/r55LotteryTelegram.js";
import {executeXs} from "lib/r55XsSender.js";
export const access="scheduler";
export const methods=["POST"];
const MAP={17:"xsmn",18:"xsmt"};
export default async function(req,res){
  const now=vnParts();
  const region=String(req.body?.region||MAP[now.hour]||"");
  // Keep retrying incomplete draw feeds; three total attempts can end before
  // the 17:00 XSMN draw has finished. Retries are scoped to each region/day.
  const attempt=Math.max(0,Math.min(18,Number(req.body?.attempt)||0));
  if(!["xsmn","xsmt","xsmb"].includes(region))return res.json({ok:true,skipped:"outside_xs_result_window"});
  try{
    const output=await executeXs(region,"result");
    return res.status(output.ok?200:503).json(output);
  }catch(e){
    const err=String(e?.message||e).slice(0,150);
    // Retry only after an incomplete/failed source read; never publish guessed
    // draw numbers. Use distinct task names to avoid collisions between retries.
    const delayMinutes=attempt<8?5:10;
    const nextAt=new Date(Date.now()+delayMinutes*60000);
    const nowVN=vnParts();
    const canRetry=attempt<18 && nowVN.day===vnParts(nextAt).day &&
      (nowVN.hour<19 || (nowVN.hour===19&&nowVN.minute<30));
    let queued=false,taskId=null,retryError=null;
    if(canRetry){
      try{
        const task=await scheduler.at(nextAt,"/api/jobs/xs-result",{
          name:"xs-result-retry-"+nowVN.day+"-"+region+"-"+(attempt+1),
          payload:{region,attempt:attempt+1}
        });
        taskId=task.id;queued=true;
      }catch(retryFailure){retryError=String(retryFailure?.message||retryFailure).slice(0,120);}
    }
    return res.status(503).json({ok:false,region,phase:"result",error:err,
      retryScheduled:queued,attempt,nextRetry:queued?nextAt.toISOString():null,
      retryTaskId:taskId,retryError});
  }
}