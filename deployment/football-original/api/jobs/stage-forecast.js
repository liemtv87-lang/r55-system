import {processBongdaluChunk} from "lib/r55ChunkedBuild.js";
export const access="scheduler";
export const methods=["POST"];
export default async function(req,res){
 try{
  const result=await processBongdaluChunk("provisional");
  return res.status(result.ok?200:422).json({...result,stageOnly:true,noLockedSnapshotMutation:true});
 }catch(e){
  console.error("stage_forecast_failed",String(e?.message||e).slice(0,160));
  return res.status(503).json({ok:false,stageOnly:true,locked:false,error:String(e?.message||e).slice(0,170)});
 }
}