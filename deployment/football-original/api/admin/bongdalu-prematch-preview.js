import {previewBongdaluR55Bridge} from "lib/bongdaluR55.js";
import {db} from "hatchable";
import {releaseDecision,freshRanking} from "lib/r55ReleaseGate.js";
import {planR55Prematch} from "lib/r55PrematchPlanner.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 try{
  const preview=await previewBongdaluR55Bridge();
  if(!preview.ok)return res.status(503).json({ok:false,error:preview.error||"no_bongdalu_verified_predictions",dryRun:true});
  const recent=await db.query("SELECT payload FROM football_compact_stats WHERE scope='r55_method_rank' LIMIT 1");
  const audit=recent.rows[0]?.payload;
  const samples=preview.examples||[];
  const qualified=samples.filter(m=>m.market?.researchOnly===false&&Number(m.priority)>=175);
  const released=qualified.filter(m=>releaseDecision(m,audit?.methods,freshRanking(audit)).ok);
  const plan=planR55Prematch(released,Date.now(),40);
  return res.json({ok:true,source:"Bongdalu",dryRun:true,snapshotPublished:false,
   modelCandidates:preview.eligible,qualityQualifiedSample:qualified.length,
   releaseQualifiedSample:released.length,upcoming:plan.available,slots:plan.selected.length,
   gapsMinutes:plan.gapsMinutes,gapsUnder40:plan.gapsUnder40,
   gaps40to60:plan.gaps40to60,gapsOver60:plan.gapsOver60,
   nextPosts:plan.selected.slice(0,12).map(x=>({id:x.id,home:x.home,away:x.away,league:x.league,at:new Date(x.at).toISOString(),kickoff:x.kickoff,market:x.market.type}))});
 }catch(e){return res.status(503).json({ok:false,dryRun:true,error:String(e.message||e).slice(0,180)})}
}