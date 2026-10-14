// KQ247 all regions: ONLY the most recent completed draw of THIS SAME STATION
// is used for positional bridge votes. No 500-draw backtest, no past predictions.
// Short factual prior-station history may ONLY enforce the separate prior-2-draw
// and gan>10 station-draw exclusions, never enter bridge scores.
import {createHash} from 'node:crypto';
import {normalizedStationDraw,totalDigitPositions} from './normalize-all-prizes.mjs';
const pad=n=>String(n).padStart(2,'0');
const dayValue=s=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('BAD_PREDICTION_DATE');
 return s;
};
const rank=(values,positive,negative)=>values.sort((a,b)=>{
 const sa=positive[a]-negative[a]*.48,sb=positive[b]-negative[b]*.48;
 return sb-sa||a-b;
});
const top=(values,k)=>values.slice(0,k).map(pad).sort();
function exclusionChecks({region,station,priorDraw,exclusionHistory}){
 if(!exclusionHistory)return {excluded:new Set(),validated:false,reason:'NO_ADDITIONAL_STATION_HISTORY_SUPPLIED'};
 if(!Array.isArray(exclusionHistory)||exclusionHistory.length<11)throw Error('NEED_11_REAL_SAME_STATION_DRAWS_FOR_GAN');
 const rows=exclusionHistory.map(x=>{
  if(x.region!==region||x.station!==station||!Array.isArray(x.all2)||x.all2.length!==(region==='mb'?27:18))
   throw Error('EXCLUSION_HISTORY_MIXED_STATIONS');
  return x;
 }).sort((a,b)=>b.draw_date.localeCompare(a.draw_date));
 if(rows[0].draw_date!==priorDraw.draw_date||rows.some((r,i)=>i&&r.draw_date>=rows[i-1].draw_date))
  throw Error('GAN_HISTORY_MISSING_LATEST_OR_DUPLICATE');
 const missed=new Array(100).fill(true);
 for(let i=0;i<10;i++)for(const s of rows[i].all2)missed[+s]=false;
 const consecutive=new Set(rows[0].all2.filter(x=>rows[1].all2.includes(x)));
 const excluded=new Set([...Array(100).keys()].filter(n=>missed[n]).map(pad));
 for(const n of consecutive)excluded.add(n);
 return {excluded,validated:true,reason:'LAST_10_STATION_DRAWS_FOR_GAN_AND_LAST_2_FOR_CONSECUTIVE'};
}
export function predictFromPreviousStationDraw({predictionDate,region,station,previousDraw,exclusionHistory=null}){
 const target=dayValue(predictionDate);
 const d=normalizedStationDraw(previousDraw);
 if(d.region!==region||d.station!==station||d.draw_date>=target)throw Error('WRONG_PREVIOUS_STATION_DRAW');
 const positions=d.full_results.flatMap((v,prize)=>[...v].map((char,column)=>({digit:+char,prize,column})));
 const expected=totalDigitPositions(region);
 if(positions.length!==expected)throw Error('MISSING_DIGIT_POSITION');
 const len=positions.length;
 const digits=Uint8Array.from(positions.map(p=>p.digit));
 const seen=new Uint8Array(len),catchLO=new Float64Array(100),removeLO=new Float64Array(100);
 const catchKEP=new Float64Array(100),removeKEP=new Float64Array(100);
 const catchDE=new Float64Array(100),removeDE=new Float64Array(100);
 const catchHundred=new Float64Array(10),removeHundred=new Float64Array(10);
 const catch3=new Float64Array(1000),remove3=new Float64Array(1000);
 let pairRules=0,catchTripleRules=0,removeTripleRules=0;
 // Cross-prize and within-prize independent position-pair transformations.
 for(let i=0;i<len;i++){
  const a=digits[i];seen[i]=1;
  for(let j=0;j<len;j++){
   if(i===j)continue;
   const b=digits[j],ab=10*a+b,ba=10*b+a;
   catchLO[ab]+=1;catchLO[(10*a+(a+b)%10)]+=1;
   catchDE[ba]+=1;catchDE[(10*(a+b)%10+b)]+=1;
   catchKEP[a*11]+=1;catchKEP[b*11]+=.25;
   // Separate rejection operators, NOT a negation of catch votes.
   removeLO[10*((a+10-b)%10)+b]++;removeDE[10*((a*b)%10)+(a+10-b)%10]++;
   removeKEP[((a+b)%10)*11]++;pairRules+=6;
  }
 }
 // Ordered, distinct source positions. Two different triple-bridge families
 // for catch and two independently defined rejection families.
 // MT/MN: 82*81*80 distinct ordered triples = 531,360, x2 >=1m rules.
 for(let i=0;i<len;i++){
  const a=digits[i];
  for(let j=0;j<len;j++){
   if(j===i)continue;
   const b=digits[j];
   for(let k=0;k<len;k++){
    if(k===i||k===j)continue;
    const c=digits[k];
    const abc=100*a+10*b+c,acb=100*a+10*c+b;
    const x=(a+b+c)%10,y=(a+10+b-c)%10;
    catchLO[10*a+x]++;catchDE[10*b+y]++;
    catch3[abc]++;catchHundred[a]++;
    catchKEP[b*11]+=.1;
    catchTripleRules+=2;
    removeLO[10*y+c]++;removeDE[10*x+a]++;
    remove3[acb]++;removeHundred[c]++;
    removeKEP[x*11]+=.1;
    removeTripleRules+=2;
   }
  }
 }
 if(seen.some(x=>!x)||catchTripleRules<1e6||removeTripleRules<1e6)throw Error('NOT_ALL_POSITION_RULES_COVERED');
 const {excluded,validated,reason}=exclusionChecks({region,station,priorDraw:d,exclusionHistory});
 // Old-history check is not used in ANY bridge vote.
 const allowed=[...Array(100).keys()].filter(n=>!excluded.has(pad(n)));
 const doubled=allowed.filter(n=>n%11===0);
 if(allowed.length<3||doubled.length<2)throw Error('HARD_EXCLUSION_LEAVES_NO_VALID_SELECTION');
 const lotto=top(rank([...allowed],catchLO,removeLO),3);
 const doubles=top(rank([...doubled],catchKEP,removeKEP),2);
 const removeHead=[...Array(10).keys()].sort((a,b)=>{
  const sum=x=>[...Array(10).keys()].reduce((s,t)=>s+removeDE[x*10+t],0);
  return sum(b)-sum(a)||a-b;
 })[0];
 const pool=[...Array(100).keys()].filter(n=>Math.floor(n/10)!==removeHead);
 const ranking=rank(pool,catchDE,removeDE);
 const dan50=top(ranking,50),dan60=top(ranking,60),dan75=top(ranking,75);
 const bannedHundred=[...Array(10).keys()].sort((a,b)=>removeHundred[b]-removeHundred[a]||a-b)[0];
 const triples=[];
 for(let h=0;h<10;h++){
  if(h===bannedHundred)continue;
  for(const number of dan75){
   const n=Number(number),val=h*100+n;
   triples.push({val,score:catch3[val]-remove3[val]*.48+catchHundred[h]*.0001});
  }
 }
 triples.sort((a,b)=>b.score-a.score||a.val-b.val);
 const three_digit=triples.slice(0,500).map(x=>String(x.val).padStart(3,'0')).sort();
 if(lotto.length!==3||doubles.length!==2||dan50.length!==50||dan60.length!==60||dan75.length!==75||
  three_digit.length!==500||new Set(three_digit).size!==500||
  dan50.some(n=>!dan60.includes(n))||dan60.some(n=>!dan75.includes(n))||
  three_digit.some(n=>!dan75.includes(n.slice(-2))||+n[0]===bannedHundred))
  throw Error('PREDICTION_POOL_INVALID');
 return {region,station,predictionDate:target,sourceDate:d.draw_date,sourcePrizes:d.full_results.length,
  digitPositions:positions.length,sourceSHA256:createHash('sha256').update(JSON.stringify([region,station,d.draw_date,d.full_results])).digest('hex'),
  lotto3:lotto,doubles,dan50,dan60,dan75,three_digit,
  hardExcludedHead:String(removeHead),hardExcludedHundred:String(bannedHundred),
  previousForecastsUsed:false,method:'SAME_STATION_PREVIOUS_DRAW_ALL_PRIZE_POSITIONS_V1',
  exclusionsValidated:validated,exclusionSource:reason,
  audit:{pairRules,catchTripleRules,removeTripleRules,coveredPositions:seen.reduce((s,n)=>s+n,0),
   allPrizesUsed:true,allPositionsUsed:true,bridgeSourceDrawCount:1,
   bridgeSourceStation:station,ganHistoryUsedForBridges:false,
   excludedNumbers:[...excluded].sort()}};
}
