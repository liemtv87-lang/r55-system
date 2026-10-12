import {db} from "hatchable";
import {inspectBongdaluHistoryProbe,inspectBongdalu} from "lib/bongdaluR55.js";
export const access="scheduler";
export const methods=["GET","POST"];
const day=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export default async function(req,res){
 const d=day();
 try{
  // Scan ALL incoming fixture + market records before 13h; model only a small history probe to protect quota. Do not lock or expose provisional bets.
  const feed=await inspectBongdalu();
  const probe=await inspectBongdaluHistoryProbe(true);
  const predicted=probe.results.filter(x=>!!x.prediction).length;
  const qualityQualified=probe.results.filter(x=>x.prediction?.researchOnly===false).length;
  const report={date:d,checkedAt:new Date().toISOString(),source:"Bongdalu",window:"13:00 VN to 13:05 VN next day",fixtureCount:feed.fixtureCount,marketCount:feed.marketCount,windowFixtures:feed.windowFixtures,windowWithMarket:feed.windowWithMarket,eligibleWindowMarket:feed.eligibleWindowMarket,checked:probe.tested,verifiedHistory:probe.ready,modeled:predicted,qualityQualified,shadowOnly:predicted-qualityQualified,locked:false};
  await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",["r55_preflight_"+d,JSON.stringify(report)]);
  const ok=feed.eligibleWindowMarket>=20&&probe.ready>=5&&predicted>=5;
  return res.status(ok?200:503).json({ok,preflightOnly:true,...report,reason:ok?null:"verified_bongdalu_future_pool_insufficient"});
 }catch(e){return res.status(503).json({ok:false,preflightOnly:true,date:d,error:String(e.message||e).slice(0,160)});}
}