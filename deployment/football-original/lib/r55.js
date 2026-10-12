// Shared R55 validation and ranking. Never fabricate predictions from fixtures alone.
const leagues=["premier league","la liga","serie a","bundesliga","ligue 1","champions league","europa league","copa libertadores","j1 league","j-league","ucl","uel"];
const vnDay=(date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
const number=(v)=>v===null||v===undefined||v===""?NaN:Number(v);
function market(obj){
 if(!obj||typeof obj!=="object")return null;
 const kind=String(obj.type||"").toUpperCase();
 const pick=String(obj.pick||"").toUpperCase();
 const line=number(obj.line),odds=number(obj.odds),confidence=number(obj.confidence);
 if(!["AH","OU"].includes(kind)||!Number.isFinite(line)||!Number.isFinite(odds)||!Number.isFinite(confidence)||odds<1.01||odds>20||confidence<0||confidence>1)return null;
 if(kind==="OU"&&!["OVER","UNDER"].includes(pick))return null;
 if(kind==="AH"&&!["HOME","AWAY"].includes(pick))return null;
 if(Math.abs(line)>8||Math.abs(line*4-Math.round(line*4))>1e-7)return null;
 if(confidence<0.5)return null;
 return {type:kind,pick,line,odds,confidence,bookmaker:String(obj.bookmaker||"").slice(0,90)};
}
export function normalizeR55(entries,day){
 const out=[],rejected=[],seen=new Set();
 for(const [i,v] of entries.entries()){
  if(!v||typeof v!=="object"){rejected.push(i);continue}
  const home=String(v.home||"").trim(),away=String(v.away||"").trim(),league=String(v.league||"").trim(),country=String(v.country||"").trim();
  const kick=new Date(v.kickoff);
  if(!home||!away||home===away||!league||!Number.isFinite(kick.getTime())||vnDay(kick)!==day){rejected.push(i);continue}
  const m=(Array.isArray(v.markets)?v.markets:[]).map(market).filter(Boolean);
  if(!m.length){rejected.push(i);continue}
  const best=m.sort((a,b)=>b.confidence-a.confidence||Math.abs(b.odds-2)-Math.abs(a.odds-2))[0];
  const id=String(v.id||[league,home,away,kick.toISOString()].join("|")).slice(0,260);
  if(seen.has(id)){rejected.push(i);continue}
  seen.add(id);
  const top=leagues.some(n=>league.toLowerCase().includes(n));
  out.push({id,league,country,home,away,kickoff:kick.toISOString(),market:best,score:Math.round(best.confidence*1000)/10,priority:top?1:0,sourceRef:String(v.sourceRef||"").slice(0,250)});
 }
 out.sort((a,b)=>b.priority-a.priority||b.score-a.score||a.kickoff.localeCompare(b.kickoff));
 return {out:out.slice(0,500),rejected};
}
export function vnToday(){return vnDay(new Date())}