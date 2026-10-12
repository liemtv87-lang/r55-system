import {db} from "hatchable";
import {chooseR55Ensemble} from "lib/r55EnsembleV3.js";
import {bongMarket as nativeBongMarket,bigMatchInfo as nativeBigMatchInfo,parseFormTable as nativeParseFormTable,parseH2HTable as nativeParseH2HTable,parseAsianHistory as nativeParseAsianHistory,parseBongOdds as nativeParseBongOdds,parseBongFeed as nativeParseBongFeed,parseBongLeagueMeta as nativeParseBongLeagueMeta,discoverBongdaluRoots as nativeDiscoverBongdaluRoots,bongNeighborRoots as nativeBongNeighborRoots} from "lib/original-bongdalu/r55-core-verbatim-transpiled.js";
// Port of the production football-all-refresh-v3 Bongdalu ingestion/model layer.
// No Goaloo/NowGoal, ESPN, Livescore or synthetic odds may contribute market input.
// Validated Bongdalu entrypoints. Legacy domains are discovery pointers only,
// never alternative data providers. All newly found hosts must pass feed verification.
const BASES=["https://www.bongdalu812.com/","https://www.bongdalu.com/","https://www.bongdalu802.com/","https://www.bongdalu811.com/","https://www.bongdalu628.com/","https://www.bongdalu800.com/","https://www.bongdalu128.com/","https://www.bongdalu618.com/"];
const VALID_BONG_HOST=/^(?:www\.)?bongdalu(?:\d{0,4})?\.(?:com|net|vn)$|^(?:www\.)?bongdalu\.com\.vn$/i;
const BOOKS=[["Bet365","8"],["Sbobet","31"],["12Bet","24"],["Crown","3"],["Easybets","12"]];
const MAX_SOURCE_BYTES=1800000,DAY_MS=86400000;
const qn=(x)=>Number.isFinite(Number(x))?Number(x):NaN;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const round=(v,n=3)=>Number(Number(v).toFixed(n));
const ab=s=>String(s??"").trim();
const escapeHTML=s=>ab(s).replace(/&amp;/ig,"&").replace(/&#39;/ig,"'").replace(/&quot;/ig,'"').replace(/<[^>]*>/g,"").replace(/&nbsp;/gi," ").trim();
const vnDay=(ms=Date.now())=>new Date(ms+7*3600000).toISOString().slice(0,10);
const forwardDate=(d,n)=>new Date(Date.parse(d+"T00:00:00Z")+n*DAY_MS).toISOString().slice(0,10);
function fields(src){
 const out=[];let cur="",quote=null,esc=false;
 for(const c of src){if(quote){if(esc){cur+=c;esc=false}else if(c==="\\"){esc=true}else if(c===quote){quote=null}else cur+=c;}else if(c==="'"||c==='"'){quote=c}else if(c===","){out.push(cur.trim());cur=""}else cur+=c;}
 out.push(cur.trim());return out;
}
// Only verified Bongdalu hosts can supply fixtures, odds, history and FT.
export async function getBongdaluText(base,path,accept="*/*",timeout=8500){
 const target=new URL(path,base);
 if(target.protocol!=="https:"||!VALID_BONG_HOST.test(target.hostname))throw Error("bongdalu_untrusted_domain");
 const r=await fetch(target.toString(),{headers:{"user-agent":"Mozilla/5.0","accept":accept},redirect:"follow",signal:AbortSignal.timeout(timeout)});
 const u=new URL(r.url||target.toString());
 if(u.protocol!=="https:"||!VALID_BONG_HOST.test(u.hostname))throw Error("bongdalu_untrusted_redirect");
 if(!r.ok)throw Error("bongdalu_"+r.status+"_"+path.split("?")[0]);
 const size=Number(r.headers.get("content-length")||0);
 if(size>MAX_SOURCE_BYTES)throw Error("bongdalu_oversized");
 const t=await r.text();if(t.length>MAX_SOURCE_BYTES||t.length<100)throw Error("bongdalu_bad_payload");
 return t;
}
const get=getBongdaluText;
// Use the original R55 source-discovery algorithm, not a reimplemented scraper.
async function discoverViaSearch(){
 const roots=await nativeDiscoverBongdaluRoots().catch(()=>[]);
 return [...new Set(roots.flatMap(x=>[x,...nativeBongNeighborRoots(x)]))]
  .filter(x=>{try{const u=new URL(x);return u.protocol==="https:"&&VALID_BONG_HOST.test(u.hostname)}catch{return false}}).slice(0,30);
}
async function testSource(base){
 const js=await get(base,"gf/data/bf_vn1_nt.js","*/*",7200);
 if(js.split("A[").length<21)throw Error("feed_not_bongdalu");
 const xml=await get(base,"gf/data/odds/en/goal8.xml","text/xml",7200);
 if(xml.split("<m>").length<11)throw Error("odds_not_bongdalu");
 return {base,js};
}
export async function resolveBongdaluBase(){
 const tried=new Set();
 async function tryList(list){
  for(let i=0;i<list.length;i+=3){
   const group=list.slice(i,i+3).filter(x=>!tried.has(x));group.forEach(x=>tried.add(x));
   if(!group.length)continue;
   try{return await Promise.any(group.map(testSource));}catch{}
  }
  return null;
 }
 const known=await tryList(BASES);if(known)return known;
 const found=await tryList(await discoverViaSearch());if(found)return found;
 throw Error("all_verified_bongdalu_hosts_unavailable");
}
const resolve=resolveBongdaluBase;
function parseLeagueMeta(js){
 const countries=new Map(),leagues=new Map();
 for(const z of js.matchAll(/C\[\d+\]=\[([^\r\n]*?)\];/g)){const x=fields(z[1]);if(x[0])countries.set(String(x[0]),escapeHTML(x[1]));}
 for(const z of js.matchAll(/B\[(\d+)\]=\[([^\r\n]*?)\];/g)){const x=fields(z[2]);leagues.set(String(z[1]),{league:escapeHTML(x[2]||x[8]||x[1]),country:countries.get(String(x[10]||""))||"",short:escapeHTML(x[1])});}
 return leagues;
}
function parseOdds(xmls){
 const originals=nativeParseBongOdds(xmls.map(z=>({name:z.name,xml:z.text})));
 const out=new Map();
 for(const [id,market] of originals){
  const raw=["homePrice","awayPrice","overPrice","underPrice"].map(k=>Number(market[k]));
  if(raw.some(n=>!Number.isFinite(n)||n<=0||n>3))continue;
  const ah=Number(market.homeLine),ou=Number(market.ouLine);
  if(!Number.isFinite(ah)||!Number.isFinite(ou)||ou<1.25||ou>7)continue;
  if(Math.abs(4*ah-Math.round(4*ah))>0.01||Math.abs(4*ou-Math.round(4*ou))>0.01)continue;
  // Bongdalu XML uses HK profit odds; dashboard stores equivalent decimal odds.
  out.set(String(id),{...market,
   homePrice:round(1+raw[0]),awayPrice:round(1+raw[1]),
   overPrice:round(1+raw[2]),underPrice:round(1+raw[3]),
   rawHongKongOdds:{home:raw[0],away:raw[1],over:raw[2],under:raw[3]},
   originalMarketParser:"football-all-refresh-v3_v128",
   marketSource:"Bongdalu consensus"});
 }
 return out;
}
const scoreLeague=l=>{
 const s=ab(l).toLowerCase();
 if(/uefa champions league|uefa europa league|copa libertadores/.test(s))return 300;
 if(/premier league|laliga|la liga|serie a|bundesliga$|ligue 1|j1 league/.test(s))return 260;
 if(/eredivisie|primeira liga|super lig|mls|liga mx|k league|v-league|thai league 1/.test(s))return 200;
 if(/championship|2\. bundesliga|serie b|ligue 2/.test(s))return 75;
 return 40;
};
// Exclude recognisable third/fourth tiers and reserve/youth fixtures; keep first/second divisions.
const excluded=l=>/(?:\b(?:league|liga|division|div|lig)\s*[-.]?\s*[34]\b|\b(?:iii|iv)\s+(?:liga|league|division)\b|\b(?:third|fourth|3rd|4th)\s+(?:division|league|tier)\b|\b(?:league|division)\s+(?:three|four|iii|iv)\b|(?:primera|segunda)\s+division\s+rfef|\bhungary\s+nb\s+iii\b|\bchinese\s+football\s+association\s+yi\s+league\b|\bj3\s+league\b|\bnorway\s+2[.]liga\b|\bgreece\s+(?:divison|division)\s+c\b|\bserie\s+[cd]\b|\btercera\b|\b(?:youth|reserves?|amateur|friendly|u(?:1[5-9]|2[0-3]))\b)/i.test(String(l||""));

function strictMajorPriority(country,league,home,away){
 const c=String(country||"").toLowerCase(),l=String(league||"").toLowerCase();
 if(/(?:rfef|primera federaci[oó]n|primera division rfef|division 3|division 4|u19|u20|u21|u23|reserve|youth|women|ladies|tercera|regional|amateur|serie c|serie d|league two|2[.] bundesliga|bundesliga 2|la liga 2)/i.test(l))return 0;
 const uefa=/\buefa\b|\beurope\b/.test(c+" "+l);
 let major=0;
 if((/champions league/.test(l)&&uefa)||(/europa league/.test(l)&&uefa)||/copa libertadores/.test(l))major=320;
 else if(/english premier league/.test(l)||(/premier league/.test(l)&&c==="england"))major=300;
 else if((/^(spanish|spain) la liga$|^la liga$|^laliga$/.test(l)&&(/spain|spanish|tây ban nha/.test(c+" "+l)))||(/^(italy|italian) serie a$|^serie a$/.test(l)&&(/italy|italian|italia|^ý$/.test(c+" "+l)))||(/^(german|germany) bundesliga$|^bundesliga$/.test(l)&&(/german|germany|đức/.test(c+" "+l)))||(/^(france|french) ligue 1$|^ligue 1$/.test(l)&&(/france|french|pháp/.test(c+" "+l))))major=280;
 else if(/j1 league|j-league/.test(l)&&(/japan/.test(c+" "+l)))major=250;
 else if(/eredivisie|primeira liga|super lig|major league soccer|liga mx|k league 1/.test(l))major=175;
 else if(/premier league|champions league|primera division/.test(l))major=45;
 const original=nativeBigMatchInfo({country,league,home,away});
 if(original?.class==="excluded")return 0;
 return major?major+Math.min(10,Number(original?.priority||0)/100):0;
}
function parseFeed(js,odds){
 const leagues=nativeParseBongLeagueMeta(js);
 const originals=nativeParseBongFeed(js,odds,"https://www.bongdalu812.com/");
 const out=[];
 for(const o of originals){
  const id=String(o.id||""),home=String(o.home||"").trim(),away=String(o.away||"").trim(),
        t=Number(o.ts),meta=leagues.get(String(o.league_id||""))||{},
        league=String(meta.league||o.league||"Bongdalu league").trim(),country=String(meta.country||o.country||"").trim();
  if(!/^\d{5,12}$/.test(id)||!home||!away||!Number.isFinite(t))continue;
  out.push({id:"BDL_"+id,bongdaluId:id,ts:t,kickoff:new Date(t).toISOString(),
   home,away,league,country,market:odds.get(id)||o.market||null,
   rankings:o.rankings||null,priority:strictMajorPriority(country,league,home,away)});
 }
 return out;
}
// These H2H/form extractors preserve the original source's DOM selectors.
function tablePart(html,id){const m=html.indexOf('id="'+id+'"');if(m<0)return"";const e=html.indexOf("</table>",m);return e>m?html.slice(m,e+8):""}
function parseFormTable(html,id,cls){
 const table=tablePart(html,id),regex=/<tr id="tr[123]_\d+"[\s\S]*?<\/tr>/gi;let match,n=0,points=0,gf=0,ga=0;
 while((match=regex.exec(table))&&n<20){const row=match[0],sc=row.match(/class="fscore_[123]\s+red2"[^>]*>\s*(\d+)\s*-\s*(\d+)/i);
  if(!sc)continue;const h=Number(sc[1]),a=Number(sc[2]),tp=row.indexOf(cls),sp=row.indexOf('class="fscore_');if(tp<0||sp<0)continue;
  const local=tp<sp,f=local?h:a,g=local?a:h;gf+=f;ga+=g;points+=f>g?3:f===g?1:0;n++;
 }return{n,ppg:n?points/n:0,gf:n?gf/n:0,ga:n?ga/n:0};
}
function parseH2HTable(html){
 const table=tablePart(html,"table_v3"),re=/<tr id="tr3_\d+"[\s\S]*?<\/tr>/gi;let m,n=0,edge=0,total=0;
 while((m=re.exec(table))&&n<20){const row=m[0],sc=row.match(/class="fscore_3\s+red2"[^>]*>\s*(\d+)\s*-\s*(\d+)/i);if(!sc)continue;
 const h=Number(sc[1]),a=Number(sc[2]),sp=row.indexOf("team-home-f"),fp=row.indexOf('class="fscore_3');if(sp<0||fp<0)continue;const loc=sp<fp,f=loc?h:a,g=loc?a:h;edge+=f>g?1:f<g?-1:0;total+=h+a;n++;
 }return{n,edge:n?edge/n:0,total:n?total/n:0};
}
function parseHistoryHtml(html){
 if(!html.includes("table_v1")||!html.includes("table_v2")||!html.includes("table_v3"))return null;
 const home=nativeParseFormTable(html,"table_v1","team-home-f"),
       away=nativeParseFormTable(html,"table_v2","team-away-f"),
       h2h=nativeParseH2HTable(html);
 const hi=Number((html.match(/var\s+h2h_home\s*=\s*(\d+)/i)||[])[1]),
       ai=Number((html.match(/var\s+h2h_away\s*=\s*(\d+)/i)||[])[1]);
 const homeAsian=nativeParseAsianHistory(html,1,hi),awayAsian=nativeParseAsianHistory(html,2,ai),
       h2hAsian=nativeParseAsianHistory(html,3,hi);
 return{bongdalu:true,home,away,h2h,home_asian:homeAsian,away_asian:awayAsian,h2h_asian:h2hAsian,
    history_games:Math.min(20,home.n,away.n),history_home_games:home.n,history_away_games:away.n,partial_history:!home.n||!away.n};
}
async function history(base,id){try{
 const html=await get(base,"match/h2h-"+encodeURIComponent(id),"text/html",14000);
 return parseHistoryHtml(html);
 }catch{return null}
}
function makeMarket(row,h,learned){
 const mk=row.market;if(!mk||!h||h.home.n<1||h.away.n<1)return null;
 // Call the production R55 native bongMarket algorithm from the original
 // football-all-refresh-v3 source. No locally invented market prediction.
 const originalMatch={live_id:"bongdalu:"+row.bongdaluId,ts:row.ts,home:row.home,away:row.away,
    country:row.country,league:row.league,rank:clamp(row.priority>0?row.priority/4:40,0,100)};
 const result=nativeBongMarket(originalMatch,{market:mk},h,null,null,null,[]);
 if(!result||!result.ah||!result.ou)return null;
 // v3 checks both handicap directions and both goal-total directions,
 // calculating quarter-line payoff under three independent pre-match scenarios.
 // The original R55 vote remains a diagnostic, not a false "win probability".
 const selected=chooseR55Ensemble(row,h,result);
 if(!selected)return null;
 return {...row,market:{type:selected.type,pick:selected.pick,line:selected.line,odds:round(selected.odds),
    confidence:null,bookmaker:mk.bookmakerNames?.[0]||"Bongdalu",bookmakers:mk.bookmakerCount,
    method:selected.method,evidence:selected.evidence,source:"bongdalu_verified_three_scenario_ensemble",
    expectedEV:selected.ev,worstEV:selected.worstEV,modelSpread:selected.modelSpread,
    modelAgreement:selected.agree,researchOnly:selected.researchOnly,filterReason:selected.reason,
    candidateCount:selected.candidateCount,modelVersion:selected.modelVersion},
    score:round(selected.ev*100,2),learningPriority:0,bookmakerCount:mk.bookmakerCount,
    sourceRef:"bongdalu_ensemble_v3",method:selected.method,
    history:{homeGames:h.home.n,awayGames:h.away.n,h2hGames:h.h2h.n,
      homeAsianGames:h.home_asian?.closing?.n||0,awayAsianGames:h.away_asian?.closing?.n||0,
      homeGF:Number(h.home.gf||0),homeGA:Number(h.home.ga||0),
      awayGF:Number(h.away.gf||0),awayGA:Number(h.away.ga||0)},
    provider:"Bongdalu",quality:round(selected.ev*100,2),
    modelRisk:result.market_risk,modelEngine:selected.modelVersion};
}
export async function inspectBongdaluHistoryProbe(futureWindowOnly=false){
 const rr=await resolve(),xmls=await Promise.all(BOOKS.map(async([name,id])=>({name,text:await get(rr.base,"gf/data/odds/en/goal"+id+".xml","text/xml",8500).catch(()=>"")})));
 const odds=parseOdds(xmls),records=parseFeed(rr.js,odds).filter(x=>x.market);
 const day=vnDay(),start=Date.parse(day+"T06:00:00Z"),end=start+24*3600000+5*60000;
 const eligible=futureWindowOnly?records.filter(x=>x.ts>=start&&x.ts<=end&&!excluded(x.league+" "+x.home+" "+x.away)):records;
 const sorted=eligible.sort((a,b)=>b.priority-a.priority||a.ts-b.ts).slice(0,10);
 const rows=await Promise.all(sorted.map(async x=>({x,h:await history(rr.base,x.bongdaluId)})));
 return {ok:true,source:"Bongdalu",tested:rows.length,ready:rows.filter(z=>z.h&&z.h.home.n>0&&z.h.away.n>0).length,
 results:rows.map(({x,h})=>({id:x.id,home:x.home,away:x.away,league:x.league,ahLine:x.market.homeLine,ouLine:x.market.ouLine,
 homeHistory:h?.home?.n||0,awayHistory:h?.away?.n||0,h2h:h?.h2h?.n||0,
 prediction:h?makeMarket(x,h,[]):null})).map(x=>({...x,prediction:x.prediction?{type:x.prediction.market.type,pick:x.prediction.market.pick,line:x.prediction.market.line,odds:x.prediction.market.odds,method:x.prediction.method,expectedEV:x.prediction.market.expectedEV,researchOnly:x.prediction.market.researchOnly,filterReason:x.prediction.market.filterReason}:null}))};
}
export async function inspectBongdalu(){
 const r=await resolve(),xmls=await Promise.all(BOOKS.map(async([name,id])=>({name,text:await get(r.base,"gf/data/odds/en/goal"+id+".xml","text/xml",8500).catch(()=>"")})));
 const odds=parseOdds(xmls),all=parseFeed(r.js,odds);
 const day=vnDay(),start=Date.parse(day+"T06:00:00Z"),end=start+24*3600000+5*60000,now=Date.now();
  const inWindow=all.filter(x=>x.ts>=Math.max(start,now-5*60000)&&x.ts<=end);
  const eligible=inWindow.filter(x=>x.market&&!excluded(x.league+" "+x.home+" "+x.away));
  return{base:r.base,fixtureCount:all.length,marketCount:all.filter(x=>x.market).length,windowFixtures:inWindow.length,windowWithMarket:inWindow.filter(x=>x.market).length,eligibleWindowMarket:eligible.length,oddsCount:odds.size,bookmakers:BOOKS.map(x=>x[0]),currentDay:day,examples:eligible.slice(0,3).map(x=>({id:x.id,league:x.league,home:x.home,away:x.away,kickoff:x.kickoff,market:x.market}))};
}
export async function previewBongdaluR55Bridge(){return buildBongdaluR55(false)}
export async function stageBongdaluR55Bridge(){return buildBongdaluR55(false,true)}
export async function runBongdaluR55Bridge(){return buildBongdaluR55(true)}
async function buildBongdaluR55(publish,stage=false){
 const day=vnDay();
 // Hard safety gate shared by all scheduler/admin entrypoints: no published daily snapshot before 13:00 Vietnam time.
 const localHour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
 if(publish&&localHour<13)return {ok:false,day,locked:false,error:"snapshot_publish_before_13h_VN_denied"};
 if(stage&&localHour>=13)return {ok:false,day,locked:false,error:"provisional_only_before_13h_VN"};
 let replacingInvalidLegacy=false;
 if(publish){
  const before=await db.query("SELECT day,source FROM football_snapshots WHERE day=$1::date",[day]);
  if(before.rows.length){
   const source=before.rows[0].source;
   if(source==="bongdalu-r55")return {ok:true,day,alreadyLocked:true,source,locked:true,snapshotPublished:false};
   // Only the misplaced original-R55/S01 snapshot may be repaired, never an approved Bongdalu lock.
   if(source!=="original-r55-native-verified")return {ok:false,day,alreadyLocked:true,source,locked:false,error:"foreign_snapshot_cannot_be_replaced"};
   replacingInvalidLegacy=true;
  }
 }
 const r=await resolve(),xmls=await Promise.all(BOOKS.map(async([name,id])=>({name,text:await get(r.base,"gf/data/odds/en/goal"+id+".xml","text/xml",9000).catch(()=>"")})));
 const odds=parseOdds(xmls);if(odds.size<50)throw Error("bongdalu_odds_insufficient");
 const all=parseFeed(r.js,odds);
 // 13:00 VN through 13:05 tomorrow VN; never include already-played matches or invent odds.
 const windowStart=Date.parse(day+"T06:00:00Z"),windowEnd=windowStart+24*3600000+5*60000,now=Date.now();
 // Take all eligible verified Bongdalu markets (up to 450 for bounded batch work).
  // Never choose a fixed 60 or stop simply because the first 35 picks succeeded.
  const pool=all.filter(x=>x.ts>=Math.max(stage?now-5*60000:windowStart,now-5*60000)&&x.ts<=windowEnd&&!excluded(x.league+" "+x.home+" "+x.away)&&x.market)
   .sort((a,b)=>b.priority-a.priority||b.market.bookmakerCount-a.market.bookmakerCount||a.ts-b.ts);
 const learnedQ=await db.query("SELECT payload FROM football_compact_stats WHERE scope='r55_method_rank' LIMIT 1");
 const learned=(learnedQ.rows[0]?.payload?.methods||[]);
 let picked=[],visited=0,withHistory=0;
 // Fetch H2H/form ONLY from Bongdalu and cap work to control quota.
 for(let i=0;i<pool.length;i+=12){
  const slice=pool.slice(i,i+12),results=await Promise.all(slice.map(async x=>({x,h:await history(r.base,x.bongdaluId)})));
  for(const {x,h} of results){visited++;if(h){withHistory++;const m=makeMarket(x,h,learned);if(m)picked.push(m)}}
  // Do not short-circuit after the first 35: process all time-window candidates.
 }
 picked.sort((a,b)=>b.priority-a.priority||b.score-a.score||a.ts-b.ts);
 // Keep all validated selections: never truncate simply because a fixed count was reached.
 if(picked.length<20)return{ok:false,day,error:"bongdalu_verified_pool_less_than_20",seen:pool.length,checked:visited,withHistory,eligible:picked.length,locked:false};
 const snapshot={date:day,source:"Bongdalu pre-match Ensemble v3 H2H/AH/OU",model:"R55 Bongdalu Ensemble v3",locked:true,
 generatedAt:new Date().toISOString(),oneMarketPerMatch:true,bookmakers:BOOKS.map(x=>x[0]),
 recoveryNote:replacingInvalidLegacy?"Late recovery of wrongly published non-Bongdalu snapshot; not a 12:00 prediction":null,
 matches:picked.map(({market,home,away,league,country,ts,kickoff,id,bongdaluId,sourceRef,score,method,bookmakerCount,history,provider,learningPriority,priority})=>({market,home,away,league,country,ts,kickoff,id,bongdaluId,sourceRef,score,method,bookmakerCount,history,provider,learningPriority,priority})),
 disclaimer:"Market-source bookmaker quotations and historical model scores are not assured forecasts."};
 if(stage){
  // Pre-13h FORECAST ONLY: never modify an immutable football_snapshots row.
  const draft={...snapshot,locked:false,provisional:true,sourceBase:r.base,window:"now until tomorrow 13:05 VN"};
  await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",["r55_provisional_"+day,JSON.stringify(draft)]);
  return {ok:true,day,provisional:true,locked:false,eligible:picked.length,checked:visited,withHistory,marketPool:pool.length,source:r.base};
 }
 if(!publish)return {ok:true,day,previewOnly:true,eligible:picked.length,checked:visited,withHistory,marketPool:pool.length,source:r.base,examples:snapshot.matches.slice(0,25).map(x=>({id:x.id,league:x.league,home:x.home,away:x.away,market:x.market,kickoff:x.kickoff,score:x.score,priority:x.priority}))};
 if(replacingInvalidLegacy){
  // Keep a byte-for-byte JSON audit of the displaced snapshot before the one-time correction.
  await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) SELECT $1,jsonb_build_object('day',day,'oldSource',source,'oldLockedAt',locked_at,'oldPayload',payload,'correction','non_Bongdalu_S01_to_verified_BDL'),now() FROM football_snapshots WHERE day=$2::date AND source='original-r55-native-verified' ON CONFLICT(scope) DO NOTHING",["r55_displaced_source_"+day,day]);
 }
 const insert=await db.query("INSERT INTO football_snapshots(day,payload,source) VALUES($1::date,$2::jsonb,'bongdalu-r55') ON CONFLICT(day) DO UPDATE SET payload=EXCLUDED.payload,source=EXCLUDED.source,locked_at=now() WHERE football_snapshots.source='original-r55-native-verified' AND EXISTS(SELECT 1 FROM football_compact_stats WHERE scope=$3) RETURNING day",[day,JSON.stringify(snapshot),"r55_displaced_source_"+day]);
 const written=insert.rows.length===1;
 return{ok:written,day,locked:written,alreadyLocked:!written,snapshotPublished:written,lateRecovery:replacingInvalidLegacy,eligible:picked.length,checked:visited,withHistory,source:r.base,marketPool:pool.length};
}
// Internal functions reused by the bounded batch runner. No unverified providers.
export const verifiedBongdaluInternals={parseOdds,parseFeed,parseHistoryHtml,history,makeMarket,excluded,vnDay,BOOKS};