import {db} from "hatchable";
import {chooseR55Ensemble} from "lib/r55EnsembleV3.js";
import {primaryFormEvidence} from "lib/r55FormFirst.js";
import {extractRichBongdaluHistory} from "lib/r55RichHistory.js";
import {isR55IgnoredFixture} from "lib/r55FixtureExclusions.js";
import {parseBongdaluTeamSchedule,formSummary} from "lib/r55TeamSchedule.js";
import {BONGDALU_BOOKMAKERS,bookmakerMarketConsensus} from "lib/r55BookmakerConsensus.js";
import {collectBongdaluPageBookmakers,oddsComparisonPageState} from "lib/r55BookmakerPage.js";
import {bongMarket as nativeBongMarket,bigMatchInfo as nativeBigMatchInfo,parseFormTable as nativeParseFormTable,parseH2HTable as nativeParseH2HTable,parseAsianHistory as nativeParseAsianHistory,parseBongOdds as nativeParseBongOdds,parseBongFeed as nativeParseBongFeed,parseBongLeagueMeta as nativeParseBongLeagueMeta,discoverBongdaluRoots as nativeDiscoverBongdaluRoots,bongNeighborRoots as nativeBongNeighborRoots} from "lib/original-bongdalu/r55-core-verbatim-transpiled.js";
// Port of the production football-all-refresh-v3 Bongdalu ingestion/model layer.
// No Goaloo/NowGoal, ESPN, Livescore or synthetic odds may contribute market input.
// Validated Bongdalu entrypoints. Legacy domains are discovery pointers only,
// never alternative data providers. All newly found hosts must pass feed verification.
const BASES=["https://www.bongdalu812.com/","https://www.bongdalu.com/","https://www.bongdalu802.com/","https://www.bongdalu811.com/","https://www.bongdalu628.com/","https://www.bongdalu800.com/","https://www.bongdalu128.com/","https://www.bongdalu618.com/"];
const VALID_BONG_HOST=/^(?:www\.)?bongdalu(?:\d{0,4})?\.(?:com|net|vn)$|^(?:www\.)?bongdalu\.com\.vn$|^football\.bongdalu812\.com$/i;
const BOOKS=BONGDALU_BOOKMAKERS;
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
 const byId=new Map();
 for(const source of xmls){
  for(const item of String(source.text||"").matchAll(/<m>([^<]+)<\/m>/g)){
   const p=item[1].split(","),id=String(p[0]||"").trim();
   const ah=Number(p[2]),ou=Number(p[10]);
   const hp=Number(p[3]),ap=Number(p[4]),op=Number(p[11]),up=Number(p[12]);
   if(!/^\d{5,12}$/.test(id)||![ah,ou,hp,ap,op,up].every(Number.isFinite)||
       ![hp,ap,op,up].every(x=>x>0)||ou<1.25||ou>7)continue;
   const q={name:String(source.name||"Bongdalu"),bookmakerId:String(source.id||""),homeLine:-ah,awayLine:ah,
     ouLine:ou,homeHK:hp,awayHK:ap,overHK:op,underHK:up};
   if(!byId.has(id))byId.set(id,new Map());
   byId.get(id).set(q.name,q);
  }
 }
 const out=new Map();
 for(const [id,market] of originals){
  const quotes=[...(byId.get(String(id))?.values()||[])];
  if(!quotes.length)continue;
  // A median line such as 0.125 is not a real tradable quarter-line.
  // Always take price + AH/OU line from the SAME actual bookmaker quote.
  const nearest=(field,value)=>[...quotes].sort((a,b)=>
      Math.abs(a[field]-value)-Math.abs(b[field]-value)||a.name.localeCompare(b.name))[0];
  const ahQuote=nearest("homeLine",Number(market.homeLine));
  const ouQuote=nearest("ouLine",Number(market.ouLine));
  const ah=ahQuote.homeLine,ou=ouQuote.ouLine;
  if(Math.abs(ah*4-Math.round(ah*4))>.01||
     Math.abs(ou*4-Math.round(ou*4))>.01)continue;
  const spread=field=>{const vals=quotes.map(x=>x[field]);return round(Math.max(...vals)-Math.min(...vals),3);};
  const homePrice=round(1+ahQuote.homeHK),awayPrice=round(1+ahQuote.awayHK);
  const overPrice=round(1+ouQuote.overHK),underPrice=round(1+ouQuote.underHK);
  if([homePrice,awayPrice,overPrice,underPrice].some(x=>!Number.isFinite(x)||x<=1))continue;
  const decimalQuotes=quotes.map(q=>({bookmaker:q.name,
   bookmakerId:String(q.bookmakerId||BOOKS.find(x=>x[0]===q.name)?.[1]||q.name),
   homeLine:q.homeLine,ouLine:q.ouLine,homePrice:round(1+q.homeHK),
   awayPrice:round(1+q.awayHK),overPrice:round(1+q.overHK),
   underPrice:round(1+q.underHK),source:"bongdalu_odds_xml"}));
  out.set(String(id),{...market,homeLine:ah,awayLine:-ah,ouLine:ou,
   homePrice,awayPrice,overPrice,underPrice,
   rawHongKongOdds:{home:ahQuote.homeHK,away:ahQuote.awayHK,over:ouQuote.overHK,under:ouQuote.underHK},
   bookmakerCount:quotes.length,bookmakerNames:quotes.map(q=>q.name),
   bookmakerQuotes:decimalQuotes,
   bookmakerConsensus:bookmakerMarketConsensus(decimalQuotes),
    ahLineSpread:spread("homeLine"),ouLineSpread:spread("ouLine"),
   ahPriceBookmaker:ahQuote.name,ouPriceBookmaker:ouQuote.name,
   originalMarketParser:"football-all-refresh-v3_v128",
   marketSource:"Bongdalu verified bookmaker quotes"});
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
// All Bongdalu priced fixtures are in the analysis universe, including
// lower divisions, youth, reserve and friendly matches. Competition priority
// controls ordering only. Evidence/release gates decide publication separately.
const excluded=isR55IgnoredFixture;
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
 const rich=extractRichBongdaluHistory(html);
 if(!rich||!rich.sourceCoverage.hasRenderedTables&&
   !rich.homeRows.length&&!rich.awayRows.length&&!rich.h2hRows.length)return null;
 let home=nativeParseFormTable(html,"table_v1","team-home-f"),
     away=nativeParseFormTable(html,"table_v2","team-away-f"),
     h2h=nativeParseH2HTable(html);
 // Real embedded h_data/a_data can contain 20 results while only 10 are rendered.
 // Never describe the match as lacking history merely because the short table was parsed.
 if(rich.homeSummary.n>Number(home.n||0))home=rich.homeSummary;
 if(rich.awaySummary.n>Number(away.n||0))away=rich.awaySummary;
 const hi=Number((html.match(/var\s+h2h_home\s*=\s*(\d+)/i)||[])[1]),
       ai=Number((html.match(/var\s+h2h_away\s*=\s*(\d+)/i)||[])[1]);
 const homeAsian=nativeParseAsianHistory(html,1,hi),awayAsian=nativeParseAsianHistory(html,2,ai),
       h2hAsian=nativeParseAsianHistory(html,3,hi);
 // Retain genuine individual AH/OU historical lines for every published bookmaker.
 return {bongdalu:true,home,away,h2h,home_asian:homeAsian,away_asian:awayAsian,
    h2h_asian:h2hAsian,individualHistory:{
     home:rich.homeRows,away:rich.awayRows,h2h:rich.h2hRows},
    sourceCoverage:rich.sourceCoverage,
    history_games:Math.min(20,home.n,away.n),
    history_home_games:home.n,history_away_games:away.n,
    partial_history:!home.n||!away.n};
}

async function recoverOfficialBongdaluTeamForm(base,teamId,before){
 if(!Number.isInteger(teamId)||teamId<=0||!Number.isFinite(Number(before)))return [];
 // On Bongdalu the team schedule is a separate verified subdomain.
 // 'init=1' supplies its PlayingPage; page 1 alone may be all future fixtures.
 const root="https://football.bongdalu812.com/";
 const seen=new Set(),found=new Map(),pages=[1];
 for(let attempt=0;pages.length&&attempt<8&&found.size<20;attempt++){
   const pageNo=pages.shift();
   if(!Number.isInteger(pageNo)||pageNo<1||seen.has(pageNo))continue;
   seen.add(pageNo);
   const path="ajax/getteamschedulebypageno?id="+encodeURIComponent(teamId)+
     "&pageNo="+pageNo+"&sclassId=0&init="+(pageNo===1?1:0);
   let payload;
   try{payload=JSON.parse(await get(root,path,"application/json",11000));}
   catch{continue}
   if(!Array.isArray(payload?.MatchList))continue;
   for(const item of parseBongdaluTeamSchedule(payload,teamId,before)){
     if(!found.has(item.matchId))found.set(item.matchId,item);
   }
   if(pageNo===1){
     const total=Math.max(1,Number(payload.TotalPages||1));
     const playing=Number(payload.PlayingPage);
     if(Number.isInteger(playing)&&playing>=1&&playing<=total){
       // Read at the pre-match point rather than scanning future seasons.
       for(const p of [playing,playing+1,playing+2,playing+3,playing-1])
         if(p>=1&&p<=total&&!seen.has(p))pages.push(p);
     }else if(total>1){
       for(const p of [2,3,4,5,6])if(p<=total)pages.push(p);
     }
   }
 }
 return [...found.values()].sort((a,b)=>b.timestamp-a.timestamp).slice(0,20);
}

async function history(base,id,before=null){
 let result=null;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const html=await get(base,"match/h2h-"+encodeURIComponent(id),"text/html",16000);
   const parsed=parseHistoryHtml(html);
   if(parsed){
    // Every 20-match shortfall triggers a verified independent Bongdalu team
    // history check. Empty H2H-page arrays are not proof of absent team form.
    const ids={
      home:Number((html.match(/var\s+h2h_home\s*=\s*(\d+)/i)||[])[1]),
      away:Number((html.match(/var\s+h2h_away\s*=\s*(\d+)/i)||[])[1])};
    const recovered={};
    for(const side of ["home","away"]){
      if(Number(parsed[side]?.n)>=20||!Number.isInteger(ids[side])||ids[side]<=0)continue;
      const list=await recoverOfficialBongdaluTeamForm(base,ids[side],before);
      if(list.length>Number(parsed[side]?.n||0)){
        parsed[side]=formSummary(list);
        const known=new Map((parsed.individualHistory[side]||[])
          .filter(x=>x?.matchId).map(x=>[String(x.matchId),x]));
        parsed.individualHistory[side]=list.map(x=>({
          ...x,quotes:known.get(String(x.matchId))?.quotes||[]
        }));
        parsed.sourceCoverage[side==="home"?"homeMatches":"awayMatches"]=list.length;
        recovered[side]={via:"bongdalu_team_schedule",matches:list.length};
      }
    }
    parsed.history_games=Math.min(20,Number(parsed.home?.n||0),Number(parsed.away?.n||0));
    parsed.history_home_games=Number(parsed.home?.n||0);
    parsed.history_away_games=Number(parsed.away?.n||0);
    parsed.partial_history=!parsed.history_home_games||!parsed.history_away_games;
    parsed.sourceCoverage.teamScheduleRecovery=recovered;
    result={...parsed,fetchAttempts:attempt,sourcePage:"match/h2h-"+id};
    if(Number(parsed.home?.n)>0&&Number(parsed.away?.n)>0){
     // Independent official odds-comparison page; absence is reported, not guessed.
     const oddsPage=await get(base,"oddscomp/"+encodeURIComponent(id),"text/html",10000).catch(()=>null);
     // A 200 "Security Verification" HTML response is NOT valid bookmaker data.
     const oddsComparisonStatus=oddsComparisonPageState(oddsPage);
     return {...result,oddsComparisonFetched:oddsComparisonStatus==="genuine_odds_rows",
       oddsComparisonStatus,
       oddscompCompanies:oddsComparisonStatus==="genuine_odds_rows"?collectBongdaluPageBookmakers(oddsPage):[]};
    }
   }
  }catch(e){if(attempt===3&&result)return {...result,fetchAttempts:attempt};}
  if(attempt<3)await new Promise(resolve=>setTimeout(resolve,400*attempt));
 }
 // A verified empty page is NOT proof of "thin data"; callers record a fetch/
 // extraction issue separately rather than fabricating results or odds.
 return result;
}
function makeMarket(row,h,learned){
 // Do not drop a legitimately priced fixture solely because Bongdalu reports
 // zero form matches for one side. The evidence gate below keeps it research-only.
 // Neither H2H nor a fixed number of form matches is needed to model a fixture.
 if(excluded(row)||!row?.market||!h?.home||!h?.away)return null;
 // Merge every valid company shown on Bongdalu's comparison page, while keeping
 // the actual betting price tied to the separately verified XML bookmaker line.
 const extras=Array.isArray(h.oddscompCompanies)?h.oddscompCompanies:[];
 const baseline=Array.isArray(row.market.bookmakerQuotes)?row.market.bookmakerQuotes:[];
 const evidence=new Map();
 const decimalPrice=v=>{
  const n=Number(v);if(!Number.isFinite(n)||n<=0)return null;
  // Bongdalu comparison pages use Hong Kong prices; the model uses decimal.
  return n<=1?round(1+n):round(n);
 };
 const valid=q=>q&&Number.isFinite(Number(q.homeLine))&&Number.isFinite(Number(q.ouLine))&&
  ["homePrice","awayPrice","overPrice","underPrice"].every(k=>
   Number.isFinite(q[k])&&q[k]>1);
 const key=q=>String(q.bookmakerId||q.bookmaker||"").trim().toLowerCase();
 for(const q of baseline){
  const item={...q,bookmaker:String(q.bookmaker||""),bookmakerId:String(q.bookmakerId||"")};
  if(valid(item)&&key(item))evidence.set(key(item),item);
 }
 for(const q of extras){
  const item={bookmaker:String(q.name||q.bookmaker||""),bookmakerId:String(q.bookmaker||""),
   homeLine:Number(q.homeLine),ouLine:Number(q.ouLine),
   homePrice:decimalPrice(q.homePrice),awayPrice:decimalPrice(q.awayPrice),
   overPrice:decimalPrice(q.overPrice),underPrice:decimalPrice(q.underPrice),
   source:"bongdalu_oddscomp_page"};
  if(valid(item)&&key(item)&&!evidence.has(key(item)))evidence.set(key(item),item);
 }
 const allQuotes=[...evidence.values()],lineSpread=field=>
  allQuotes.length?round(Math.max(...allQuotes.map(x=>x[field]))-Math.min(...allQuotes.map(x=>x[field])),3):0;
 const mk={...row.market,
   bookmakerCount:allQuotes.length,
   bookmakerNames:allQuotes.map(q=>q.bookmaker),
   bookmakerQuotes:allQuotes,
   bookmakerConsensus:bookmakerMarketConsensus(allQuotes),
   ahLineSpread:allQuotes.length?lineSpread("homeLine"):row.market.ahLineSpread,
   ouLineSpread:allQuotes.length?lineSpread("ouLine"):row.market.ouLineSpread,
   sourceOddsComparisonFetched:!!h.oddsComparisonFetched,
   extraOddsBookmakerCount:extras.length};
 row={...row,market:mk};
 // Call the production R55 native bongMarket algorithm from the original
 // football-all-refresh-v3 source. No locally invented market prediction.
 const originalMatch={live_id:"bongdalu:"+row.bongdaluId,ts:row.ts,home:row.home,away:row.away,
    country:row.country,league:row.league,rank:50};
 // Primary signal: own-team form and historical odds. H2H stays recorded
 // as optional context, not a primary input or rejection gate.
 const result=nativeBongMarket(originalMatch,{market:mk},primaryFormEvidence(h),null,null,null,[]);
 if(!result||!result.ah||!result.ou)return null;
 // v3 checks both handicap directions and both goal-total directions,
 // calculating quarter-line payoff under three independent pre-match scenarios.
 // The original R55 vote remains a diagnostic, not a false "win probability".
 const selected=chooseR55Ensemble(row,h,result);
 if(!selected)return null;
 return {...row,market:{type:selected.type,pick:selected.pick,line:selected.line,odds:round(selected.odds),
    confidence:null,bookmaker:mk.ahPriceBookmaker||mk.bookmakerNames?.[0]||"Bongdalu",bookmakers:mk.bookmakerCount,
     bookmakerQuotes:mk.bookmakerQuotes,bookmakerConsensus:mk.bookmakerConsensus,
     ahPriceBookmaker:mk.ahPriceBookmaker,ouPriceBookmaker:mk.ouPriceBookmaker,
     bookmakerSideAgreement:selected.bookmakerSideAgreement,historicalSupport:selected.historicalSupport,
    bookmakerNames:mk.bookmakerNames||[],
    method:selected.method,evidence:selected.evidence,source:"bongdalu_verified_three_scenario_ensemble",
    expectedEV:selected.ev,worstEV:selected.worstEV,modelSpread:selected.modelSpread,
    modelAgreement:selected.agree,researchOnly:selected.researchOnly,filterReason:selected.reason,
    candidateCount:selected.candidateCount,modelVersion:selected.modelVersion},
    score:round(selected.ev*100,2),learningPriority:0,bookmakerCount:mk.bookmakerCount,
    sourceRef:"bongdalu_ensemble_v3",method:selected.method,
    history:{homeGames:h.home.n,awayGames:h.away.n,h2hGames:h.h2h.n,
      homeAsianGames:h.home_asian?.closing?.n||0,awayAsianGames:h.away_asian?.closing?.n||0,
      historicalPriceRows:Number(h.sourceCoverage?.historicalPriceRows||0),
      historicalBookmakerCount:Number(h.sourceCoverage?.bookmakerCount||0),
      currentOddsPageCompanies:extras.length,oddsComparisonFetched:!!h.oddsComparisonFetched,
      sourceDataVerified:Number(h.home?.n)>0&&Number(h.away?.n)>0,
      homeGF:Number(h.home.gf||0),homeGA:Number(h.home.ga||0),
      awayGF:Number(h.away.gf||0),awayGA:Number(h.away.ga||0)},
    provider:"Bongdalu",quality:round(selected.ev*100,2),
    modelRisk:result.market_risk,modelEngine:selected.modelVersion};
}
export async function inspectBongdaluHistoryProbe(futureWindowOnly=false){
 const rr=await resolve(),xmls=await Promise.all(BOOKS.map(async([name,id])=>({name,id,text:await get(rr.base,"gf/data/odds/en/goal"+id+".xml","text/xml",8500).catch(()=>"")})));
 const odds=parseOdds(xmls),records=parseFeed(rr.js,odds).filter(x=>x.market&&!excluded(x));
 const day=vnDay(),start=Date.parse(day+"T06:00:00Z"),end=start+24*3600000+5*60000;
 const eligible=futureWindowOnly?records.filter(x=>x.ts>=start&&x.ts<=end&&!excluded(x)):records;
 const sorted=eligible.sort((a,b)=>b.priority-a.priority||a.ts-b.ts).slice(0,10);
 const rows=await Promise.all(sorted.map(async x=>({x,h:await history(rr.base,x.bongdaluId,x.ts)})));
 return {ok:true,source:"Bongdalu",tested:rows.length,ready:rows.filter(z=>z.h&&z.h.home.n>0&&z.h.away.n>0).length,
 results:rows.map(({x,h})=>({id:x.id,home:x.home,away:x.away,league:x.league,ahLine:x.market.homeLine,ouLine:x.market.ouLine,
 homeHistory:h?.home?.n||0,awayHistory:h?.away?.n||0,h2h:h?.h2h?.n||0,
 prediction:h?makeMarket(x,h,[]):null})).map(x=>({...x,prediction:x.prediction?{type:x.prediction.market.type,pick:x.prediction.market.pick,line:x.prediction.market.line,odds:x.prediction.market.odds,method:x.prediction.method,expectedEV:x.prediction.market.expectedEV,researchOnly:x.prediction.market.researchOnly,filterReason:x.prediction.market.filterReason}:null}))};
}
export async function inspectBongdalu(){
 const r=await resolve(),xmls=await Promise.all(BOOKS.map(async([name,id])=>({name,id,text:await get(r.base,"gf/data/odds/en/goal"+id+".xml","text/xml",8500).catch(()=>"")})));
 const odds=parseOdds(xmls),all=parseFeed(r.js,odds);
 const day=vnDay(),start=Date.parse(day+"T06:00:00Z"),end=start+24*3600000+5*60000,now=Date.now();
  const inWindow=all.filter(x=>x.ts>=Math.max(start,now-5*60000)&&x.ts<=end);
  const eligible=inWindow.filter(x=>x.market&&!excluded(x));
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
 const r=await resolve(),xmls=await Promise.all(BOOKS.map(async([name,id])=>({name,id,text:await get(r.base,"gf/data/odds/en/goal"+id+".xml","text/xml",9000).catch(()=>"")})));
 const odds=parseOdds(xmls);if(odds.size<50)throw Error("bongdalu_odds_insufficient");
 const all=parseFeed(r.js,odds);
 // 13:00 VN through 13:05 tomorrow VN; never include already-played matches or invent odds.
 const windowStart=Date.parse(day+"T06:00:00Z"),windowEnd=windowStart+24*3600000+5*60000,now=Date.now();
 // Take all eligible verified Bongdalu markets (up to 450 for bounded batch work).
  // Never choose a fixed 60 or stop simply because the first 35 picks succeeded.
  const pool=all.filter(x=>x.ts>=Math.max(stage?now-5*60000:windowStart,now-5*60000)&&x.ts<=windowEnd&&!excluded(x)&&x.market)
   .sort((a,b)=>a.ts-b.ts);
 const learnedQ=await db.query("SELECT payload FROM football_compact_stats WHERE scope='r55_method_rank' LIMIT 1");
 const learned=(learnedQ.rows[0]?.payload?.methods||[]);
 let picked=[],visited=0,withHistory=0;
 // Fetch H2H/form ONLY from Bongdalu and cap work to control quota.
 for(let i=0;i<pool.length;i+=12){
  const slice=pool.slice(i,i+12),results=await Promise.all(slice.map(async x=>({x,h:await history(r.base,x.bongdaluId,x.ts)})));
  for(const {x,h} of results){visited++;if(h){withHistory++;const m=makeMarket(x,h,learned);if(m)picked.push(m)}}
  // Do not short-circuit after the first 35: process all time-window candidates.
 }
 picked.sort((a,b)=>a.ts-b.ts||b.score-a.score);
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