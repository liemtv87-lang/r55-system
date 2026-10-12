import {db,scheduler} from "hatchable";
import {planR55Prematch} from "lib/r55PrematchPlanner.js";
import {releaseDecision,freshRanking} from "lib/r55ReleaseGate.js";
export const access="scheduler";export const methods=["POST","GET"];
export default async function(req,res){
 const day=String(req.body?.day||"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return res.status(400).json({ok:false,error:"invalid_day"});
 const q=await db.query("SELECT payload,source FROM football_snapshots WHERE day=$1::date",[day]);
 if(q.rows[0]?.source!=="bongdalu-r55")return res.status(409).json({ok:false,error:"no_verified_locked_snapshot"});
 // Never queue Telegram picks until the public customer/main Neon API has been
 // read back and independently confirmed to match this exact frozen snapshot.
 const sync=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",["r55_neon_sync_"+day]);
 const matched=sync.rows[0]?.payload;
 const total=Array.isArray(q.rows[0]?.payload?.matches)?q.rows[0].payload.matches.length:0;
 if(!matched||matched.state!=="synced"||matched.readbackVerified!==true||Number(matched.count)!==total)
  return res.status(503).json({ok:false,error:"neon_customer_snapshot_not_verified",day,expectedCount:total,mirroredCount:matched?.count||0,queueBlocked:true});
 const scope="r55_prematch_queue_"+day;
 const present=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",[scope]);
 if(present.rows[0]?.payload?.queued===true)return res.json({ok:true,alreadyQueued:true,day,planned:present.rows[0].payload.count});
 // Recovery may follow an immediate operator-triggered send. Plan after its
 // actual cooldown rather than queueing a one-shot that can only be rejected.
 const recent=await db.query("SELECT updated_at FROM football_compact_stats WHERE scope LIKE 'r55_prematch_sent_%' AND payload->>'state'='sent' ORDER BY updated_at DESC LIMIT 1");
 const earliest=recent.rows.length?Date.parse(recent.rows[0].updated_at)+40*60000+1000:0;
 const planningNow=Math.max(Date.now(),earliest-60000);
 const audit=await db.query("SELECT payload FROM football_compact_stats WHERE scope='r55_method_rank' LIMIT 1");
 const rank=audit.rows[0]?.payload,valid=freshRanking(rank);
 // Queue sourced predictions even while walk-forward certification is still
 // collecting history. Each unvalidated forecast is explicitly labeled
 // 'tham khảo' by the sender; no fabricated success-rate claims.
 const all=(q.rows[0].payload?.matches||[]);
 const candidates=all.filter(m=>["AH","OU"].includes(m.market?.type)&&
   Number.isFinite(Number(m.market?.odds))&&Number(m.market?.odds)>=1.5&&Number(m.market?.odds)<=3.5);
 const independentlyValidated=candidates.filter(m=>releaseDecision(m,rank?.methods,valid).ok).length;
 // The daily snapshot is a full-coverage forecast/audit set, NOT an
 // invitation to post unvalidated low-quality markets to Telegram.
 const publishable=candidates.filter(m=>releaseDecision(m,rank?.methods,valid).ok);
 const plan=planR55Prematch(publishable,planningNow,40);
 const selected=plan.selected;
 // With no independently validated method, no picks are scheduled. Do not
 // fill a 40-60 minute Telegram quota with losing or untested matches.
 const tasks=[];
 for(const m of selected.slice(0,40)){
  const task=await scheduler.at(new Date(m.at),"/api/jobs/send-football-pick",{
   name:"r55-prematch-"+day+"-"+m.id,payload:{day,id:m.id,attempt:0}
  });
  tasks.push({id:m.id,at:new Date(m.at).toISOString(),taskId:task.id});
 }
 await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES ($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated_at=now()",[scope,JSON.stringify({queued:true,day,count:tasks.length,tasks,source:"bongdalu-locked-only",gapsMinutes:plan.gapsMinutes,gapsOver60:plan.gapsOver60})]);
 return res.json({ok:true,day,queued:tasks.length,eligible:plan.available,independentlyValidated,researchOnly:plan.available-independentlyValidated,gapsMinutes:plan.gapsMinutes,gapsOver60:plan.gapsOver60,onePickPerMatch:true,minMinutesBetweenPlannedSends:40,targetMaximumGapMinutes:60,source:"bongdalu-r55"});
}