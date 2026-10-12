import {db} from "hatchable";
import {releaseDecision,freshRanking} from "lib/r55ReleaseGate.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 const [rank,snap]=await Promise.all([
   db.query("SELECT payload FROM football_compact_stats WHERE scope='r55_method_rank'"),
   db.query("SELECT day::text AS day,payload FROM football_snapshots WHERE source='bongdalu-r55' ORDER BY day DESC LIMIT 1")
 ]);
 const r=rank.rows[0]?.payload,s=snap.rows[0],games=s?.payload?.matches||[];
 const verdicts=games.map(x=>releaseDecision(x,r?.methods,freshRanking(r)));
 const counts={};for(const v of verdicts)counts[v.reason]=(counts[v.reason]||0)+1;
 const failed=games.length>0&&verdicts.every(v=>v.ok===false);
 return res.json({ok:true,day:s?.day,checked:games.length,released:verdicts.filter(v=>v.ok).length,blocked:verdicts.filter(v=>!v.ok).length,reasons:counts,methodStats:(r?.methods||[]).map(x=>({method:x.method,n:x.n,days:x.days,units:x.units,eligible:x.eligible})),allLosingMethodsBlocked:failed});
}