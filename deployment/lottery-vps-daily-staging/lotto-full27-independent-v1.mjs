// KQ247 XSMB independent FULL-27-PRIZE positional lottery model, staging only.
// Each rule is a distinct historical positional relationship, not a random
// weight variation. Strictly uses 500 past actual draws and NEVER forecasts.
import {createHash} from 'node:crypto';
const pad=n=>String(n).padStart(2,'0');
const dayTime=d=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error('invalid_date');
 const t=Date.parse(d+'T00:00:00Z');
 if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==d)throw Error('invalid_date');
 return t;
};
const days=(a,b)=>(dayTime(a)-dayTime(b))/86400000;
const canon=(p,j)=>p+':'+j;
function validateHistory(predictionDate,draws){
 if(!Array.isArray(draws)||draws.length!==500)throw Error('requires_exactly_500_actual_draws');
 const h=[...draws].sort((a,b)=>b.draw_date.localeCompare(a.draw_date));
 for(let k=0;k<500;k++){
  const d=h[k];dayTime(d.draw_date);
  if(d.draw_date>=predictionDate||k>0&&days(h[k-1].draw_date,d.draw_date)<=0)
   throw Error('nonconsecutive_or_future_actual_'+k);
  if(!Array.isArray(d.full_results)||d.full_results.length!==27||
   !Array.isArray(d.all2)||d.all2.length!==27)throw Error('need_all27_full_prizes_'+k);
  for(let p=0;p<27;p++){
   const x=d.full_results[p];
   if(typeof x!=='string'||!/^\d{2,6}$/.test(x)||
      x.slice(-2)!==d.all2[p])throw Error('full_position_mismatch_'+k+'_'+p);
  }
  if(d.full_results[0]!==d.special)throw Error('special_not_same_as_full_prize');
  if(k&&d.full_results.some((s,p)=>s.length!==h[0].full_results[p].length))
   throw Error('prize_position_shape_changed');
 }
 if(days(predictionDate,h[0].draw_date)!==1)throw Error('needs_yesterdays_full_27_actuals');
 return h;
}
function createPositionalRules(shapes){
 const rules=[];
 const lens=shapes.map(s=>s.length);
 const keyOf=(r,full)=>{
  const [p,j]=r.coordinates[0];
  const a=+full[p][j];
  if(r.coordinates.length===1)return String(a);
  const [q,k]=r.coordinates[1],b=+full[q][k];
  if(r.operation==='exact')return String(a*10+b);
  if(r.operation==='sum')return String((a+b)%10);
  if(r.operation==='difference')return String((a+10-b)%10);
  if(r.operation==='product')return String((a*b)%10);
  if(r.operation==='mirror')return String((9-a)*10+(9-b));
  if(r.operation==='triple'){
   const [r0,r1]=r.coordinates[2],c=+full[r0][r1];
   return String((a*100+b*10+c)%1000);
  }
  if(r.operation==='tripleSum'){
   const [r0,r1]=r.coordinates[2],c=+full[r0][r1];
   return String((a+b+c)%10);
  }
  throw Error('unknown_rule_operation');
 };
 const add=(family,coordinates,operation,minSupport=3)=>{
  if(coordinates.some(([p,j])=>p<0||p>=27||j<0||j>=lens[p]))throw Error('invalid_rule_coordinate');
  rules.push({id:family+':'+operation+':'+coordinates.map(([p,j])=>canon(p,j)).join(','),family,coordinates,operation,minSupport});
 };
 // Family 1: every physical digit, with its exact prize number and position.
 for(let p=0;p<27;p++)for(let j=0;j<lens[p];j++)add('single_position',[[p,j]],'exact',5);
 // Families 2-3: separate adjacent and non-adjacent within-prize bridges.
 for(let p=0;p<27;p++)for(let j=0;j<lens[p];j++){
  if(j+1<lens[p])for(const op of ['exact','sum','difference','product'])add('within_adjacent',[[p,j],[p,j+1]],op,op==='exact'?3:5);
  if(j+2<lens[p])for(const op of ['exact','sum','difference'])add('within_skip',[[p,j],[p,j+2]],op,op==='exact'?3:5);
  if(j+3<lens[p])for(const op of ['exact','sum'])add('within_far',[[p,j],[p,j+3]],op,op==='exact'?3:5);
  if(j+2<lens[p]){
   add('triple_sequence',[[p,j],[p,j+1],[p,j+2]],'tripleSum',5);
   add('triple_sequence',[[p,j],[p,j+1],[p,j+2]],'triple',2);
  }
 }
 // Families 5-6: per-position bridges between different prize rows.
 for(const step of [1,2,3]){
  for(let p=0;p<27;p++)for(let j=0;j<lens[p];j++){
   const q=(p+step)%27;
   const k=j%lens[q];
   for(const op of ['exact','sum','difference'])
    add('cross_prize_step_'+step,[[p,j],[q,k]],op,op==='exact'?3:5);
  }
 }
 // Family 8: digit reversal across prize rows, preserving the actual position.
 for(let p=0;p<27;p++)for(let j=0;j<lens[p];j++){
  const q=(p+1)%27,k=lens[q]-1-(j%lens[q]);
  add('cross_reverse',[[p,j],[q,k]],'exact',3);
  add('cross_reverse',[[p,j],[q,k]],'difference',5);
 }
 return {rules,keyOf,positionCount:lens.reduce((a,b)=>a+b,0)};
}
function noOlderForecasts(history){return history.every(r=>!('prediction' in r)&&!('lotto3' in r)&&!('forecast' in r));}
export function predictLottoFull27({predictionDate,draws,region='mb',station='XSMB',ganLimit=10}){
 dayTime(predictionDate);
 if(region!=='mb'||station!=='XSMB')throw Error('full27_engine_currently_XSMB_only');
 const history=validateHistory(predictionDate,draws);
 if(!noOlderForecasts(history))throw Error('past_forecast_in_input_refused');
 const latest=history[0],prev=history[1];
 const excludedConsecutive=new Set(latest.all2.filter(n=>prev.all2.includes(n)));
 const lastSeen=new Array(100).fill(null),count=new Array(100).fill(0);
 for(const d of history){
  for(const v of d.all2){let n=+v;count[n]++;if(lastSeen[n]===null)lastSeen[n]=d.draw_date;}
 }
 const exclusion=new Set();
 const ganRecords={};
 for(let n=0;n<100;n++){
  const gap=lastSeen[n]===null?Infinity:days(predictionDate,lastSeen[n]);
  if(gap>ganLimit||excludedConsecutive.has(pad(n)))exclusion.add(pad(n));
  ganRecords[pad(n)]=gap;
 }
 const usable=[...Array(100).keys()].filter(n=>!exclusion.has(pad(n)));
 const doubles=usable.filter(n=>n%11===0);
 if(usable.length<3||doubles.length<2)throw Error('insufficient_valid_numbers_after_hard_exclusion');
 const {rules,keyOf,positionCount}=createPositionalRules(latest.full_results);
 const claimed=new Set(),evidenced=new Set();
 const methodEvidence=[],votes=new Float64Array(100),doubleVotes=new Float64Array(100);
 const familyRules={},familySupported={},familyWins={};
 const buckets=new Map();
 for(const rule of rules)familyRules[rule.family]=(familyRules[rule.family]||0)+1;
 for(const rule of rules){
  for(const pos of rule.coordinates)claimed.add(canon(pos[0],pos[1]));
  const currentKey=keyOf(rule,latest.full_results);
  const matched=[];
  // i=1 means older historical draw, outcome i-1 is the actual next day.
  for(let i=1;i<history.length;i++)if(keyOf(rule,history[i].full_results)===currentKey)matched.push(i);
  if(matched.length<rule.minSupport)continue;
  const scores=new Float64Array(100);
  let weightSum=0;
  for(const i of matched){
   const weight=1/(1+i/230);
   weightSum+=weight;
   const counts=new Uint8Array(100);
   for(const val of history[i-1].all2)counts[+val]++;
   for(let n=0;n<100;n++)if(counts[n])scores[n]+=weight*(.75+.25*counts[n]);
  }
  for(const pos of rule.coordinates)evidenced.add(canon(pos[0],pos[1]));
  // Credibility comes from actual historic support, not arbitrary repeated weights.
  const reliability=Math.sqrt(matched.length/(matched.length+12));
  const ranked=(candidate)=>{
   const observations=scores[candidate]/weightSum;
   const baseline=count[candidate]/(500*27);
   return reliability*(observations+.05*baseline);
  };
  const rank=group=>group.reduce((best,n)=>{
    if(best===null)return n;
    const a=ranked(n),b=ranked(best);
    return a>b+1e-12||Math.abs(a-b)<=1e-12&&n<best?n:best;
  },null);
  const winner=rank(usable),doubleWinner=rank(doubles);
  if(winner===null||doubleWinner===null)throw Error('method_nominee_missing');
  const w=1/Math.sqrt(familyRules[rule.family]);
  votes[winner]+=w;doubleVotes[doubleWinner]+=w;
  familySupported[rule.family]=(familySupported[rule.family]||0)+1;
  familyWins[rule.family]??={};
  familyWins[rule.family][pad(winner)]=(familyWins[rule.family][pad(winner)]||0)+1;
  methodEvidence.push({id:rule.id,matchedDays:matched.length,winner:pad(winner),doubleWinner:pad(doubleWinner)});
 }
 if(claimed.size!==positionCount||evidenced.size!==positionCount)throw Error('NOT_ALL_FULL_PRIZE_POSITIONS_EVIDENCED_'+evidenced.size+'/'+positionCount);
 const activeFamilyCount=Object.keys(familySupported).length;
 if(activeFamilyCount<6)throw Error('NOT_ENOUGH_INDEPENDENT_POSITIONAL_FAMILIES_'+activeFamilyCount);
 const score=(n,v)=>v[n]+.00001*count[n];
 const rankSelect=(ns,v,limit)=>ns.sort((a,b)=>score(b,v)-score(a,v)||a-b).slice(0,limit).map(pad).sort();
 const picks=rankSelect(usable,votes,3),doublePicks=rankSelect(doubles,doubleVotes,2);
 if(picks.some(n=>exclusion.has(n))||doublePicks.some(n=>exclusion.has(n)))throw Error('HARD_EXCLUSION_BREACH');
 const inputHash=createHash('sha256').update(JSON.stringify(history.map(x=>[x.draw_date,x.full_results]))).digest('hex');
 return {
  predictionDate,region,station,picks,doubles:doublePicks,sourceLastDate:latest.draw_date,
  sourceDraws:500,model:'KQ247_XSMB_FULL27_POSITIONAL_INDEPENDENT_STAGING_V1',
  previousForecastsUsed:false,
  sourceInputHash:inputHash,
  all27PrizesUsed:true,allDigitsPositionsUsed:true,
  audit:{
   lastActualPrizeDigitPositions:positionCount,coveredByCreatedRules:claimed.size,
   coveredBySupportedIndependentRules:evidenced.size,
   definedRules:rules.length,supportedIndependentRules:methodEvidence.length,
   familyRules,familySupported,activeFamilyCount,
   excludedConsecutive:[...excludedConsecutive].sort(),
   excludedGanOver10:[...exclusion].filter(n=>ganRecords[n]>ganLimit).sort(),
   topVotes:[...usable].sort((a,b)=>score(b,votes)-score(a,votes)).slice(0,10).map(n=>({number:pad(n),score:Number(votes[n].toFixed(4))})),
   familyVotes:familyWins,
   methodSamples:methodEvidence.slice(0,12)
  }
 };
}