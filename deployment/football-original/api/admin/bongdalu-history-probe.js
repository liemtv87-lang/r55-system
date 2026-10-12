import {inspectBongdaluHistoryProbe} from "lib/bongdaluR55.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){try{const d=await inspectBongdaluHistoryProbe();return res.json(d)}catch(e){return res.status(503).json({ok:false,error:String(e.message||e).slice(0,170)})}}