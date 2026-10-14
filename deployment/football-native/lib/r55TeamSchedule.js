// Independently verified Bongdalu team-schedule JSON: completed games only.
// A match without its own timestamp and team identity is never treated as
// proven history, especially in historical backtests (prevents future leakage).
const integer = value => {
  if(value===null||value===undefined||String(value).trim()==="")return null;
  const n=Number(value);return Number.isInteger(n)?n:null;
};
function scheduleTime(value){
  if(value===null||value===undefined||value==="")return null;
  if(typeof value==="number"||/^\d{10,13}$/.test(String(value))){
    const n=Number(value),ms=n<1e11?n*1000:n;
    return Number.isFinite(ms)&&ms>946684800000?ms:null;
  }
  const text=String(value).trim();
  const dotnet=text.match(/^\/Date\((\d{12,13})\)\/$/);
  if(dotnet)return Number(dotnet[1]);
  // Bongdalu's VN schedule clock is UTC+07 if no zone is supplied.
  const standard=text.match(/^(20\d\d)[-\/]([01]?\d)[-\/]([0-3]?\d)(?:[ T]([0-2]?\d):([0-5]\d)(?::([0-5]\d))?)?$/);
  if(standard){
    const [_,y,m,d,h="00",min="00",s="00"]=standard;
    const iso=`${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}T${h.padStart(2,"0")}:${min}:${s}+07:00`;
    const n=Date.parse(iso);return Number.isFinite(n)?n:null;
  }
  const zoned=/^20\d\d-\d\d-\d\dT\d\d:\d\d/.test(text)&&/(?:Z|[+-]\d\d:?\d\d)$/.test(text);
  if(zoned){const n=Date.parse(text);return Number.isFinite(n)?n:null;}
  return null;
}
export function parseBongdaluTeamSchedule(payload,teamId,before){
  const wanted=integer(teamId),cutoff=Number(before);
  if(!wanted||!Number.isFinite(cutoff)||cutoff<946684800000||
     !payload||!Array.isArray(payload.MatchList))return [];
  const out=[],seen=new Set();
  for(const m of payload.MatchList){
    if(!m||typeof m!=="object"||integer(m.State)!==-1)continue;
    const hid=integer(m.HomeID),aid=integer(m.AwayID);
    const home=hid===wanted;
    if(!hid||!aid||hid===aid||(hid!==wanted&&aid!==wanted))continue;
    const matchId=integer(m.ID??m.MatchID);
    const hg=integer(m.HomeScore),ag=integer(m.AwayScore);
    if(!matchId||seen.has(matchId)||hg===null||ag===null||
       hg<0||ag<0||hg>30||ag>30)continue;
    let ts=null;
    for(const field of ["Time","E8Date","DateFormat","MatchTime","StartTime","Date"]){
      ts=scheduleTime(m[field]);if(ts!==null)break;
    }
    if(ts===null||ts>=cutoff||ts>Date.now()+60000)continue;
    seen.add(matchId);
    out.push({matchId:String(matchId),homeGoals:hg,awayGoals:ag,
      teamGoals:home?hg:ag,conceded:home?ag:hg,teamIsHome:home,
      date:new Date(ts).toISOString().slice(0,10),timestamp:ts,quotes:[],
      formSource:"bongdalu_team_schedule_verified"});
  }
  return out.sort((a,b)=>b.timestamp-a.timestamp).slice(0,20);
}
export function formSummary(rows){
  const r=Array.isArray(rows)?rows:[];
  const n=r.length;
  return {n,ppg:n?r.reduce((s,x)=>s+(x.teamGoals>x.conceded?3:x.teamGoals===x.conceded?1:0),0)/n:0,
    gf:n?r.reduce((s,x)=>s+x.teamGoals,0)/n:0,
    ga:n?r.reduce((s,x)=>s+x.conceded,0)/n:0};
}
