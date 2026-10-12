import {previewBongdaluR55Bridge} from "lib/bongdaluR55.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 try{const result=await previewBongdaluR55Bridge();
  return res.status(result.ok?200:422).json(result);
 }catch(e){
  return res.status(503).json({ok:false,previewOnly:true,error:String(e?.message||e).slice(0,250)});
 }
}