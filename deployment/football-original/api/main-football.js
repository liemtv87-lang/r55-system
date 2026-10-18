import {db} from "hatchable";
import {settle} from "lib/r55Settlement.js";
// Match day changes at 13:00 VN without importing the old API-Sports collector.
const vnWindowDay=()=>new Intl.DateTimeFormat("en-CA",{
 timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"
}).format(new Date(Date.now()-13*3600000));
import {getCompactR55} from "lib/compactR55.js";
import {releaseDecision,freshRanking} from "lib/r55ReleaseGate.js";
export const access="public";
export const methods=["GET"];
// Live view must also filter lower-tier games from older frozen/provisional snapshots.
const excludedLeague=x=>/(?:\b(?:league|liga|division|div|lig)\s*[-.]?\s*[34]\b|\b(?:iii|iv)\s+(?:liga|league|division)\b|\b(?:third|fourth|3rd|4th)\s+(?:division|league|tier)\b|\b(?:league|division)\s+(?:three|four|iii|iv)\b|(?:primera|segunda)\s+division\s+rfef|\bhungary\s+nb\s+iii\b|\bchinese\s+football\s+association\s+yi\s+league\b|\bj3\s+league\b|\bnorway\s+2[.]liga\b|\bgreece\s+(?:divison|division)\s+c\b|\bserie\s+[cd]\b|\btercera\b|\b(?:youth|reserves?|amateur|friendly|u(?:1[5-9]|2[0-3]))\b)/i.test(String(x?.league||"")+" "+String(x?.home||"")+" "+String(x?.away||""));
const leagueTier=x=>{
 const league=String(x?.league||"").toLowerCase().trim().replace(/\s+/g," ");
 const country=String(x?.country||"").toLowerCase();
 if(/\b(women|ladies|female|youth|reserve|under[- ]?2[013]|u1[5-9]|u2[0-3])\b/.test(league)||/\b(la liga 2|bundesliga 2|2[.] bundesliga|serie b|ligue 2)\b/.test(league))return 0;
 if(/^(uefa )?(champions league|uefa champions league)$/.test(league)||/^(uefa )?europa league$/.test(league)||/^(conmebol )?copa libertadores$/.test(league))return 350;
 if(/^(english|england) premier league$/.test(league)||league==="premier league"&&/anh|england|english/.test(country))return 320;
 if(/^(spanish|spain) la liga$/.test(league)||league==="la liga"&&/spain|tây ban nha/.test(country))return 300;
 if(/^(italy|italian) serie a$/.test(league)||league==="serie a"&&/italy|ý|italia/.test(country))return 300;
 if(/^(german|germany) bundesliga$/.test(league)||league==="bundesliga"&&/german|đức/.test(country))return 300;
 if(/^(france|french) ligue 1$/.test(league)||league==="ligue 1"&&/france|pháp/.test(country))return 300;
 if(/^(japan )?(j1 league|j-league)$/.test(league))return 275;
 return 0;
};
const priority=x=>leagueTier(x)>0;
const rank=x=>leagueTier(x)||Math.max(0,Number(x?.priority)||0);
const numeric=x=>Number.isFinite(Number(x))?Number(x):0;
const slug=m=>String(m?.method||"bookmaker_consensus_unvalidated");
const toLegacy=(m,validated=false)=>{
 const k=m.market||{},type=k.type,chosen=k.pick||"";
 const choice={pick:type==="OU"?(chosen==="OVER"?"TÀI":"XỈU"):(chosen==="HOME"?"CHỦ":"KHÁCH"),line:k.line,price:k.odds,confidence:k.confidence};
 return {id:String(m.id),home:m.home,away:m.away,league:m.league,country:m.country||"",ts:new Date(m.kickoff).getTime(),
  provider:"Bongdalu",source_detail:m.sourceRef||"bongdalu_native_original_v128",trusted_pick:validated,confidence_score:null,model_score:m.score??null,research_only:!validated,verification_status:validated?"walk_forward_passed":"research_unvalidated",
  ah:type==="AH"?choice:null,ou:type==="OU"?choice:null,
  ah_release:type==="AH",ou_release:type==="OU",bookmaker_count:m.bookmakerCount||1,
  bookmaker_names:k.bookmaker?[k.bookmaker]:[],learning_methods:[slug(m)],
  method:slug(m),top:priority(m),market_scores:type==="AH"?{ah:Number(k.confidence)||0}:{ou:Number(k.confidence)||0}};
};
export default async function(req,res){
 // Public R55 source: the existing customer Render origin reads exactly this feed.
 // Customer codes, device bindings and expiry are verified ONLY by VPS-local auth.
 // This API reads the same locked PostgreSQL snapshot as customers and Telegram.
 res.setHeader('Access-Control-Allow-Origin','*');
 res.setHeader('Cache-Control','no-store');
 const day=vnWindowDay();
 const calendarDay=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const qs=req.query||{};
 const mode=String(qs.mode||"all");
 const limit=Math.min(5000,Math.max(1,Number(qs.limit)||30));
 const [snapshots,results,compact,learned]=await Promise.all([
  db.query("SELECT day::text,payload,source,locked_at FROM football_snapshots WHERE day BETWEEN ($1::date - interval '64 days') AND $1::date ORDER BY day DESC LIMIT 65",[day]),
  db.query("SELECT fixture_id::text AS id,home_score,away_score,fixture_status FROM football_final_results WHERE source='bongdalu-ft-verified' AND fixture_status='FT'"),
  getCompactR55(),
  db.query("SELECT payload FROM football_compact_stats WHERE scope='r55_method_rank' LIMIT 1")
 ]);
 const final=new Map(results.rows.map(x=>[x.id,x]));
 // Only a frozen snapshot built from Bongdalu input may be advertised as today's R55 picks.
 // Latest LOCKED and source-verified snapshot stays canonical through midnight
 // and until the next valid 13:00 snapshot has been atomically published.
 const verifiedSnapshots=snapshots.rows.filter(x=>x.source==="bongdalu-r55"&&!!x.locked_at);
 const legacyLocked=snapshots.rows.some(x=>x.day===day&&x.source!=="bongdalu-r55");
 const latest=verifiedSnapshots[0]||null;
 const preRelease=false;
 const payload=latest?.payload||{};
 const snapshotId=latest?"bongdalu-r55:"+latest.day+":"+new Date(latest.locked_at).toISOString():null;
 const picks=Array.isArray(payload.matches)?payload.matches:[];
 // Keep snapshots immutable; live output includes strictly future kickoff times only.
 // Filter before limit so 20/30 means 20/30 upcoming games, not slots occupied by started games.
 const cutoff=Date.now();
 const startedCount=picks.filter(x=>{const ms=Date.parse(String(x?.kickoff||""));return !Number.isFinite(ms)||ms<=cutoff;}).length;
 const upcoming=picks.filter(x=>{const ms=Date.parse(String(x?.kickoff||""));return Number.isFinite(ms)&&ms>cutoff&&!excludedLeague(x);});
 // Snapshot is ranked strongest-first. Apply limit before any client-side kickoff sort,
 // otherwise 20/30 would incorrectly select the earliest fixtures instead of strongest.
 const methodAudit=learned.rows[0]?.payload;
 const releasedUpcoming=upcoming.filter(x=>releaseDecision(x,methodAudit?.methods,freshRanking(methodAudit)).ok);
 // Forecast coverage is independent of retrospective performance validation.
 // Display verifiable Bongdalu-based research predictions, marking unvalidated
 // forecasts explicitly. Do not silently hide all matches when no model passed.
 const approvedIds=new Set(releasedUpcoming.map(x=>x.id));
 const shown=upcoming.filter(x=>mode!=="featured"||priority(x))
  .sort((a,b)=>rank(b)-rank(a)||Number(b.market?.expectedEV||0)-Number(a.market?.expectedEV||0)||Number(b.score||0)-Number(a.score||0)||Date.parse(a.kickoff)-Date.parse(b.kickoff))
  .slice(0,limit).map(x=>toLegacy(x,approvedIds.has(x.id)));
 const summary=[],perf=new Map();
 const now=Date.now();
 for(const s of verifiedSnapshots){
  let x=s.payload;if(typeof x==="string")try{x=JSON.parse(x)}catch{x={}};
  const all=Array.isArray(x.matches)?x.matches:[];
  const d={day:s.day,picks:all.length,settled:0,due_predictions:0,settled_due:0,nonfinal_or_rescheduled:0,unresolved_due:0,coverage_ok:false,
   ah_win:0,ah_half_win:0,ah_push:0,ah_half_loss:0,ah_loss:0,ou_win:0,ou_half_win:0,ou_push:0,ou_half_loss:0,ou_loss:0,ah_rate:0,ou_rate:0};
  for(const m of all){
   const type=m.market?.type==="AH"?"ah":"ou";
   const due=new Date(m.kickoff).getTime()<now-2*3600e3;
   if(due)d.due_predictions++;
   const f=final.get(String(m.id||"").replace(/^(?:BDL_|S01_)/,""));
   if(!f){if(due)d.unresolved_due++;continue;}
   const scored=settle(m.market,Number(f.home_score),Number(f.away_score));
   if(!scored){if(due)d.unresolved_due++;continue;}
   d.settled++;if(due)d.settled_due++;
   d[type+"_"+scored.result]++;
   const key=slug(m),p=perf.get(key)||{method:key,n:0,recent_n:0,ah_n:0,ou_n:0,ah_units:0,ou_units:0,ah_success:0,ou_success:0,ah_failed:0,ou_failed:0};
   p.n++; if((now-new Date(m.kickoff).getTime())<14*864e5)p.recent_n++;
   p[type+"_n"]++;p[type+"_units"]+=scored.profitUnits;
   p[type+"_success"]+=scored.result==="win"?1:scored.result==="half_win"?.5:0;
   p[type+"_failed"]+=scored.result==="loss"?1:scored.result==="half_loss"?.5:0;
   perf.set(key,p);
  }
  d.coverage_ok=d.due_predictions>0&&d.settled_due===d.due_predictions;
  for(const type of ["ah","ou"]){
   const success=d[type+"_win"]+.5*d[type+"_half_win"];
   const failed=d[type+"_loss"]+.5*d[type+"_half_loss"];
   d[type+"_rate"]=success+failed?Number((100*success/(success+failed)).toFixed(2)):0;
  }
  summary.push(d);
 }
 const method_performance=[...perf.values()].map(p=>{
  // Do not claim training on sparse/no data. Score is empirical and not guaranteed predictive.
  const ah_score=p.ah_success+p.ah_failed?Number((p.ah_success/(p.ah_success+p.ah_failed)).toFixed(4)):0;
  const ou_score=p.ou_success+p.ou_failed?Number((p.ou_success/(p.ou_success+p.ou_failed)).toFixed(4)):0;
  const success=p.ah_success+p.ou_success,fail=p.ah_failed+p.ou_failed;
  return {method:p.method,n:p.n,recent_n:p.recent_n,ah_score,ou_score,
   ah_roi:p.ah_n?Number((p.ah_units/p.ah_n).toFixed(4)):null,
   ou_roi:p.ou_n?Number((p.ou_units/p.ou_n).toFixed(4)):null,
   combined_roi:p.n?Number(((p.ah_units+p.ou_units)/p.n).toFixed(4)):null,
   combined_score:success+fail?Number((success/(success+fail)).toFixed(4)):0,
   ah_selected:false,ou_selected:false,
   coverage_gate:p.n>=30&&summary.every(d=>d.due_predictions===d.settled_due)};
 });
 // Legacy statistics came from mixed providers, so they are archived, not live training data.
 const oldDaily=(Array.isArray(compact.daily)?compact.daily:[]).map(x=>{
  const d={...x,day:String(x.prediction_date||x.day),picks:numeric(x.picks),settled:numeric(x.settled)};
  d.due_predictions=d.picks;d.settled_due=d.settled;
  d.unresolved_due=Math.max(0,d.picks-d.settled);d.nonfinal_or_rescheduled=0;
  d.coverage_ok=d.picks>0&&d.settled>=d.picks;
  for(const k of ["ah","ou"]){
   const w=numeric(d[k+"_win"])+.5*numeric(d[k+"_half_win"]);
   const l=numeric(d[k+"_loss"])+.5*numeric(d[k+"_half_loss"]);
   d[k+"_rate"]=w+l?Number((100*w/(w+l)).toFixed(2)):0;
  }
  return d;
 });
 const allDaily=new Map(oldDaily.map(x=>[x.day,x]));
 for(const x of summary)if(!allDaily.has(x.day)||x.picks>0)allDaily.set(x.day,x);
 const historyStats=[...allDaily.values()].sort((a,b)=>String(b.day).localeCompare(String(a.day))).slice(0,60);
 const historicalMethods=(Array.isArray(compact.methodSummary)?compact.methodSummary:[]).map(x=>({
  method:String(x.method),n:numeric(x.n),recent_n:numeric(x.n),
  ah_score:numeric(x.ah_score),ou_score:numeric(x.ou_score),
  combined_score:(()=>{
    const success=numeric(x.ah_win)+.5*numeric(x.ah_half_win)+numeric(x.ou_win)+.5*numeric(x.ou_half_win);
    const failed=numeric(x.ah_loss)+.5*numeric(x.ah_half_loss)+numeric(x.ou_loss)+.5*numeric(x.ou_half_loss);
    return success+failed?Number((success/(success+failed)).toFixed(4)):0;
   })(),
  ah_selected:false,ou_selected:false,coverage_gate:false,
  historical:true
 }));
 const totalMethods=new Map(historicalMethods.map(x=>[x.method,x]));
 for(const x of method_performance)totalMethods.set(x.method,x);
 // The verified 60-day walk-forward ranking is authoritative over unmerged
 // short-window stats. Separate AH and OU methods preserve one market per match.
 const learnedRows=Array.isArray(learned.rows[0]?.payload?.methods)?learned.rows[0].payload.methods:[];
 for(const x of learnedRows){
  const method=String(x.method||"unspecified"),rate=Number(x.winRate)/100;
  totalMethods.set(method,{method,n:Number(x.n||0),recent_n:Number(x.recent14||0),
   ah_score:x.type==="AH"&&Number.isFinite(rate)?rate:0,
   ou_score:x.type==="OU"&&Number.isFinite(rate)?rate:0,
   combined_score:Number.isFinite(rate)?rate:0,
   ah_roi:x.type==="AH"&&x.n?Number((Number(x.units)/Number(x.n)).toFixed(4)):null,
   ou_roi:x.type==="OU"&&x.n?Number((Number(x.units)/Number(x.n)).toFixed(4)):null,
   combined_roi:x.n?Number((Number(x.units)/Number(x.n)).toFixed(4)):null,
   ah_selected:x.type==="AH"&&x.eligible===true,
   ou_selected:x.type==="OU"&&x.eligible===true,
   coverage_gate:x.eligible===true,historical:true});
 }
 return res.json({ok:true,locked:!!latest,found:!!latest,provisional:false,snapshot_id:snapshotId,model:payload.model||"R55 - đang chờ snapshot",
  date:latest?.day||day,updated_at:latest?.locked_at||null,total:upcoming.length,validated_upcoming:releasedUpcoming.length,research_only_upcoming:upcoming.length-releasedUpcoming.length,prediction_coverage_pct:Number(payload.scanProgress?.marketPool)>0?Number((100*picks.length/Number(payload.scanProgress.marketPool)).toFixed(2)):null,prediction_coverage_target_pct:80,snapshot_total:picks.length,hidden_started:startedCount,hidden_lower_tier:picks.length-startedCount-upcoming.length,scan_progress:payload.scanProgress||null,predictions:shown,
  daily_stats:historyStats,method_performance:[...totalMethods.values()],
  learning_ready:Array.isArray(learned.rows[0]?.payload?.methods)&&learned.rows[0].payload.methods.some(x=>x.eligible===true),stats_restored:false,source:"bongdalu_verified_only",
  note:legacyLocked?"Snapshot cũ không đạt xác minh nguồn Bongdalu.":releasedUpcoming.length===0&&upcoming.length>0?"DỰ BÁO THAM KHẢO: hiện chưa có phương pháp AH/OU vượt chuẩn hồi kiểm; các trận vẫn hiển thị để theo dõi và chấm kết quả thật. Không có tỷ lệ thắng được bảo đảm.":"Dự báo dùng dữ liệu Bongdalu. Chỉ nhãn 'Đủ dữ liệu' mới biểu thị phương pháp qua kiểm định; không có dự đoán nào bảo đảm thắng."});
}