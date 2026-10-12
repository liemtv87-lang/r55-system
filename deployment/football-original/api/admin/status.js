import {db} from "hatchable";
import {vnWindowDay} from "lib/apiFootball.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const snap=await db.query("SELECT day::text AS day,source,locked_at,jsonb_array_length(COALESCE(payload->'matches','[]'::jsonb)) AS matches FROM football_snapshots ORDER BY day DESC LIMIT 8");
 res.json({ok:true,service:"KQ247 R55 Bongdalu primary",isolated:true,day:vnWindowDay(),source:"Bongdalu",apiKeyRequired:false,sourceProbe:"/api/admin/bongdalu-source-check",snapshotReady:snap.rows.some(x=>x.day===vnWindowDay()&&x.source==="bongdalu-r55"),legacySnapshotPresent:snap.rows.some(x=>x.day===vnWindowDay()&&x.source!=="bongdalu-r55"),snapshots:snap.rows,customerLinksSwitched:false});
}