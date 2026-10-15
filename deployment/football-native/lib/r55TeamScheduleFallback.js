// Official Bongdalu team-profile fixture list, independent of the match's H2H
// page. Used only to recover VERIFIED final scores where that page has no form.
// Never synthesize results, odds, dates, league IDs, or H2H data.
const asInteger=v=>{
 if(v===null||v===undefined||v==="")return null;
 const n=Number(v);return Number.isInteger(n)?n:null;
};
const goals=v=>{
 const n=asInteger(v);
 return n!==null&&n>=0&&n<=30?n:null;
};
const first=(obj,keys)=>{
 for(const k of keys)if(obj[k]!==undefined&&obj[k]!==null&&obj[k]!=="")return obj[k];
 return null;
};
function actualFinalScore(row){
 let home=goals(first(row,["HomeScore","homeScore","HomeGoals","homeGoals","HomeGoal","HScore","HG"]));
 let away=goals(first(row,["AwayScore","awayScore","AwayGoals","awayGoals","AwayGoal","GScore","AG"]));
 if(home===null||away===null){
  const score=first(row,["Score","score","FullScore","FTScore","Result"]);
  const match=typeof score==="string"?score.match(/^\s*(\d{1,2})\s*[-:]\s*(\d{1,2})\s*$/):null;
  if(match){home=goals(match[1]);away=goals(match[2]);}
 }
 return home!==null&&away!==null?[home,away]:null;
}
export function parseVerifiedTeamSchedule(payload,teamId,beforeTs=Date.now()){
 const target=asInteger(teamId),before=Number(beforeTs);
 if(target===null||!Number.isFinite(before)||!Array.isArray(payload?.MatchList))return [];
 const accepted=new Map();
 for(const row of payload.MatchList){
  if(!row||typeof row!=="object")continue;
  const id=asInteger(first(row,["ID","MatchID","matchId"]));
  const hid=asInteger(first(row,["HomeID","homeId","HomeTeamID"]));
  const aid=asInteger(first(row,["AwayID","awayId","AwayTeamID"]));
  if(id===null||hid===null||aid===null||(hid!==target&&aid!==target))continue;
  const state=first(row,["State","state","Status","status"]);
  const finished=state===-1||state==="-1"||["FT","FINISHED","FULL TIME"].includes(String(state||"").toUpperCase());
  if(!finished)continue;
  const score=actualFinalScore(row);
  if(!score)continue;
  // The official schedule can list future fixtures; never ingest them as form.
  const rawDate=first(row,["E8Date","MatchTime","Date","DateTime","Kickoff","StartTime"]);
  let date=null;
  if(typeof rawDate==="string"&&rawDate.trim()){
   const m=rawDate.match(/^\/Date\((\d+)\)\/$/);
   const t=m?Number(m[1]):Date.parse(rawDate);
   if(Number.isFinite(t))date=t;
  }else if(Number.isFinite(Number(rawDate))&&rawDate!==null){
   const n=Number(rawDate);date=n<1e11?n*1000:n;
  }
  if(date!==null&&date>=before)continue;
  const isHome=hid===target,[hg,ag]=score;
  accepted.set(id,{matchId:String(id),homeGoals:hg,awayGoals:ag,
   teamGoals:isHome?hg:ag,conceded:isHome?ag:hg,teamIsHome:isHome,
   date:date===null?null:new Date(date).toISOString().slice(0,10),
   timeMs:date,quotes:[],source:"bongdalu_verified_team_schedule"});
 }
 return [...accepted.values()].sort((a,b)=>(b.timeMs??0)-(a.timeMs??0)).slice(0,20);
}
export function formSummary(rows){
 const n=rows.length,w=rows.filter(r=>r.teamGoals>r.conceded).length,
  d=rows.filter(r=>r.teamGoals===r.conceded).length;
 return {n,ppg:n?(3*w+d)/n:0,gf:n?rows.reduce((a,r)=>a+r.teamGoals,0)/n:0,
   ga:n?rows.reduce((a,r)=>a+r.conceded,0)/n:0};
}
export async function recoverOfficialBongdaluTeamForm(base,teamId,beforeTs=Date.now()){
 const source=new URL(base),baseHost=source.hostname.replace(/^www\./i,"");
 if(source.protocol!=="https:"||!/^bongdalu(?:\d{0,4})?\.(?:com|net|vn)$/.test(baseHost))return [];
 const host="football."+baseHost,rows=new Map();
 for(let page=1;page<=3&&rows.size<20;page++){
  const u=new URL("https://"+host+"/ajax/getteamschedulebypageno");
  u.searchParams.set("id",String(teamId));u.searchParams.set("pageNo",String(page));
  u.searchParams.set("sclassId","0");u.searchParams.set("init",page===1?"1":"0");
  let data;
  try{
   const res=await fetch(u.toString(),{headers:{accept:"application/json","user-agent":"Mozilla/5.0"},signal:AbortSignal.timeout(9000)});
   const final=new URL(res.url||u.toString());
   if(!res.ok||final.hostname!==host||Number(res.headers.get("content-length")||0)>1200000)break;
   const txt=await res.text();if(txt.length>1200000)break;
   data=JSON.parse(txt);
  }catch{break}
  const parsed=parseVerifiedTeamSchedule(data,teamId,beforeTs);
  for(const row of parsed)if(!rows.has(row.matchId))rows.set(row.matchId,row);
  if(!data?.MatchList?.length||Number(data.TotalPages||1)<=page)break;
 }
 return [...rows.values()].sort((a,b)=>(b.timeMs??0)-(a.timeMs??0)).slice(0,20);
}
