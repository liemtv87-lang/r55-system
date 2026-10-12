import {previewBongdaluR55Bridge} from "lib/bongdaluR55.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 const limit=Math.min(100,Math.max(1,Number(req.query?.limit)||30));
 try{
  const p=await previewBongdaluR55Bridge();
  if(!p.ok)return res.status(503).json({ok:false,source:"Bongdalu",previewOnly:true,error:p.error||"live_market_unavailable"});
  return res.json({ok:true,source:"Bongdalu",previewOnly:true,snapshotLocked:false,day:p.day,total:p.eligible,limit,matches:(p.examples||[]).slice(0,limit)});
 }catch(e){return res.status(503).json({ok:false,source:"Bongdalu",error:String(e.message||e).slice(0,160)})}
}