import {db} from "hatchable";
import {normalizeR55} from "lib/r55.js";
import {vnWindowDay} from "lib/apiFootball.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
 return res.status(410).json({ok:false,error:"manual_ingestion_disabled_bongdalu_only",message:"Only verified Bongdalu scheduled ingestion can lock a daily snapshot."});
 const payload=req.body||{};
 const date=String(payload.date||vnWindowDay());
 const source=String(payload.source||"").trim().slice(0,200);
 const picks=payload.matches;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({ok:false,error:"invalid_date"});
 if(!source||source.length<5||!Array.isArray(picks)||picks.length>5000)return res.status(400).json({ok:false,error:"source_or_matches_invalid"});
 const {out,rejected}=normalizeR55(picks,date);
 if(!out.length)return res.status(422).json({ok:false,error:"no_valid_AH_OU_predictions",rejected:rejected.length});
 const data={date,source,locked:true,generatedAt:new Date().toISOString(),matches:out};
 const {rows}=await db.query("INSERT INTO football_snapshots(day,payload,source) VALUES ($1::date,$2::jsonb,$3) ON CONFLICT(day) DO NOTHING RETURNING day",[date,JSON.stringify(data),source]);
 await db.query("INSERT INTO football_ingest_audit(day,source,received_count,accepted_count,rejected_count,outcome) VALUES ($1::date,$2,$3,$4,$5,$6)",[date,source,picks.length,out.length,rejected.length,rows.length?"locked":"already_locked"]);
 return res.json({ok:true,date,locked:rows.length===1,alreadyLocked:rows.length===0,accepted:out.length,rejected:rejected.length});
}