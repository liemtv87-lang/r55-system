import {inspectBongdalu} from "lib/bongdaluR55.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 try{const s=await inspectBongdalu();return res.json({ok:true,source:"Bongdalu",...s});}
 catch(e){return res.status(503).json({ok:false,source:"Bongdalu",error:String(e.message||e).slice(0,180)})}
}