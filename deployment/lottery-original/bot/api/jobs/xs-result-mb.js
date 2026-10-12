import {scheduler} from "hatchable";
import {vnParts} from "lib/r55LotteryTelegram.js";
import {executeXs} from "lib/r55XsSender.js";
export const access="scheduler";
export const methods=["POST"];
export default async function(req,res){
  const now=vnParts(), region="xsmb";
  const attempt=Math.max(0,Math.min(2,Number(req.body?.attempt)||0));
  try{
    const output=await executeXs(region,"result");
    return res.status(output.ok?200:503).json(output);
  }catch(e){
    const err=String(e?.message||e).slice(0,150);
    if(attempt<2)await scheduler.at(new Date(Date.now()+10*60000),"/api/jobs/xs-result-mb",{
      name:"xs-result-mb-retry-"+now.day,payload:{attempt:attempt+1}});
    return res.status(503).json({ok:false,region,phase:"result",error:err,retry:attempt<2});
  }
}