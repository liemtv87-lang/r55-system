import {inspectBongdalu} from "lib/bongdaluR55.js";
export const access="admin";export const methods=["POST"];
export default async function(req,res){
 try{
  const data=await inspectBongdalu();
  return res.json({ok:true,source:"Bongdalu",mode:"read_only_verify",locked:false,fixtureCount:data.fixtureCount,marketCount:data.marketCount,bookmakers:data.bookmakers});
 }catch(e){return res.status(503).json({ok:false,source:"Bongdalu",error:String(e.message||e).slice(0,200)})}
}