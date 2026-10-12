import {db} from "hatchable";
export const access="admin";
export const methods=["POST"];
const HEX=/^[0-9a-f]{64}$/;
export default async function(req,res){
 const items=req.body?.licenses;
 if(!Array.isArray(items)||!items.length||items.length>100)return res.status(400).json({ok:false,error:"invalid_batch"});
 let saved=0,rejected=0,duplicates=0;
 for(const x of items){
   const hash=String(x?.code_hash||"").toLowerCase();
   const device=x?.device_hash?String(x.device_hash).toLowerCase():null;
   const expires=String(x?.expires_at||"");
   const e=new Date(expires);
   if(!HEX.test(hash)||(device&&!HEX.test(device))||!Number.isFinite(e.getTime())||e.getTime()<Date.now()||e.getTime()>Date.now()+3*366*864e5){rejected++;continue}
   const {rows}=await db.query(
    "INSERT INTO football_customer_access(code_hash,device_hash,expires_at,active,source) VALUES ($1,$2,$3::timestamptz,true,'one-time-import') ON CONFLICT(code_hash) DO NOTHING RETURNING code_hash",
    [hash,device,expires]
   );
   if(rows.length)saved++;else duplicates++;
 }
 res.json({ok:true,saved,rejected,duplicates,all_codes_hashed:true,existing_codes_unchanged:true});
}