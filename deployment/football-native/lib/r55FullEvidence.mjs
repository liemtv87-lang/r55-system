// Source-faithful Bongdalu H2H audit: retain individual results and EVERY
// historical bookmaker record exposed in Vs_hOdds. Never invent missing games.
const table=(html,id)=>{
 const at=String(html).search(new RegExp('id=["\\\']'+id+'["\\\']','i'));
 if(at<0)return '';
 const end=html.indexOf('</table>',at);
 return end<0?'':html.slice(at,end+8);
};
const embedded=(html,name)=>{
 const m=html.match(new RegExp('\\bvar\\s+'+name+'\\s*=\\s*(\\[\\[[\\s\\S]*?\\]\\])\\s*;','i'));
 if(!m)return [];
 try{const a=JSON.parse(m[1]);return Array.isArray(a)?a:[]}catch{return []}
};
const n=x=>x===null||x===undefined||String(x).trim()===''?null:
 Number.isFinite(Number(x))?Number(x):null;
const scoreSummary=rows=>{
 let pts=0,gf=0,ga=0;
 for(const r of rows){gf+=r.for;ga+=r.against;pts+=r.for>r.against?3:r.for===r.against?1:0}
 return {n:rows.length,ppg:rows.length?pts/rows.length:0,gf:rows.length?gf/rows.length:0,ga:rows.length?ga/rows.length:0};
};
export function parseFullBongdaluEvidence(html){
 const homeId=n((html.match(/var\s+h2h_home\s*=\s*(\d+)/i)||[])[1]);
 const awayId=n((html.match(/var\s+h2h_away\s*=\s*(\d+)/i)||[])[1]);
 const oddsRows=embedded(html,'Vs_hOdds');
 const allOdds=new Map();
 const bookmakerIds=new Set();
 for(const raw of oddsRows){
  if(!Array.isArray(raw)||raw.length<10)continue;
  const id=String(raw[0]??'').trim(),cid=String(raw[1]??'').trim();
  if(!/^\d+$/.test(id)||!/^\d+$/.test(cid))continue;
  bookmakerIds.add(cid);
  if(!allOdds.has(id))allOdds.set(id,[]);
  allOdds.get(id).push({companyId:cid,ahOpen:n(raw[3]),ahClose:n(raw[6]),
   ouOpen:n(raw[8]),ouClose:n(raw[9]),raw:raw.slice()});
 }
 const collect=(no,teamClass)=>{
  const fragment=table(html,'table_v'+no);
  const re=new RegExp('<tr\\b[^>]*\\bid=["\\\']tr'+no+'_\\d+["\\\'][\\s\\S]*?<\\/tr>','gi');
  const rows=[];let m;
  while((m=re.exec(fragment))&&rows.length<20){
   const src=m[0];
   const sc=src.match(/class=["']fscore_[123]\s+red2["'][^>]*>\s*(\d+)\s*-\s*(\d+)/i);
   if(!sc)continue;
   const pt=src.indexOf(teamClass),ps=src.search(/class=["']fscore_[123]/i);
   if(pt<0||ps<0)continue;
   const forHome=pt<ps,hg=Number(sc[1]),ag=Number(sc[2]);
   const im=src.match(/\bindex=["'](\d+)["']/i);
   const date=(src.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b|\b\d{2}[-/]\d{2}[-/]\d{4}\b/)||[])[0]||null;
   const fixture=im?.[1]||null;
   rows.push({fixtureId:fixture,date,homeGoals:hg,awayGoals:ag,for:forHome?hg:ag,
    against:forHome?ag:hg,homeSide:forHome,
    bookmakerOdds:fixture?(allOdds.get(fixture)||[]):[]});
  }
  return rows;
 };
 const home=collect(1,'team-home-f'),away=collect(2,'team-away-f'),h2h=collect(3,'team-home-f');
 const fallback=(name,teamId)=>{
  if(teamId===null)return [];
  const result=[];
  for(const r of embedded(html,name)){
   if(result.length>=20)break;
   if(!Array.isArray(r)||r.length<4)continue;
   const hid=n(r[0]),aid=n(r[1]),hg=n(r[2]),ag=n(r[3]);
   if([hid,aid,hg,ag].some(x=>x===null)||!(hid===teamId||aid===teamId))continue;
   const homeSide=hid===teamId;
   result.push({fixtureId:null,date:null,homeGoals:hg,awayGoals:ag,
    for:homeSide?hg:ag,against:homeSide?ag:hg,homeSide,bookmakerOdds:[]});
  }
  return result;
 };
 const embeddedHome=fallback('h_data',homeId),embeddedAway=fallback('a_data',awayId);
 const finalHome=embeddedHome.length>home.length?embeddedHome:home;
 const finalAway=embeddedAway.length>away.length?embeddedAway:away;
 return {home:{rows:finalHome,summary:scoreSummary(finalHome)},
  away:{rows:finalAway,summary:scoreSummary(finalAway)},
  h2h:{rows:h2h,summary:scoreSummary(h2h)},
  audit:{bookmakerIds:[...bookmakerIds],bookmakerCount:bookmakerIds.size,
   historicalOddsRecords:oddsRows.length,distinctFixtureOdds:allOdds.size,
   homeTableGames:home.length,awayTableGames:away.length,
   homeEmbeddedGames:embeddedHome.length,awayEmbeddedGames:embeddedAway.length,
   homeRecoveredFromEmbedded:embeddedHome.length>home.length,
   awayRecoveredFromEmbedded:embeddedAway.length>away.length,
   maxGamesPerTeam:20}};
}
