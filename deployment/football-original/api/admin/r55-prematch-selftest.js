import {planR55Prematch} from "lib/r55PrematchPlanner.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 const now=Date.parse("2026-10-10T00:00:00Z");
 const fixture=(n,score=65,priority=6)=>{
  const t=now+(n+20)*60000;
  return{id:"BDL_"+String(3000000+n),home:"Home",away:"Away",league:"Test league",
   kickoff:new Date(t).toISOString(),priority,score,market:{type:"AH",pick:"HOME",line:-.25,odds:1.85}};
 };
 const input=[fixture(5),fixture(45),fixture(85),fixture(220),fixture(260),fixture(300),fixture(303,80,9)];
 const x=planR55Prematch(input,now,40);
 const check={
  allEligibleHandled:x.selected.length===6,
  noDuplicateIds:new Set(x.selected.map(m=>m.id)).size===x.selected.length,
  neverCloserThan40:x.gapsUnder40===0,
  resumesAfterLongGaps:x.gapsOver60===1,
  hasTargetCadence:x.gaps40to60===4,
  invalidAndPastIgnored:planR55Prematch([fixture(0),{...fixture(10),id:"S01_1111"}],now).selected.length===0
 };
 const ok=Object.values(check).every(Boolean);
 return res.status(ok?200:422).json({ok,checks:check,selected:x.selected.length,gapsMinutes:x.gapsMinutes,verifiedFixtureSourceRequired:true,syntheticTestOnly:true});
}