import {createOriginalBrain,withOriginalBrain,getOriginalStateStatus} from "lib/r55Original/native-store.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 try{
  const state=await withOriginalBrain(async()=>{
   const worker=createOriginalBrain();
   const r=await worker.fetch(new Request("https://auto/scan-status"));
   if(!r.ok)throw Error("original_AutoBrain_status_"+r.status);
   return r.json();
  });
  const stored=await getOriginalStateStatus();
  return res.json({ok:true,originalAutoBrain:true,status:state,storage:stored,livePredictionsConnected:false});
 }catch(e){return res.status(503).json({ok:false,error:String(e.message||e).slice(0,300)})}
}