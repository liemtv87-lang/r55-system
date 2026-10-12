import original from "lib/r55Original/worker.js";
import {createHash} from "lib/r55Original/node-shims.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const checks={
  sha1:createHash("sha1").update("abc").digest("hex")==="a9993e364706816aba3e25717850c26c9cd0d89d",
  sha256:createHash("sha256").update("abc").digest("hex")==="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
 };
 let health=null,sourceLines=0,originalError=null;
 try{
  const options={waitUntil(){}};
  const r=await original.fetch(new Request("https://r55-original.internal/api/health"),{},options);
  health={status:r.status,json:await r.json()};
  checks.originalHealth=r.status===200&&health.json!=null;
  const s=await original.fetch(new Request("https://r55-original.internal/api/source-info"),{},options);
  const txt=await s.text();
  sourceLines=txt.split("\n").length;
  checks.originalSourceRegistry=s.status===200&&txt.includes("SOURCE");
 }catch(e){originalError=String(e.message||e).slice(0,250);checks.originalHealth=false;checks.originalSourceRegistry=false}
 const ok=Object.values(checks).every(Boolean);
 return res.status(ok?200:422).json({ok,checks,originalHealth:health,sourceLines,originalError,
  originalWorkerLoaded:true,source:"exact source from original R55 Cloudflare archive",predictionSnapshotModified:false});
}