export const access="scheduler";
export const methods=["GET","POST"];
export default async function(req,res){
 return res.status(410).json({ok:false,source:"Bongdalu-only",error:"legacy_api_football_poll_disabled",message:"Only /api/jobs/preflight-bongdalu at 11:00 and /api/jobs/noon-lock at 12:00 ICT may prepare or write football predictions."});
}