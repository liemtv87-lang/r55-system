import {db} from "hatchable";
import {settle} from "lib/r55Settlement.js";
import {releaseDecision,freshRanking} from "lib/r55ReleaseGate.js";
export const access="public";
export const methods=["POST"];
async function digest(value){
 const bytes=new TextEncoder().encode(value);
 const result=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(result)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()-(12*3600000+5*60000)));
export default async function(req,res){
 const body=req.body||{};
 const code=String(body.code||"").trim();
 const device=String(body.device||"").trim();
 if(code.length<8||code.length>128||device.length<8||device.length>256)return res.status(400).json({ok:false,error:"invalid_input"});
 const codeHash=await digest(code);
 const devHash=await digest(device);
 // Atomic first-device binding. Existing customers can re-use a code only from their bound device.
 const {rows}=await db.query(
  "UPDATE football_customer_access SET device_hash=COALESCE(device_hash,$2),last_seen_at=now() WHERE code_hash=$1 AND active=true AND expires_at>now() AND (device_hash IS NULL OR device_hash=$2) RETURNING expires_at",
  [codeHash,devHash]
 );
 if(!rows.length)return res.status(403).json({ok:false,error:"invalid_expired_or_wrong_device"});
 const day=String(body.day||today());
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return res.status(400).json({ok:false,error:"invalid_day"});
 const q=await db.query("SELECT payload,source,locked_at FROM football_snapshots WHERE day=$1::date AND source='bongdalu-r55'",[day]);
 if(!q.rows.length)return res.status(404).json({ok:false,error:"snapshot_not_ready",date:day,expiresAt:rows[0].expires_at});
 const snap=q.rows[0];
 const raw=Array.isArray(snap.payload?.matches)?snap.payload.matches:[];
 const audit=await db.query("SELECT payload FROM football_compact_stats WHERE scope='r55_method_rank' LIMIT 1");
 const rank=audit.rows[0]?.payload;
 // Return every verified-source forecast for coverage and settlement.
 // Keep rigorous performance qualification as a per-match flag, never a
 // reason to delete a customer's frozen snapshot predictions.
 const matches=raw.map(m=>({...m,performanceValidated:releaseDecision(m,rank?.methods,freshRanking(rank)).ok}));
 const ids=matches.map(m=>String(m.id||"").replace(/^(?:BDL_|S01_)/,"")).filter(id=>/^\d{5,12}$/.test(id));
 const finish=ids.length?await db.query("SELECT fixture_id::text AS id,home_score,away_score FROM football_final_results WHERE source='bongdalu-ft-verified' AND fixture_status='FT' AND fixture_id::text=ANY($1::text[])",[ids]):{rows:[]};
 const finished=new Map(finish.rows.map(x=>[String(x.id),x]));
 const grades={};
 for(const m of matches){
  const game=finished.get(String(m.id||"").replace(/^(?:BDL_|S01_)/,""));
  if(!game)continue;
  const rating=settle(m.market,Number(game.home_score),Number(game.away_score));
  if(rating)grades[String(m.id)]={...rating,homeScore:Number(game.home_score),awayScore:Number(game.away_score)};
 }
 return res.json({ok:true,date:day,expiresAt:rows[0].expires_at,snapshot:{...snap.payload,matches,qualityGate:"all_bongdalu_source_predictions_tagged_by_validation",blocked:0,unvalidated:matches.filter(m=>!m.performanceValidated).length},lockedAt:snap.locked_at,source:snap.source,grades});
}