import {db} from "hatchable";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const day=String(req.query?.day||new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()-(12*3600000+5*60000))));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return res.status(400).json({ok:false,error:"invalid_date"});
 const q=await db.query("SELECT payload,source,locked_at FROM football_snapshots WHERE day=$1::date",[day]);
 if(!q.rows.length)return res.status(404).json({ok:false,error:"snapshot_not_ready",date:day});
 res.json({ok:true,date:day,locked:true,source:q.rows[0].source,lockedAt:q.rows[0].locked_at,snapshot:q.rows[0].payload});
}