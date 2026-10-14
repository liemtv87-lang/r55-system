// Bongdalu's H2H page contains per-match results and historical Asian/O-U prices.
// This module keeps the source rows instead of reducing everything to 3 averages.
// A row is only counted if the actual published score/team identity can be read.
const companies={"8":"Bet365","31":"Sbobet","24":"12Bet","3":"Crown","12":"Easybets"};
const asNumber=x=>x===null||x===undefined||String(x).trim()===""?null:(Number.isFinite(Number(x))?Number(x):null);
const strip=x=>String(x||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
function tableRows(html,table,teamId){
 const tag=html.match(new RegExp('<table\\b[^>]*\\bid=["\\\']'+table+'["\\\'][\\s\\S]*?<\\/table>','i'));
 if(!tag)return [];
 const raw=[...tag[0].matchAll(/<tr\b[^>]*\bid=["']tr[123]_\d+["'][\s\S]*?<\/tr>/gi)];
 const items=[];
 for(const hit of raw){
  const row=hit[0],matchId=(row.match(/\bindex=["'](\d+)["']/i)||[])[1]||null;
  const info=(row.match(/\binfo=["']([^"']+)["']/i)||[])[1];
  if(!info)continue;
  const v=info.split(",").map(asNumber),homeGoals=v[0],awayGoals=v[1],homeId=v[2];
  if(!Number.isInteger(homeGoals)||!Number.isInteger(awayGoals)||homeGoals<0||awayGoals<0||
      homeGoals>30||awayGoals>30||homeId===null)continue;
  const htmlScore=row.match(/class=["'][^"']*fscore_[123][^"']*["'][^>]*>\s*(\d+)\s*-\s*(\d+)/i);
  if(htmlScore&&(Number(htmlScore[1])!==homeGoals||Number(htmlScore[2])!==awayGoals))continue;
  const targetIsHome=homeId===teamId;
  const date=(strip(row).match(/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})\b/)||[])[0]||null;
  items.push({matchId,homeGoals,awayGoals,teamGoals:targetIsHome?homeGoals:awayGoals,
   conceded:targetIsHome?awayGoals:homeGoals,teamIsHome:targetIsHome,date});
  if(items.length>=20)break;
 }
 return items;
}
function embeddedRows(html,variable,teamId){
 const m=html.match(new RegExp('(?:var|let|const)\\s+'+variable+'\\s*=\\s*(\\[\\[[\\s\\S]*?\\]\\])\\s*;','i'));
 if(!m)return [];
 try{
  const data=JSON.parse(m[1].replace(/'/g,'"')),out=[];
  for(const r of data){
   if(!Array.isArray(r)||r.length<4)continue;
   const [hid,aid,hg,ag]=r.map(asNumber);
   if(!Number.isInteger(hid)||!Number.isInteger(aid)||!Number.isInteger(hg)||!Number.isInteger(ag)||
      (hid!==teamId&&aid!==teamId)||hg<0||ag<0||hg>30||ag>30)continue;
   const isHome=hid===teamId;
   out.push({matchId:null,homeGoals:hg,awayGoals:ag,teamGoals:isHome?hg:ag,conceded:isHome?ag:hg,
    teamIsHome:isHome,date:null});
   if(out.length>=20)break;
  }
  return out;
 }catch{return []}
}
function summary(rows){
 const n=rows.length,wins=rows.filter(r=>r.teamGoals>r.conceded).length,
  draws=rows.filter(r=>r.teamGoals===r.conceded).length;
 return {n,ppg:n?(wins*3+draws)/n:0,
  gf:n?rows.reduce((s,r)=>s+r.teamGoals,0)/n:0,
  ga:n?rows.reduce((s,r)=>s+r.conceded,0)/n:0};
}
function marketHistory(html){
 const m=html.match(/var\s+Vs_hOdds\s*=\s*(\[\[[\s\S]*?\]\])\s*;/i),by=new Map();
 if(!m)return by;
 try{
  const list=JSON.parse(m[1].replace(/'/g,'"'));
  for(const q of list){
   if(!Array.isArray(q)||q.length<10)continue;
   const id=String(q[0]||""),cid=String(q[1]||"");
   if(!/^\d{3,12}$/.test(id)||!cid)continue;
   const z={bookmakerId:cid,bookmaker:companies[cid]||"Bongdalu #"+cid,
    ahOpening:asNumber(q[3]),ahClosing:asNumber(q[6]),
    ouOpening:asNumber(q[8]),ouClosing:asNumber(q[9])};
   if(!by.has(id))by.set(id,[]);
   // Keep every bookmaker in the H2H dataset, not just the fixed five.
   if(!by.get(id).some(x=>x.bookmakerId===cid))by.get(id).push(z);
  }
 }catch{}
 return by;
}
function completeRows(html,table,embeddedVar,teamId){
 const visible=tableRows(html,table,teamId),embedded=embeddedRows(html,embeddedVar,teamId);
 // The website commonly renders 10 rows while its embedded array may have 20.
 // Prefer complete embedded chronology when it genuinely contains more results.
 if(embedded.length>visible.length){
  return embedded.map((x,i)=>({...x,matchId:visible[i]?.matchId||null,date:visible[i]?.date||null}));
 }
 return visible;
}
export function extractRichBongdaluHistory(html){
 if(typeof html!=="string"||html.length<100)return null;
 const ids=["home","away"].map(k=>asNumber((html.match(new RegExp('var\\s+h2h_'+k+'\\s*=\\s*(\\d+)','i'))||[])[1]));
 const home=ids[0]===null?[]:completeRows(html,"table_v1","h_data",ids[0]);
 const away=ids[1]===null?[]:completeRows(html,"table_v2","a_data",ids[1]);
 const h2h=ids[0]===null?[]:tableRows(html,"table_v3",ids[0]);
 const odds=marketHistory(html);
 const enrich=rows=>rows.map(r=>({...r,quotes:r.matchId?(odds.get(r.matchId)||[]):[]}));
 const all=[...enrich(home),...enrich(away),...enrich(h2h)];
 const uniqueBookmakers=[...new Set(all.flatMap(r=>r.quotes.map(q=>q.bookmakerId)))];
 return {homeRows:enrich(home),awayRows:enrich(away),h2hRows:enrich(h2h),
  homeSummary:summary(home),awaySummary:summary(away),
  sourceCoverage:{requestedPerTeam:20,homeMatches:home.length,awayMatches:away.length,
   headToHeadMatches:h2h.length,historicalPriceRows:all.reduce((s,r)=>s+r.quotes.length,0),
   bookmakerIds:uniqueBookmakers,bookmakerCount:uniqueBookmakers.length,
   hasRenderedTables:/id=["']table_v1["']/i.test(html)&&/id=["']table_v2["']/i.test(html),
   hasEmbeddedHome:/\bh_data\s*=/i.test(html),hasEmbeddedAway:/\ba_data\s*=/i.test(html),
   hasHistoricOdds:/\bVs_hOdds\s*=/i.test(html)}};
}
