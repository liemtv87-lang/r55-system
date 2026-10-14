// R55 Ensemble v3, used on verified Bongdalu PRE-MATCH data only.
// Three partly correlated scenarios; no use of final score, future market data, or outcomes of this match.
const bounded=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const round=(n,p=3)=>Number(n.toFixed(p));
function pmf(lambda){
 const p=new Array(12);p[0]=Math.exp(-lambda);
 let total=p[0];for(let i=1;i<12;i++){p[i]=p[i-1]*lambda/i;total+=p[i];}
 // Absorb the tiny 12+ tail to keep the probability sum at exactly one.
 p[11]+=1-total;return p;
}
function outcome(type,pick,line,h,a){
 const delta=type==="AH"?(pick==="HOME"?h-a+line:a-h+line):
   (pick==="OVER"?h+a-line:line-h-a);
 return delta>1e-8?1:delta<(-1e-8)?-1:0;
}
function expectedReturn(type,pick,line,odds,home,away){
 const split=Math.abs(Math.round(line*4))%2===1?[line-.25,line+.25]:[line];
 const h=pmf(home),a=pmf(away);
 let value=0;
 for(let i=0;i<h.length;i++)for(let j=0;j<a.length;j++){
  const profit=split.reduce((s,x)=>{
   const v=outcome(type,pick,x,i,j);
   return s+(v>0?odds-1:v<0?-1:0);
  },0)/split.length;
  value+=h[i]*a[j]*profit;
 }
 return value;
}
export function evaluateR55EvidenceQuality(row,h,native){
 const mk=row?.market||{},home=h?.home||{},away=h?.away||{},h2h=h?.h2h||{};
 const nh=Number(home.n||0),na=Number(away.n||0),nH2H=Number(h2h.n||0),books=Number(mk.bookmakerCount||0);
 const reason=[];
 if(nh<15||na<15)reason.push("form_samples_under_15");
 if(books<3)reason.push("bookmaker_count_under_3");
 // Zero prior head-to-head meetings is normal for first-time UEFA/WC fixtures.
 // H2H is optional context, never an entry/release quality requirement.
 if(Number(mk.ahLineSpread||0)>.25||Number(mk.ouLineSpread||0)>.25)reason.push("bookmaker_line_disagreement");
 if(native?.market_risk?.bookmaker_disagreement)reason.push("native_disagreement");
 const numbers=[home.gf,home.ga,away.gf,away.ga,native?.model?.xg_home,native?.model?.xg_away];
 if(numbers.some(x=>!finite(Number(x))||Number(x)<0||Number(x)>8))reason.push("invalid_form_xg");
 if(!finite(Number(mk.homeLine))||!finite(Number(mk.awayLine))||
    Math.abs(Number(mk.homeLine)+Number(mk.awayLine))>.01)reason.push("inconsistent_handicap_sides");
 if(!finite(Number(mk.ouLine))||Number(mk.ouLine)<1.5||Number(mk.ouLine)>5)reason.push("ou_line_outside_model_range");
 return {ok:!reason.length,reasons:reason,books,nh,na,nH2H};
}
function estimates(row,h,native){
 const mh=bounded(Number(native.model.xg_home),.2,4.3),ma=bounded(Number(native.model.xg_away),.2,4.3);
 const formH=bounded((Number(h.home.gf)+Number(h.away.ga))*.515,.2,4.3);
 const formA=bounded((Number(h.away.gf)+Number(h.home.ga))*.485,.2,4.3);
 const total=bounded((mh+ma)*.65+Number(row.market.ouLine)*.35,.6,7);
 const diff=bounded((mh-ma)*.65-Number(row.market.homeLine)*.35,-3,3);
 const anchorH=bounded((total+diff)/2,.2,4.3),anchorA=bounded((total-diff)/2,.2,4.3);
 return [[mh,ma],[formH,formA],[anchorH,anchorA]];
}
import {bookmakerSideAgreement} from "lib/r55BookmakerConsensus.js";
// Historical AH/OU evidence is measured from the individual matches and every
// bookmaker's published line, with each past match weighted only once.
function historicalEvidence(history,option){
 const collection=option.type==="AH"?
  (option.pick==="HOME"?history?.individualHistory?.home:history?.individualHistory?.away):
  [...(history?.individualHistory?.home||[]),...(history?.individualHistory?.away||[])];
 if(!Array.isArray(collection))return {matches:0,bookmakerQuotes:0,score:null};
 let total=0,seen=0,quotes=0;
 for(const row of collection){
  const published=(row?.quotes||[]).filter(q=>Number.isFinite(Number(option.type==="AH"?q.ahClosing:q.ouClosing)));
  if(!published.length)continue;
  const values=[];
  for(const q of published){
   const raw=Number(option.type==="AH"?q.ahClosing:q.ouClosing);
   if(option.type==="OU"&&(raw<.5||raw>8))continue;
   if(option.type==="AH"&&Math.abs(raw)>6)continue;
   const actual=option.type==="AH"?
    Number(row.teamGoals)-Number(row.conceded):
    Number(row.homeGoals)+Number(row.awayGoals);
   const line=option.type==="AH"?(row.teamIsHome?-raw:raw):raw;
   if(!Number.isFinite(actual)||!Number.isFinite(line))continue;
   const legs=Math.abs(Math.round(line*4))%2===1?[line-.25,line+.25]:[line];
   const outcome=legs.reduce((s,l)=>{const delta=option.type==="AH"?actual+l:
     (option.pick==="OVER"?actual-l:l-actual);
    const signed=option.type==="AH"?delta:
      delta;
    return s+(signed>1e-8?1:signed< -1e-8?-1:0);
   },0)/legs.length;
   values.push(outcome);
  }
  if(!values.length)continue;
  let matchScore=values.reduce((s,x)=>s+x,0)/values.length;
  if(option.type==="AH"&&option.pick==="AWAY")matchScore=matchScore;
  total+=matchScore;seen++;quotes+=values.length;
 }
 return {matches:seen,bookmakerQuotes:quotes,score:seen?round(total/seen,3):null};
}
function nativeSide(row,native,type){
 const raw=String(type==="AH"?native?.ah?.pick:native?.ou?.pick).trim().toUpperCase();
 if(!raw)return null;
 if(type==="OU")return ["OVER","TÀI","TAI"].includes(raw)?"OVER":
   ["UNDER","XỈU","XIU"].includes(raw)?"UNDER":null;
 if(["HOME","CHỦ","1",String(row?.home||"").trim().toUpperCase()].includes(raw))return "HOME";
 if(["AWAY","KHÁCH","2",String(row?.away||"").trim().toUpperCase()].includes(raw))return "AWAY";
 return null;
}
export function chooseR55Ensemble(row,h,native){
 const mk=row?.market||{},q=evaluateR55EvidenceQuality(row,h,native);
 if(!native?.model||!q.ok&&q.reasons.includes("invalid_form_xg"))return null;
 let models;
 try{models=estimates(row,h,native)}catch{return null;}
 if(models.some(pair=>pair.some(x=>!finite(x))))return null;
 const ah=Number(mk.homeLine),ou=Number(mk.ouLine);
 const options=[
  {type:"AH",pick:"HOME",line:ah,odds:Number(mk.homePrice)},
  {type:"AH",pick:"AWAY",line:-ah,odds:Number(mk.awayPrice)},
  {type:"OU",pick:"OVER",line:ou,odds:Number(mk.overPrice)},
  {type:"OU",pick:"UNDER",line:ou,odds:Number(mk.underPrice)}
 ].filter(x=>Number.isFinite(x.line)&&Number.isFinite(x.odds)&&
    x.odds>=1.65&&x.odds<=2.20&&Math.abs(x.line*4-Math.round(x.line*4))<1e-8);
 const scored=options.map(x=>{
  const evs=models.map(([a,b])=>expectedReturn(x.type,x.pick,x.line,x.odds,a,b));
  const ev=evs.reduce((s,n)=>s+n,0)/evs.length,worst=Math.min(...evs),best=Math.max(...evs);
  const expectedNativePick=nativeSide(row,native,x.type);
  const sameNative=expectedNativePick===null?null:x.pick===expectedNativePick;
  const signal=Number(x.type==="AH"?native?.ah?.signal_score:native?.ou?.signal_score)||0;
  const risk=x.type==="OU"&&x.pick==="OVER"&&Math.abs(x.line-1.75)<.001&&native?.market_risk?.low_total_175?.over_blocked;
  // Huge modeled returns are often caused by stale form or market misalignment.
  // Quarantine them rather than advertising implausibly certain outcomes.
  const modelStable=worst>.025&&best-worst<.25&&ev>.085&&ev<.24;
   const bookAgreement=bookmakerSideAgreement(mk.bookmakerQuotes||[],x);
  // Release only where independent R55 source-direction and scenario EV agree.
  // Keep other picks visible as research-only; never fabricate coverage/accuracy.
  const accept=q.ok&&modelStable&&sameNative===true&&signal>=64&&!risk&&!bookAgreement.strongOpposition&&Number(row.priority)>=175&&
       !(x.type==="AH"&&Math.abs(x.line)>1.25)&&!(x.type==="OU"&&x.line>=4);
  // Model-only edges above 24% and very deep Asian lines caused the
  // unverified 12-Oct losses. For shadow picks, prefer less fragile markets
  // rather than chasing exaggerated expected returns. This is NOT a win guarantee.
  const hist=historicalEvidence(h,x);
  const historyConflict=hist.matches>=12&&hist.score<-.35;
  const fragile=(x.type==="AH"&&Math.abs(x.line)>1.25?10:0)+
   (ev>.24?6:0)+(worst<-.05?4:0)+(best-worst>.25?3:0)+
   (x.type==="OU"&&x.line>=4?4:0)+(risk?10:0)+(historyConflict?3:0)+(bookAgreement.strongOpposition?4:0);
  return {...x,ev:round(ev,4),worstEV:round(worst,4),spreadEV:round(best-worst,4),
   fragility:fragile,bookmakerSideAgreement:bookAgreement,historicalSupport:hist,agree:evs.filter(n=>n>.015).length,nativeAligned:sameNative,nativeSignal:signal,
   researchOnly:!accept,reason:!q.ok?q.reasons[0]:risk?"low_175_over_blocked":bookAgreement.strongOpposition?"bookmaker_price_lean_conflict":Number(row.priority)<175?"competition_below_priority_floor":!modelStable?"ensemble_edge_not_robust":
      x.type==="AH"&&Math.abs(x.line)>1.25?"deep_ah":x.type==="OU"&&x.line>=4?"extreme_total":accept?"accepted":"quality_guard_not_met"};
 });
 if(!scored.length)return null;
 scored.sort((a,b)=>Number(a.researchOnly)-Number(b.researchOnly)||
    a.fragility-b.fragility||Number(b.historicalSupport?.score||0)-Number(a.historicalSupport?.score||0)||Number(b.nativeAligned===true)-Number(a.nativeAligned===true)||
    b.worstEV-a.worstEV||b.ev-a.ev);
 const chosen=scored[0];
 const method="r55_ensemble_v4_"+chosen.type.toLowerCase();
 return {type:chosen.type,pick:chosen.pick,line:chosen.line,odds:chosen.odds,
  method,ev:chosen.ev,worstEV:chosen.worstEV,modelSpread:chosen.spreadEV,agree:chosen.agree,
  researchOnly:chosen.researchOnly,reason:chosen.reason,bookmakers:q.books,
  evidence:chosen.nativeSignal,modelVersion:"ensemble_poisson_three_scenarios_v4_native_agreement",
  sample:{home:q.nh,away:q.na,h2h:q.nH2H},
  candidateCount:scored.length,historicalSupport:chosen.historicalSupport,
   bookmakerSideAgreement:chosen.bookmakerSideAgreement,confidence:null};
}
export {expectedReturn};