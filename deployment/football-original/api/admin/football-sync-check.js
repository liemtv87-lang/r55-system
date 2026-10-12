import {mirrorLockedFootball} from "lib/r55NeonSignedMirror.js";
export const access="admin";export const methods=["POST"];
export default async function(req,res){
 const day=String(req.body?.day||"");
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(day))return res.status(400).json({ok:false,error:"invalid_date"});
 try{
  const result=await mirrorLockedFootball(day);
  return res.status(result.ok?200:503).json(result);
 }catch(e){return res.status(503).json({ok:false,day,error:String(e.message||e).slice(0,160)})}
}