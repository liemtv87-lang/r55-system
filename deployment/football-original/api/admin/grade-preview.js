import {gradeAtNoon} from "lib/r55Ops.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
 try{const a=await gradeAtNoon();return res.status(a.ok?200:503).json({ok:a.ok,report:a.report,verifiedSource:a.verifiedSource,learningReady:a.learningReady});}
 catch(e){return res.status(503).json({ok:false,error:String(e.message||e).slice(0,160)})}
}