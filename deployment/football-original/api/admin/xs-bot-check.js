import {executeXs} from "lib/r55XsSender.js";
export const access="admin";
export const methods=["GET","POST"];
export default async function(req,res){
 const region=String(req.query?.region||req.body?.region||"xsmb");
 const phase=String(req.query?.phase||req.body?.phase||"result");
 const dryRun=req.method!=="POST"||req.body?.send!==true;
 // The date override is permitted only for read-only previews, never for live sending.
 const dayOverride=dryRun?String(req.query?.date||req.body?.date||'').trim()||null:null;
 try{
   const output=await executeXs(region,phase,{dryRun,dayOverride});
   return res.status(output.ok?200:503).json(output);
 }catch(e){
   return res.status(503).json({ok:false,region,phase,dryRun,error:String(e?.message||e).slice(0,180)});
 }
}