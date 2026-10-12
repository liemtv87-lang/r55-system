import {db,scheduler} from "hatchable";
import {processBongdaluChunk} from "lib/r55ChunkedBuild.js";
import {mirrorLockedFootball} from "lib/r55NeonSignedMirror.js";
export const access="scheduler";
export const methods=["GET","POST"];
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export default async function(req,res){
 const day=today();
 const localHour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
 if(localHour<13)return res.status(425).json({ok:false,day,locked:false,reason:"snapshot_only_at_or_after_13h_VN",retryAt:"13:00 Asia/Ho_Chi_Minh"});
 try{
  const before=await db.query("SELECT source,locked_at,jsonb_array_length(COALESCE(payload->'matches','[]'::jsonb))::int AS n FROM football_snapshots WHERE day=$1::date",[day]);
  if(before.rows.length&&before.rows[0].source==="bongdalu-r55"){
   const mirror=await mirrorLockedFootball(day);
   if(!mirror.ok)return res.status(503).json({ok:false,day,locked:true,mirror,queueBlocked:true,retryOnExistingNoonLock:true});
   const verified=true;
   // Recover prematch scheduling only if a verified snapshot exists and the queue was never created.
   let queueRecovered=false;
   if(verified){
    const existing=await db.query("SELECT 1 FROM football_compact_stats WHERE scope=$1",["r55_prematch_queue_"+day]);
    if(!existing.rows.length){try{await scheduler.at(new Date(Date.now()+60000),"/api/jobs/queue-football-picks",{name:"r55-queue-"+day,payload:{day}});queueRecovered=true}catch{}}
   }
   return res.status(verified?200:409).json({ok:verified,day,alreadyLocked:true,lockedAt:before.rows[0].locked_at,picks:verified?before.rows[0].n:0,legacySource:!verified,notRecomputed:true,prematchQueueRecovered:queueRecovered,mirrorSynced:true});
  }
  const result=await processBongdaluChunk("official");
  if(!result.ok)return res.status(503).json({ok:false,day,locked:false,reason:result.error||"chunk_progress_failed",result});
  if(!result.completed)return res.json({ok:true,day,locked:false,processing:true,checked:result.checked,marketPool:result.marketPool,eligibleSoFar:result.eligible,nextChunkScheduled:result.scheduled,queueError:result.queueError});
  const verify=await db.query("SELECT locked_at,jsonb_array_length(COALESCE(payload->'matches','[]'::jsonb))::int AS n,source FROM football_snapshots WHERE day=$1::date",[day]);
  if(!verify.rows.length)return res.status(503).json({ok:false,day,locked:false,retryWillRun:true,reason:result.error||"insufficient_verified_sources",checked:result.checked||0});
  if(verify.rows[0].source!=="bongdalu-r55")return res.status(409).json({ok:false,day,locked:false,error:"non_bongdalu_snapshot_preserved",source:verify.rows[0].source});
  const mirror=await mirrorLockedFootball(day);
  if(!mirror.ok)return res.status(503).json({ok:false,day,locked:true,mirror,queueBlocked:true,retryOnExistingNoonLock:true});
  let dispatch=null;
  try{
   const item=await scheduler.at(new Date(Date.now()+60000),"/api/jobs/queue-football-picks",{name:"r55-queue-"+day,payload:{day}});
   dispatch={queued:true,taskId:item.id};
  }catch(e){dispatch={queued:false,error:String(e.message||e).slice(0,140)}}
  return res.json({ok:true,day,locked:true,picks:verify.rows[0].n,lockedAt:verify.rows[0].locked_at,source:verify.rows[0].source,firstWritten:result.completed===true&&!result.alreadyLocked,prematchDispatch:dispatch,mirrorSynced:true});
 }catch(e){return res.status(503).json({ok:false,day,locked:false,error:String(e.message||e).slice(0,160)})}
}