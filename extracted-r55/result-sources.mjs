// R55-16 result / stats support layer. This is intentionally separate from the
// frozen AH/O-U market-source registry.
export const RESULT_STATS_SOURCES=[
 {id:'RS01',name:'Flashscore',kind:'feed',score:true,form:true,stats:true},
 {id:'RS02',name:'FotMob',kind:'json',score:true,form:true,stats:true},
 {id:'RS03',name:'SofaScore',kind:'json',score:true,form:true,stats:true},
 {id:'RS04',name:'LiveScore',kind:'json',score:true,form:true,stats:true},
 {id:'RS05',name:'365Scores',kind:'json',score:true,form:true,stats:true},
 {id:'RS06',name:'TheSportsDB',kind:'json',score:true,form:true,stats:true},
 {id:'RS07',name:'ESPN',kind:'json',score:true,form:true,stats:true},
 {id:'RS08',name:'AiScore',kind:'html-json',score:true,form:true,stats:true},
 {id:'RS09',name:'Soccerway',kind:'html-json',score:true,form:true,stats:true},
 {id:'RS10',name:'worldfootball.net',kind:'html-json',score:true,form:true,stats:true}
];

const clean=s=>String(s??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:null};
const parseTs=x=>{if(x==null||x==='')return NaN;if(typeof x==='number'){if(x>1e12)return x;if(x>1e9)return x*1000}const t=Date.parse(String(x));return Number.isFinite(t)?t:NaN};
const asObj=x=>x&&typeof x==='object'?x:null;
const first=(...xs)=>xs.find(x=>x!==undefined&&x!==null&&x!=='');
function teamName(v){if(v==null)return'';if(typeof v==='string')return clean(v);if(Array.isArray(v))return teamName(v[0]);return clean(first(v.name,v.longName,v.displayName,v.shortDisplayName,v.Nm,v.title,v.teamName,v.competitorName));}
function scoreFrom(v){if(v==null)return null;if(typeof v==='number'||typeof v==='string')return num(v);if(typeof v==='object')return num(first(v.current,v.normaltime,v.normalTime,v.displayValue,v.value,v.score));return null}
function finished(v){if(!v)return false;const text=clean([v.statusText,v.shortStatusText,v.status,v.state,v.phase,v.Eps,v.status?.type,v.status?.description,v.status?.name,v.status?.state].map(x=>typeof x==='object'?'':x).join(' ')).toLowerCase();if(/\b(ft|ended|finished|final|full time|after extra time|after penalties|aet|ap)\b/.test(text))return true;if(v.completed===true||v.status?.completed===true||Number(v.statusGroup)===4||Number(v.Epr)===2)return true;const sid=Number(first(v.statusId,v.Esid,v.status?.id,v.status?.code));return [3,6,100].includes(sid)}
function eventShape(v){
 if(!asObj(v))return null;
 const hObj=first(v.homeTeam,v.home_team,v.homeCompetitor,v.home,v.team1,v.T1,v.competitors?.find?.(x=>x?.homeAway==='home'));
 const aObj=first(v.awayTeam,v.away_team,v.awayCompetitor,v.away,v.team2,v.T2,v.competitors?.find?.(x=>x?.homeAway==='away'));
 const home=teamName(hObj),away=teamName(aObj);if(!home||!away)return null;
 let hs=scoreFrom(first(v.homeScore,v.home_score,v.score?.home,v.scores?.home,hObj?.score,v.Tr1));
 let as=scoreFrom(first(v.awayScore,v.away_score,v.score?.away,v.scores?.away,aObj?.score,v.Tr2));
 if((hs===null||as===null)&&Array.isArray(v.scores)&&v.scores.length>=2){hs=scoreFrom(v.scores[0]);as=scoreFrom(v.scores[1])}
 const start=parseTs(first(v.startTime,v.startTimestamp,v.timestamp,v.utcTime,v.date,v.matchDate,v.time,v.Esd));
 if(!Number.isFinite(start)||hs===null||as===null||!finished(v))return null;
 return{eventId:String(first(v.id,v.eventId,v.event_id,v.Eid,v.match_id,v.gameId)||''),startTime:start,home,away,homeScore:hs,awayScore:as}
}
function dedupe(rows,source){const m=new Map();for(const r of rows||[]){if(!r)continue;const k=`${r.eventId||''}|${r.startTime}|${r.home}|${r.away}|${r.homeScore}-${r.awayScore}`;m.set(k,{...r,resultSource:source})}return[...m.values()]}

export function parseLiveScoreResults(j){const out=[];for(const stage of j?.Stages||[])for(const e of stage?.Events||[]){const home=clean(e?.T1?.[0]?.Nm),away=clean(e?.T2?.[0]?.Nm),hs=num(e?.Tr1),as=num(e?.Tr2);let raw=String(e?.Esd||'');let t=NaN;if(/^\d{14}$/.test(raw)){const m=raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);t=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])}else t=parseTs(e?.Esd);if(!home||!away||hs===null||as===null||!Number.isFinite(t))continue;const st=clean(e?.Eps).toLowerCase();if(!(Number(e?.Epr)===2||Number(e?.Esid)===6||/\b(ft|ended|after penalties|after extra time|ap|aet)\b/.test(st)))continue;out.push({eventId:String(e?.Eid||''),startTime:t,home,away,homeScore:hs,awayScore:as})}return dedupe(out,'LiveScore')}

export function parse365ScoresResults(j){const out=[];for(const g of j?.games||j?.Games||[]){const home=clean(g?.homeCompetitor?.name||g?.homeCompetitor?.longName),away=clean(g?.awayCompetitor?.name||g?.awayCompetitor?.longName),hs=num(g?.homeCompetitor?.score),as=num(g?.awayCompetitor?.score),t=parseTs(g?.startTime);if(!home||!away||hs===null||as===null||!Number.isFinite(t))continue;if(!(Number(g?.statusGroup)===4||/ended|finished|full time|final/i.test(clean(g?.statusText||g?.shortStatusText))))continue;out.push({eventId:String(g?.id||''),startTime:t,home,away,homeScore:hs,awayScore:as})}return dedupe(out,'365Scores')}

function extractJsonScripts(html){const out=[];for(const m of String(html||'').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)){let s=m[1].trim();if(!s)continue;if(s.startsWith('<!--'))s=s.replace(/^<!--|-->$/g,'').trim();if(!(s.startsWith('{')||s.startsWith('[')))continue;try{out.push(JSON.parse(s))}catch{}}return out}
export function parseGenericHydrationResults(html,source){const out=[],seen=new Set();const walk=(v,depth=0)=>{if(depth>10||v==null)return;if(Array.isArray(v)){for(const x of v.slice(0,5000))walk(x,depth+1);return}if(typeof v!=='object')return;const e=eventShape(v);if(e){const k=`${e.eventId}|${e.startTime}|${e.home}|${e.away}`;if(!seen.has(k)){seen.add(k);out.push(e)}}for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,depth+1)};for(const j of extractJsonScripts(html))walk(j);return dedupe(out,source)}

export function resultSourceInfo(){return RESULT_STATS_SOURCES.map(x=>({...x}))}
