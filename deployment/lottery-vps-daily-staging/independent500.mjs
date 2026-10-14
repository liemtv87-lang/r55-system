// KQ247: daily independent 500-draw predictor. Staging; no live VPS cutover.
const pad=n=>String(n).padStart(2,"0");
function dateMs(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error("invalid_day");
  const ts=Date.parse(day+"T00:00:00Z");
  if(!Number.isFinite(ts)||new Date(ts).toISOString().slice(0,10)!==day)throw Error("invalid_date");
  return ts;
}
const age=(a,b)=>(dateMs(a)-dateMs(b))/86400000;
export function predictIndependentDaily({predictionDate,region,station,draws,ganDaysLimit=10}){
  dateMs(predictionDate);
  if(!["mb","mt","mn"].includes(region)||!station||!Array.isArray(draws))throw Error("invalid_request");
  const sorted=[...draws].sort((a,b)=>b.draw_date.localeCompare(a.draw_date));
  if(sorted.length!==500)throw Error("need_500_draws");
  const expected=region==="mb"?27:18;
  for(let i=0;i<500;i++){
    const d=sorted[i]; dateMs(d.draw_date);
    if(d.draw_date>=predictionDate || (i&&d.draw_date===sorted[i-1].draw_date))throw Error("invalid_draw_dates");
    if(!Array.isArray(d.all2)||d.all2.length!==expected||d.all2.some(n=>typeof n!=="string"||!/^\d{2}$/.test(n)))throw Error("incomplete_draw");
  }
  const sourceLastDate=sorted[0].draw_date;
  const gap=age(predictionDate,sourceLastDate);
  if(gap<1||gap>8||(region==="mb"&&gap!==1))throw Error("missing_latest_actual");
  const latest=sorted[0].all2;
  const consecutive=new Set(latest.filter(n=>sorted[1].all2.includes(n)));
  const bridge=new Set();
  for(const n of latest){
    const a=+n[0],b=+n[1];
    bridge.add(n[1]+n[0]);bridge.add(pad((a+b)*11%100));
    bridge.add(pad(Math.abs(a-b)*11));
    bridge.add(pad((+n+11)%100));bridge.add(pad((+n+99)%100));
  }
  const candidates=[];
  for(let number=0;number<100;number++){
    const n=pad(number),f={f7:0,f14:0,f30:0,f60:0,f500:0,gap:501};let last=null;
    for(let i=0;i<500;i++){
      const k=sorted[i].all2.filter(x=>x===n).length;
      if(!k)continue;
      if(last===null)last=sorted[i].draw_date;
      f.f500+=k; if(i<7)f.f7+=k;if(i<14)f.f14+=k;
      if(i<30)f.f30+=k;if(i<60)f.f60+=k;f.gap=Math.min(f.gap,i+1);
    }
    const score=f.f7*1.8+f.f14*.85+f.f30*.32+f.f60*.17+f.f500*.017+
      (bridge.has(n)?1.8:0)+(latest.includes(n)?.65:0)-
      (f.gap>9?Math.min(4,(f.gap-9)*.35):0);
    const gan=last===null?Infinity:age(predictionDate,last);
    candidates.push({n,score,gan,excluded:consecutive.has(n)||gan>ganDaysLimit});
  }
  candidates.sort((a,b)=>b.score-a.score||a.n.localeCompare(b.n));
  const valid=candidates.filter(c=>!c.excluded);
  const picks=valid.slice(0,3).map(c=>c.n).sort();
  const doubles=valid.filter(c=>c.n[0]===c.n[1]).slice(0,2).map(c=>c.n).sort();
  if(picks.length!==3||doubles.length!==2)throw Error("no_valid_three_or_doubles");
  return {predictionDate,region,station,picks,doubles,sourceLastDate,sourceDraws:500,
    model:"KQ247_NEON_CANDIDATE_SCORE_500_DAILY_PAST_ONLY",
    usedPreviousPredictions:false,ganLimitCalendarDays:ganDaysLimit};
}
