import {runBongdaluR55Bridge} from "lib/bongdaluR55.js";
export const access="scheduler";
export const methods=["GET","POST"];
export default async function(req,res){
 try{
  const result=await runBongdaluR55Bridge();
  return res.status(result.ok?200:503).json(result);
 }catch(e){
  const msg=String(e?.message||e).slice(0,180);
  console.error("original_r55_bridge",msg);
  return res.status(503).json({ok:false,source:"original-r55",error:msg});
 }
}