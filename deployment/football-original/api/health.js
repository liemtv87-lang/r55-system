import {db} from "hatchable";
import {vnWindowDay} from "lib/apiFootball.js";
export const access="public";
export const methods=["GET"];
const vnToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export default async function(req,res){
 const calendarDate=vnToday(),operationalDate=vnWindowDay();
 try{
  const [locked,provisional]=await Promise.all([
   db.query("SELECT source,locked_at,jsonb_array_length(COALESCE(payload->'matches','[]'::jsonb))::int AS matches FROM football_snapshots WHERE day=$1::date",[calendarDate]),
   db.query("SELECT updated_at,jsonb_array_length(COALESCE(payload->'matches','[]'::jsonb))::int AS matches,payload->'scanProgress' AS progress FROM football_compact_stats WHERE scope=$1",["r55_provisional_"+calendarDate])
  ]);
  const row=locked.rows[0]||null,draft=provisional.rows[0]||null;
  const snapshotReady=row?.source==="bongdalu-r55";
  return res.json({ok:true,service:"KQ247 R55 standalone",isolated:true,date:operationalDate,calendarDate,operationalDate,
   source:"Bongdalu",sourceRequiresApiKey:false,availableMarkets:["AH","OU"],
   snapshotReady,lockedMatches:snapshotReady?row.matches||0:0,
   provisionalAvailable:!!draft,provisionalMatches:draft?.matches||0,
   provisionalScanProgress:draft?.progress||null,provisionalUpdatedAt:draft?.updated_at||null,
   lockedAt:snapshotReady?row.locked_at:null,
   legacySnapshotLocked:!!row&&!snapshotReady,mainSiteSwitched:true,customerSiteSwitched:true,siteVisibility:"public"});
 }catch(e){console.error("health_error",String(e.message||e).slice(0,140));return res.status(503).json({ok:false,error:"database_not_ready"})}
}