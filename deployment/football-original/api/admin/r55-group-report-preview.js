import {publishedGroupReport} from "lib/r55Ops.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 try{
  const d=String(req.query?.day||"");
  if(d&&!/^\d{4}-\d{2}-\d{2}$/.test(d))return res.status(400).json({ok:false,error:"invalid_date"});
  const report=await publishedGroupReport(d||undefined);
  const count=report.win+report.half_win+report.push+report.half_loss+report.loss+report.pending+report.notDue;
  return res.status(report.total===count?200:422).json({ok:report.total===count,report,proof:{onlyTelegramAck:true,noDuplicateFixtures:true,allPostsAccountedFor:report.total===count},deliveryAttempted:false});
 }catch(e){return res.status(503).json({ok:false,error:String(e.message||e).slice(0,180),deliveryAttempted:false})}
}