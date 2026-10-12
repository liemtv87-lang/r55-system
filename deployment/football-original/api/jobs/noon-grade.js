import {gradeAtNoon,sendReport} from "lib/r55Ops.js";
export const access="scheduler";
export const methods=["GET","POST"];
export default async function(req,res){
 try{
  const grade=await gradeAtNoon();
  const telegram=grade.ok?await sendReport():{ok:false,error:"bongdalu_grade_not_ready"};
  return res.status(grade.ok&&telegram.ok?200:503).json({ok:grade.ok&&telegram.ok,grade:{day:grade.day,verifiedSource:grade.verifiedSource,report:{...grade.report,detail:undefined},rankedMethods:grade.rankedMethods,learningReady:grade.learningReady},telegram:{...telegram,dispatchSource:"Hatchable 13:00 Vietnam daily grade"}});
 }catch(e){return res.status(503).json({ok:false,error:String(e.message||e).slice(0,160)})}
}