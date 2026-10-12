import {db,config} from "hatchable";
import {boldTelegram} from "lib/r55TelegramFormat.js";
import {settle} from "lib/r55Settlement.js";
import {resolveBongdaluBase,getBongdaluText} from "lib/bongdaluR55.js";
const GROUP="@keochuyengia79";
const vnDate=(offset=0)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()+offset));
const normalize=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const stateKey=d=>"r55_daily_grade_"+d;
function fields(text){
 const out=[];let token="",q=null,escaped=false;
 for(const ch of text){
  if(q){if(escaped){token+=ch;escaped=false}else if(ch==="\\"){escaped=true}else if(ch===q)q=null;else token+=ch;continue}
  if(ch==="'"||ch==='"'){q=ch;continue}
  if(ch===","){out.push(token.trim());token="";continue}
  token+=ch;
 }
 out.push(token.trim());return out;
}
function parseBongdaluFT(text,fromAjax=false){
 const result=new Map();
 for(const m of String(text||"").matchAll(/A\[\d+\]\s*=\s*\[([^\r\n;]*)\]\s*;?/g)){
  const a=fields(m[1]),id=String(a[0]||"");
  // Bongdalu live bf_vn1_nt.js uses status at 8, score at 9/10.
  // SoccerAjax historical records OMIT the live-update timestamp: status at 7,
  // score at 8/9. Mixing these schemas made finished historical games invisible.
  const statusIndex=fromAjax?7:8,homeIndex=fromAjax?8:9,awayIndex=fromAjax?9:10;
  if(!/^\d{5,12}$/.test(id)||Number(a[statusIndex])!==-1)continue;
  const home=Number(a[homeIndex]),away=Number(a[awayIndex]);
  if(!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0||home>25||away>25)continue;
  const raw=String(a[6]||"");
  const parts=raw.split(",").map(Number);
  const kick=fromAjax&&parts.length===6&&parts.every(Number.isFinite)?
    Date.UTC(parts[0],parts[1],parts[2],parts[3],parts[4],parts[5]):
    Date.parse(raw.replace(" ","T")+"Z");
  if(!Number.isFinite(kick))continue;
  result.set(id,{id,kick,home:a[4],away:a[5],homeScore:home,awayScore:away,source:"bongdalu-official-FT"});
 }
 return result;
}
const fixtureId=x=>/^(?:(?:S01|BDL)_)?(\d{5,12})$/.exec(String(x||""))?.[1]||null;
async function snapshots(){
 const q=await db.query("SELECT day::text AS day,payload,locked_at,source FROM football_snapshots WHERE source='bongdalu-r55' AND day>=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - interval '65 days' ORDER BY day DESC LIMIT 66");
 return q.rows.map(r=>({day:r.day,payload:typeof r.payload==="string"?JSON.parse(r.payload):r.payload,lockedAt:r.locked_at}));
}
export async function collectConfirmedResults(){
 const list=await snapshots(),now=Date.now(),targets=new Map();
 for(const day of list)for(const m of day.payload?.matches||[]){
  const id=fixtureId(m.id),kick=Date.parse(m.kickoff||"");
  if(!id||!Number.isFinite(kick)||kick>now-75*60*1000||kick<now-65*86400000)continue;
  targets.set(id,{...m,id,kick});
 }
 if(!targets.size)return {ok:true,source:"bongdalu",candidates:0,confirmed:0,reason:"no_eligible_past_fixtures"};
 const resolved=await resolveBongdaluBase().catch(()=>null);
 if(!resolved)return {ok:false,error:"no_verified_bongdalu_result_host",candidates:targets.size,confirmed:0};
 const base=resolved.base;
 const kickoffDays=[...new Set([
  ...[0,1,2].map(days=>new Date(now+7*3600000-days*86400000).toISOString().slice(0,10)),
  ...[...targets.values()].map(x=>new Date(x.kick+7*3600000).toISOString().slice(0,10))
 ])].slice(0,8);
 const sourceURLs=[
  {path:"gf/data/bf_vn1_nt.js",ajax:false},
  ...kickoffDays.map(date=>({path:"ajax/SoccerAjax?type=6&date="+date+"&order=league&timezone=0",ajax:true}))
 ];
 const responses=await Promise.all(sourceURLs.map(async({path,ajax})=>{
  try{
   const content=await getBongdaluText(base,path,"*/*",10000);
   if(content.length<500||content.length>2000000)throw Error("invalid_bongdalu_payload");
   let data=content;
   if(ajax){const j=JSON.parse(content);if(Number(j.ErrCode)!==0)throw Error("bad_bongdalu_status");data=String(j.Data||"");}
   return{ok:true,map:parseBongdaluFT(data,ajax),path};
  }catch(e){return{ok:false,error:String(e.message||e).slice(0,85),path}}
 }));
 const feeds=responses.filter(x=>x.ok).map(x=>x.map),errors=responses.filter(x=>!x.ok).map(x=>x.path+":"+x.error);
 if(!feeds.length)return{ok:false,error:"bongdalu_result_source_unavailable",errors,confirmed:0};
 const approved=[];
 for(const [id,x] of targets){
  let y=null;
  for(const feed of feeds){const found=feed.get(id);if(found&&normalize(found.home)===normalize(x.home)&&normalize(found.away)===normalize(x.away)&&found.kick>=x.kick-2*3600000&&found.kick<=x.kick+65*86400000){y=found;break}}
  if(y)approved.push({id,homeScore:y.homeScore,awayScore:y.awayScore});
 }
 if(approved.length){
  const sql="INSERT INTO football_final_results(fixture_id,home_score,away_score,fixture_status,source,fetched_at) "+
    "SELECT (x->>'id')::bigint,(x->>'homeScore')::int,(x->>'awayScore')::int,'FT','bongdalu-ft-verified',now() "+
    "FROM jsonb_array_elements($1::jsonb) x ON CONFLICT(fixture_id) DO UPDATE SET home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,fixture_status=EXCLUDED.fixture_status,source=EXCLUDED.source,fetched_at=now() WHERE football_final_results.source IS DISTINCT FROM 'bongdalu-ft-verified' OR football_final_results.home_score IS DISTINCT FROM EXCLUDED.home_score OR football_final_results.away_score IS DISTINCT FROM EXCLUDED.away_score RETURNING fixture_id";
  const saved=await db.query(sql,[JSON.stringify(approved)]);
  return {ok:true,source:"bongdalu-ft-verified",candidates:targets.size,confirmed:approved.length,newlySaved:saved.rows.length,feedCounts:feeds.map(x=>x.size),errors};
 }
 return {ok:true,source:"bongdalu",candidates:targets.size,confirmed:0,feedCounts:feeds.map(x=>x.size),errors};
}
async function calculate(){
 const snaps=await snapshots(),res=await db.query("SELECT fixture_id::text AS id,home_score,away_score,fixture_status FROM football_final_results WHERE fixture_status='FT' AND source='bongdalu-ft-verified'");
 const fin=new Map(res.rows.map(x=>[x.id,x])),byDay=new Map(),byMethod=new Map(),now=Date.now();
 for(const s of snaps){
  // Strict walk-forward: never learn from the currently active prediction day.
  if(s.day>=vnDate())continue;
  const day={day:s.day,total:0,due:0,settled:0,pending:0,win:0,half_win:0,push:0,half_loss:0,loss:0,units:0,detail:[]};
  for(const m of s.payload?.matches||[]){
   day.total++;
   const due=Date.parse(m.kickoff||"")<now-150*60000;
   if(!due)continue;
   day.due++;
   const id=fixtureId(m.id),f=id&&fin.get(id);
   const g=f?settle(m.market,Number(f.home_score),Number(f.away_score)):null;
   if(!g){day.pending++;continue}
   day.settled++;day[g.result]++;day.units+=g.profitUnits;
   day.detail.push({id:m.id,home:m.home,away:m.away,score:Number(f.home_score)+"-"+Number(f.away_score),result:g.result,method:String(m.method||"unspecified"),type:m.market?.type});
   // Shadow-only forecasts stay in the audit but must never promote a method.
   // Only quality-qualified pre-match candidates enter walk-forward training.
   if(m.market?.modelVersion==="ensemble_poisson_three_scenarios_v3"&&m.market?.researchOnly!==false)continue;
   const key=String(m.method||"unspecified")+"|"+m.market?.type;
   const z=byMethod.get(key)||{method:String(m.method||"unspecified"),type:m.market?.type,n:0,win:0,half_win:0,push:0,half_loss:0,loss:0,units:0,days:new Set(),last14:0};
   z.n++;z[g.result]++;z.units+=g.profitUnits;z.days.add(s.day);
   if(Date.now()-Date.parse(s.day+"T00:00:00Z")<=14*86400000)z.last14++;
   byMethod.set(key,z);
  }
  day.units=Number(day.units.toFixed(3));byDay.set(day.day,day);
 }
 // Rehydrate only independently verified, fully graded Bongdalu daily
 // aggregates. Raw match rows are deleted after archiving to save quota, but
 // 60-day learning must not lose their outcomes or count them twice.
 const archived=await db.query("SELECT payload FROM football_compact_stats WHERE scope='r55-bongdalu-rollup' LIMIT 1");
 const compact=archived.rows[0]?.payload||{};
 const rawDays=new Set(snaps.map(x=>x.day));
 const archiveRows=Array.isArray(compact.methodDaily)?compact.methodDaily:[];
 for(const row of archiveRows){
  const day=String(row.prediction_date||"");
  const age=Date.parse(day+"T00:00:00Z");
  if(rawDays.has(day)||!Number.isFinite(age)||age>now||now-age>60*86400000||day>=vnDate())continue;
  for(const [prefix,type] of [["ah","AH"],["ou","OU"]]){
   const count=Number(row[prefix+"_n"]||0);
   if(!Number.isInteger(count)||count<1)continue;
   const method=String(row.method||"unspecified"),key=method+"|"+type;
   const z=byMethod.get(key)||{method,type,n:0,win:0,half_win:0,push:0,half_loss:0,loss:0,units:0,days:new Set(),last14:0};
   z.n+=count;
   for(const outcome of ["win","half_win","push","half_loss","loss"])z[outcome]+=Number(row[prefix+"_"+outcome]||0);
   z.units+=Number(row[prefix+"_profit"]||0);
   z.days.add(day);
   if(now-age<=14*86400000)z.last14+=count;
   byMethod.set(key,z);
  }
 }
 // Strict out-of-sample gate: at least 50 finalized matches over 5 distinct days.
 // Historical-only metrics; never retroactively modify a locked snapshot.
 const ranking=[...byMethod.values()].map(v=>{
  const denom=v.win+v.half_win+v.half_loss+v.loss;
  const effective=v.win+.5*v.half_win;
  const p=denom?effective/denom:0,z=1.96;
  const lower=denom?(p+z*z/(2*denom)-z*Math.sqrt(p*(1-p)/denom+z*z/(4*denom*denom)))/(1+z*z/denom):0;
  const eligible=v.n>=50&&v.days.size>=5&&lower>0.47&&v.units>0;
  const priority=eligible?Number(Math.min(.08,(lower-.47)*.5).toFixed(5)):0;
  return {method:v.method,type:v.type,n:v.n,days:v.days.size,recent14:v.last14,win:v.win,half_win:v.half_win,push:v.push,half_loss:v.half_loss,loss:v.loss,units:Number(v.units.toFixed(3)),winRate:denom?Number((100*p).toFixed(2)):null,wilsonLower:denom?Number(lower.toFixed(5)):null,eligible,priority};
 }).sort((a,b)=>b.priority-a.priority||b.n-a.n);
 return {byDay,ranking};
}
export async function gradeAndLearn(){
 const verified=await collectConfirmedResults();
 const {byDay,ranking}=await calculate();
 const forStore={updatedAt:new Date().toISOString(),rules:"90m_final_only_quarter_lines_wilson95_n50_days5_no_future_data",methods:ranking};
 await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES('r55_method_rank', $1::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated_at=now()",[JSON.stringify(forStore)]);
 return {ok:verified.ok,source:verified,days:[...byDay.values()].map(x=>({...x,detail:undefined})),byDay,ranking,learningReady:ranking.some(x=>x.eligible)};
}
export async function publishedGroupReport(today=vnDate()){
 const yesterday=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.parse(today+"T00:00:00+07:00")-86400000));
 const start=yesterday+"T12:05:00+07:00",end=today+"T12:05:00+07:00";
 // Only Telegram-acknowledged posts are allowed in the public group report.
 // Snapshot forecasts were NOT all posted to the group.
 const ledger=await db.query("SELECT scope,payload FROM football_compact_stats WHERE scope LIKE 'r55_prematch_sent_%' AND payload->>'state'='sent' AND payload->>'messageId' IS NOT NULL AND updated_at >= $1::timestamptz AND updated_at < $2::timestamptz ORDER BY updated_at",[start,end]);
 const ids=new Set(),sent=[];
 for(const row of ledger.rows){
  const m=/^r55_prematch_sent_(\d{4}-\d{2}-\d{2})_(BDL_\d{5,12})$/.exec(row.scope);
  if(!m||ids.has(m[2]))continue;
  ids.add(m[2]);sent.push({day:m[1],id:m[2]});
 }
 const out={day:today,start,end,total:sent.length,due:0,settled:0,pending:0,notDue:0,win:0,half_win:0,push:0,half_loss:0,loss:0,units:0,details:[],source:"telegram_acknowledged_bongdalu_only"};
 if(!sent.length)return out;
 const q=await db.query("SELECT day::text AS day,payload FROM football_snapshots WHERE source='bongdalu-r55' AND day IN ($1::date,$2::date,$3::date)",[today,yesterday,new Date(Date.parse(yesterday+"T00:00:00+07:00")-86400000).toISOString().slice(0,10)]);
 const matchLookup=new Map();
 for(const row of q.rows)for(const m of row.payload?.matches||[])matchLookup.set(row.day+"|"+m.id,m);
 const finals=await db.query("SELECT fixture_id::text AS id,home_score,away_score FROM football_final_results WHERE fixture_status='FT' AND source='bongdalu-ft-verified'");
 const fin=new Map(finals.rows.map(x=>[x.id,x]));
 const now=Date.now();
 for(const row of sent){
  const m=matchLookup.get(row.day+"|"+row.id),kick=Date.parse(m?.kickoff||"");
  if(!m||!Number.isFinite(kick)){out.pending++;out.details.push({id:row.id,state:"missing_snapshot"});continue}
  if(kick>now-150*60000){out.notDue++;out.details.push({id:row.id,state:"not_due"});continue}
  out.due++;
  const f=fin.get(fixtureId(row.id));
  const grade=f?settle(m.market,Number(f.home_score),Number(f.away_score)):null;
  if(!grade){out.pending++;out.details.push({id:row.id,state:"awaiting_verified_ft"});continue}
  out.settled++;out[grade.result]++;out.units+=grade.profitUnits;
  out.details.push({id:row.id,home:m.home,away:m.away,result:grade.result,score:f.home_score+"-"+f.away_score});
 }
 out.units=Number(out.units.toFixed(3));
 return out;
}
export async function gradeAtNoon(){
 const today=vnDate(),yesterday=vnDate(-86400000);
 const analysis=await gradeAndLearn(),d=analysis.byDay.get(yesterday);
 const status=d||{day:yesterday,total:0,due:0,settled:0,pending:0,win:0,half_win:0,push:0,half_loss:0,loss:0,units:0};
 const detail={...status,updatedAt:new Date().toISOString(),learningReady:analysis.learningReady,confirmedNew:analysis.source?.newlySaved||0,scoreSourceOK:analysis.source.ok===true};
 await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated_at=now()",[stateKey(yesterday),JSON.stringify(detail)]);
 const published=await publishedGroupReport(today);
 const publicGrade={...published,details:undefined,scoreSourceOK:analysis.source.ok===true,updatedAt:new Date().toISOString()};
 await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated_at=now()",["r55_group_grade_"+today,JSON.stringify(publicGrade)]);
 return {ok:analysis.source.ok===true,day:today,report:publicGrade,snapshotAudit:status,verifiedSource:analysis.source,learningReady:analysis.learningReady,rankedMethods:analysis.ranking.length};
}
export async function sendReport(){
 const today=vnDate(),yesterday=vnDate(-86400000),key="r55_telegram_sent_"+yesterday;
 const q=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",["r55_group_grade_"+today]);
 if(!q.rows.length)return {ok:false,error:"no_group_delivery_grade_for_day",day:today};
 const report=q.rows[0].payload;
 if(!Number(report?.total||0))return {ok:false,error:"no_telegram_approved_picks_for_window",day:today};
 if(report.scoreSourceOK!==true)return {ok:false,error:"bongdalu_ft_unavailable",day:yesterday};
 const claimed=await db.query(
  "INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES ($1,$2::jsonb,now()) ON CONFLICT(scope) DO NOTHING RETURNING scope",
  [key,JSON.stringify({state:"sending",day:yesterday,source:"bongdalu-r55",createdAt:new Date().toISOString()})]
 );
 if(!claimed.rows.length){
  const prior=await db.query("SELECT payload FROM football_compact_stats WHERE scope=$1",[key]);
  const state=prior.rows[0]?.payload?.state;
  return {ok:state==="sent",alreadySent:state==="sent",state:state||"claimed",day:yesterday,messageId:prior.rows[0]?.payload?.messageId||null,automaticRetry:false};
 }
 let token=null;
 try{token=await config.get("R55_TELEGRAM_BOT_TOKEN")}catch{}
 if(!token)token=process.env.R55_TELEGRAM_BOT_TOKEN;
 if(!token){
  const credential=await db.query("SELECT secret FROM football_runtime_credentials WHERE name='telegram_group_bot_token' LIMIT 1");
  token=credential.rows[0]?.secret||null;
 }
 if(!token){
  await db.query("DELETE FROM football_compact_stats WHERE scope=$1 AND payload->>'state'='sending'",[key]);
  return {ok:false,error:"telegram_bot_token_unconfigured",day:yesterday};
 }
 const decided=report.win+report.half_win+report.half_loss+report.loss;
 const winRate=decided?((report.win+report.half_win*.5)*100/decided).toFixed(1)+"%":null;
 const msg="📊 TỔNG KẾT KÈO KQ247 • 13:00 VN\n"+
  "Khung dữ liệu: 12:05 hôm qua → 12:05 hôm nay (VN)\n"+
  "⚽ Số trận đã đăng: "+report.total+
  "\n✅ Đã xác minh FT: "+report.settled+
  "\n⏳ Chưa đối chiếu được kết quả: "+(report.pending+report.notDue)+
  "\n🟢 Thắng: "+report.win+" | Thắng 1/2: "+report.half_win+
  "\n⚪ Hòa kèo: "+report.push+
  "\n🔴 Thua 1/2: "+report.half_loss+" | Thua: "+report.loss+
  (winRate?"\n📈 Tỷ lệ thắng (quy đổi nửa kèo): "+winRate:"\nCHƯA ĐỦ DỮ LIỆU ĐỂ TÍNH TỶ LỆ THẮNG/THUA.")+
  "\n📊 Lãi/lỗ quy đổi 1 đơn vị/kèo: "+report.units;
 try{
  const resp=await fetch("https://api.telegram.org/bot"+String(token).trim()+"/sendMessage",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({chat_id:GROUP,text:boldTelegram(msg),parse_mode:"HTML",disable_web_page_preview:true}),
   signal:AbortSignal.timeout(12000)
  });
  const result=await resp.json().catch(()=>({ok:false}));
  if(resp.ok && result.ok===true && Number.isInteger(Number(result.result?.message_id))){
   const messageId=Number(result.result.message_id);
   await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",
    [key,JSON.stringify({state:"sent",day:yesterday,messageId,source:"bongdalu-r55"})]);
   return {ok:true,day:yesterday,messageId,group:GROUP};
  }
  // Explicit Telegram rejection: no message was accepted. Allow existing hourly cron to retry.
  if(result.ok===false && resp.status!==200){
   await db.query("DELETE FROM football_compact_stats WHERE scope=$1 AND payload->>'state'='sending'",[key]);
   return {ok:false,error:"telegram_rejected_"+resp.status,day:yesterday};
  }
  throw Error("telegram_response_ambiguous");
 }catch(e){
  // Telegram may accept a post before the network times out. Keep this guard and
  // require explicit review; never send a duplicate from another retry.
  await db.query("UPDATE football_compact_stats SET payload=$2::jsonb,updated_at=now() WHERE scope=$1",
   [key,JSON.stringify({state:"delivery_uncertain",day:yesterday,requiresReview:true,source:"bongdalu-r55",error:String(e.message||e).slice(0,160)})]);
  return {ok:false,day:yesterday,error:"delivery_uncertain",automaticRetry:false};
 }
}