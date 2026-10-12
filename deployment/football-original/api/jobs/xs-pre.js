import {scheduler} from "hatchable";
import {vnParts} from "lib/r55LotteryTelegram.js";
import {executeXs} from "lib/r55XsSender.js";
export const access="scheduler";
export const methods=["POST"];
const MAP={16:"xsmn",17:"xsmt",18:"xsmb"};
export default async function(req,res){
  const now=vnParts();
  const region=String(req.body?.region||MAP[now.hour]||"");
  const attempt=Math.max(0,Math.min(2,Number(req.body?.attempt)||0));
  if(!["xsmn","xsmt","xsmb"].includes(region))return res.json({ok:true,skipped:"outside_xs_pre_window"});
  try{
    const result=await executeXs(region,"pre");
    return res.status(result.ok?200:503).json(result);
  }catch(e){
    const err=String(e?.message||e).slice(0,150);
    if(attempt<2)await scheduler.at(new Date(Date.now()+10*60000),"/api/jobs/xs-pre",{name:"xs-pre-retry-"+vnParts().day+"-"+region,payload:{region,attempt:attempt+1}});
    return res.status(503).json({ok:false,region,phase:"pre",error:err,retry:attempt<2});
  }
}