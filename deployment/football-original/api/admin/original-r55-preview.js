// Original R55 worker source is preserved under lib/r55Original/, but its
// Goaloo/NowGoal feed is retired. Only the native Bongdalu adapter may
// generate, inspect, grade, or publish football market predictions.
export const access="admin";export const methods=["GET","POST"];
export default async function(req,res){
 return res.status(410).json({ok:false,error:"legacy_non_bongdalu_runtime_disabled",nativeBongdaluSource:"/api/admin/bongdalu-source-check",nativeBongdaluPreview:"/api/admin/bongdalu-full-preview",codePreserved:true});
}