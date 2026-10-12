import {db} from "hatchable";
import {settle} from "lib/r55Settlement.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const [r,archives]=await Promise.all([
   db.query("SELECT s.day::text AS day,e.pick AS entry,fr.home_score,fr.away_score,fr.fixture_status FROM football_snapshots s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payload->'matches','[]'::jsonb)) e(pick) LEFT JOIN football_final_results fr ON fr.fixture_id=CASE WHEN (e.pick->>'id') ~ '^(BDL_|S01_)?[0-9]{5,12}$' THEN regexp_replace(e.pick->>'id','^(BDL_|S01_)','')::bigint ELSE NULL END AND fr.source='bongdalu-ft-verified' AND fr.fixture_status='FT' WHERE s.source='bongdalu-r55' AND s.day >= ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '65 days') ORDER BY s.day DESC LIMIT 14000"),
   db.query("SELECT payload FROM football_compact_stats WHERE scope='r55-bongdalu-rollup' LIMIT 1")
 ]);
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()-(12*3600000+5*60000)));
 const summary=(days)=>{
  const earliest=new Date(day+"T12:00:00Z");earliest.setUTCDate(earliest.getUTCDate()-(days-1));
  const start=earliest.toISOString().slice(0,10);
  const out={days,from:start,to:day,picks:0,settled:0,pending:0,win:0,half_win:0,push:0,half_loss:0,loss:0,profitUnits:0,method:"full_time_90_minutes"};
  const rawDays=new Set(r.rows.map(x=>x.day));
  for(const row of archives.rows[0]?.payload?.daily||[]){
   const d=String(row.prediction_date||row.day||"");
   if(!d||d<start||d>day||rawDays.has(d))continue;
   for(const key of ["picks","settled","ah_win","ah_half_win","ah_push","ah_half_loss","ah_loss","ou_win","ou_half_win","ou_push","ou_half_loss","ou_loss"]){
    if(key==="picks"||key==="settled")out[key]+=Number(row[key]||0);
    else out[key.slice(3)]+=Number(row[key]||0);
   }
   const methods=Array.isArray(archives.rows[0]?.payload?.methodDaily)?archives.rows[0].payload.methodDaily:[];
   out.profitUnits+=methods.filter(m=>m.prediction_date===d).reduce((a,m)=>a+Number(m.ah_profit||0)+Number(m.ou_profit||0),0);
  }
  for(const v of r.rows){
   if(v.day<start||v.day>day)continue;
   out.picks++;
   if(v.home_score===null||v.away_score===null){out.pending++;continue}
   const s=settle(v.entry?.market,Number(v.home_score),Number(v.away_score));
   if(!s){out.pending++;continue}
   out.settled++;out[s.result]++;out.profitUnits+=s.profitUnits;
  }
  out.profitUnits=Math.round(out.profitUnits*100)/100;
  const success=out.win+.5*out.half_win,failed=out.loss+.5*out.half_loss;
  out.hitRate=success+failed?Number((100*success/(success+failed)).toFixed(2)):null;
  return out;
 };
 const uniqueDays=[...new Set(r.rows.map(x=>x.day))];
 return res.json({ok:true,snapshotDays:uniqueDays.length,last30:summary(30),last60:summary(60),note:"Only verified Bongdalu FT results are graded; half-win and half-loss count 0.5; pushes excluded from win-rate denominator. Up to 60 days of compacted verified stats are included."});
}