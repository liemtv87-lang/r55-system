import {getLockedNeonRegion,previewMessage,vnParts} from "lib/r55LotteryTelegram.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 const today=vnParts().day,region=String(req.query?.region||"xsmb");
 if(!["xsmb","xsmt","xsmn"].includes(region))return res.status(400).json({ok:false,error:"invalid_region"});
 try{
  const d=await getLockedNeonRegion(region,today);
  return res.json({ok:d.missing===0,date:today,region,stations:d.stations.map(s=>({name:s.station,ok:s.ok,error:s.error||null,lotto3:s.lotto3||[],doubles:s.doubles||[],prepared:s.ok?previewMessage(region,s.station,s):null}))});
 }catch(e){return res.status(503).json({ok:false,error:String(e?.message||e).slice(0,140)})}
}