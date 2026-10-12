import {db} from "hatchable";
import {vnWindowDay} from "lib/apiFootball.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 const day=vnWindowDay();
 try{
  const [snap,customers,preflight,graded,ft,botSecret,queue,reports,botPosts]=await Promise.all([
   db.query("SELECT day::text AS day,source,locked_at,jsonb_array_length(COALESCE(payload->'matches','[]'::jsonb))::int AS n FROM football_snapshots ORDER BY day DESC LIMIT 8"),
   db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE active AND expires_at>now())::int AS active FROM football_customer_access"),
   db.query("SELECT payload,updated_at FROM football_compact_stats WHERE scope=$1",["r55_preflight_"+day]),
   db.query("SELECT payload,updated_at FROM football_compact_stats WHERE scope=$1",["r55_daily_grade_"+day]),
   db.query("SELECT count(*)::int AS n FROM football_final_results WHERE source='bongdalu-ft-verified' AND fixture_status='FT'"),
   db.query("SELECT EXISTS(SELECT 1 FROM football_runtime_credentials WHERE name='telegram_group_bot_token') AS ready"),
   db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",["r55_prematch_queue_"+day]),
   db.query("SELECT count(*)::int AS n FROM football_compact_stats WHERE scope LIKE 'r55_telegram_sent_%'"),
   db.query("SELECT count(*)::int AS n FROM football_compact_stats WHERE scope LIKE 'r55_prematch_sent_%' AND payload->>'state'='sent'")
  ]);
  return res.json({ok:true,day,source:"Bongdalu",sourceKeyNeeded:false,verifiedFT:ft.rows[0]?.n||0,
   snapshotReady:snap.rows.some(x=>x.day===day&&x.source==="bongdalu-r55"),
   legacySnapshotPresent:snap.rows.some(x=>x.day===day&&x.source!=="bongdalu-r55"),
   snapshots:snap.rows,customerCodes:customers.rows[0],preflight:preflight.rows[0]||null,
   grade:graded.rows[0]||null,botTokenConfigured:botSecret.rows[0]?.ready===true,
   prematchQueue:queue.rows[0]?.payload||null,groupReportMessagesConfirmed:reports.rows[0]?.n||0,
   prematchMessagesConfirmed:botPosts.rows[0]?.n||0,
   siteVisibility:"personal_private",customerLinksSwitched:false});
 }catch(e){return res.status(503).json({ok:false,error:String(e.message||e).slice(0,180)})}
}