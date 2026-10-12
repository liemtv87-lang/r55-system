import {db} from "hatchable";
import {gradeAndLearn} from "lib/r55Ops.js";
export const access="scheduler";
export const methods=["GET","POST"];
export default async function(req,res){
 try{
  const a=await gradeAndLearn();
  // Every snapshot prediction is counted once; only Bongdalu-confirmed FT
  // results are graded. Pending/postponed matches stay visible for later retry.
  const summary=await db.query("SELECT s.day::text AS day, COUNT(*)::int AS predicted, COUNT(*) FILTER(WHERE (m->>'kickoff')::timestamptz < now()-interval '150 minutes')::int AS due, COUNT(*) FILTER(WHERE (m->>'kickoff')::timestamptz < now()-interval '150 minutes' AND f.fixture_id IS NOT NULL)::int AS settled_due, COUNT(*) FILTER(WHERE (m->>'kickoff')::timestamptz < now()-interval '150 minutes' AND f.fixture_id IS NULL)::int AS awaiting_verified_ft FROM football_snapshots s CROSS JOIN LATERAL jsonb_array_elements(s.payload->'matches') m LEFT JOIN football_final_results f ON f.fixture_id::text=regexp_replace(m->>'id','^(BDL_|S01_)','') AND f.fixture_status='FT' AND f.source='bongdalu-ft-verified' WHERE s.source='bongdalu-r55' AND s.day>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-interval '60 days' GROUP BY s.day ORDER BY s.day DESC LIMIT 60");
  const grades=summary.rows.map(row=>({...row,coverage_pct:row.due?Number((100*row.settled_due/row.due).toFixed(2)):null,all_due_graded:row.due>0&&row.due===row.settled_due}));
  return res.status(a.ok?200:503).json({ok:a.ok,verifiedSource:a.source,days:a.days.length,methods:a.ranking.length,learningReady:a.learningReady,grades,requiresRetry:grades.some(x=>x.awaiting_verified_ft>0)});
 }catch(e){return res.status(503).json({ok:false,error:String(e.message||e).slice(0,160)})}
}