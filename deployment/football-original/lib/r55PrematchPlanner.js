// Pure selection plan. Markets and kickoff dates are supplied exclusively by the
// immutable, Bongdalu-verified daily snapshot. No fetching or fresh predictions.
const MIN_MS=40*60000,MAX_MS=60*60000;
export function planR55Prematch(matches,now=Date.now(),limit=40){
 const valid=(Array.isArray(matches)?matches:[]).filter(m=>{
  const at=Date.parse(m?.kickoff||"")-20*60000;
  return /^BDL_\d{5,12}$/.test(String(m?.id||"")) &&
   ["AH","OU"].includes(m?.market?.type) &&
   Number.isFinite(at) && at>now+60000;
 }).map(m=>({...m,at:Date.parse(m.kickoff)-20*60000}));
 valid.sort((a,b)=>a.at-b.at||Number(b.priority||0)-Number(a.priority||0));
 const selected=[],used=new Set();
 if(!valid.length)return {selected,available:0,gapsMinutes:[],gapsOver60:0};
 // Always continue after an unavoidable >60-minute fixture gap, rather than
 // silently stopping the entire day's Telegram schedule.
 while(selected.length<limit){
  const last=selected[selected.length-1];
  const earliest=valid.find(m=>!used.has(m.id)&&(!last||m.at-last.at>=MIN_MS));
  if(!earliest)break;
  const isContinuous=!!last&&earliest.at-last.at<=MAX_MS;
  const end=isContinuous?last.at+MAX_MS:earliest.at+10*60000;
  const window=valid.filter(m=>!used.has(m.id)&&m.at>=earliest.at&&m.at<=end);
  window.sort((a,b)=>{
   // A slight 10-minute concession to choose the best major competition
   // without delaying the first eligible pre-match notification unnecessarily.
   return Number(b.priority||0)-Number(a.priority||0)||
     Number(b.market?.worstEV||0)-Number(a.market?.worstEV||0)||
     Number(b.market?.expectedEV||0)-Number(a.market?.expectedEV||0)||a.at-b.at;
  });
  const next=window[0];
  selected.push(next);used.add(next.id);
 }
 const gapsMinutes=selected.slice(1).map((m,i)=>+((m.at-selected[i].at)/60000).toFixed(1));
 return {selected,available:valid.length,gapsMinutes,
  gapsUnder40:gapsMinutes.filter(x=>x<40).length,
  gapsOver60:gapsMinutes.filter(x=>x>60).length,
  gaps40to60:gapsMinutes.filter(x=>x>=40&&x<=60).length};
}