// KQ247: Backtest selects methods per station; today’s votes ONLY read its most recent full-prize draw.
// 500 historical actual draws NEVER enter the current positional feature vector.
import {createHash} from 'node:crypto';
import {normalizedStationDraw,totalDigitPositions} from './normalize-all-prizes.mjs';
const tasks=['loCatch','loReject','kepCatch','kepReject','deCatch','headReject','threeCatch','hundredReject'];
const total=1000, selectedCount=150;
const p2=x=>String(x).padStart(2,'0'),p3=x=>String(x).padStart(3,'0');
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const historyFingerprint=h=>sha(h.map(d=>[d.region,d.station,d.draw_date,d.full_results]));
const delta=(a,b)=>(Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000;
function derive(d){
 const positions=d.full_results.flatMap((v,prize)=>[...v].map((digit,column)=>({v:+digit,prize,column})));
 const n=positions.length;
 if(n!==totalDigitPositions(d.region))throw Error('NOT_ALL_PRIZE_POSITIONS');
 const covered=new Set();
 const values=Array.from({length:total},(_,id)=>{
  const i=id%n,j=(i+1+Math.floor(id/n)%(n-1))%n;
  let k=(j+1+Math.floor(id/(n*3))%(n-1))%n;
  while(k===i||k===j)k=(k+1)%n;
  covered.add(i);covered.add(j);covered.add(k);
  const a=positions[i].v,b=positions[j].v,c=positions[k].v;
  const sum=(a+b)%10,diff=(a+10-b)%10;
  return [
   [10*a+b,10*b+a,10*a+sum,10*sum+b,10*diff+c][id%5],
   10*diff+(c+id)%10,
   ((a+b+c+id%7)%10)*11,
   ((a+10-b+c)%10)*11,
   [10*b+a,10*sum+a,10*a+diff,10*b+(a*c)%10][id%4],
   (a+2*b+c+id%10)%10,
   [100*a+10*b+c,100*b+10*c+a,100*a+10*sum+c][id%3],
   (a+b+2*c+id%10)%10
  ];
 });
 if(covered.size!==n)throw Error('SOURCE_POSITION_NOT_USED');
 return values;
}
const result=x=>{
 const endings=new Set(x.all2.map(Number)),special=x.special;
 return {endings,de:+special.slice(-2),triple:+special.slice(-3),head:+special.at(-2),hundred:+special.at(-3)};
};
function success(task,n,x){
 if(task==='loCatch'||task==='kepCatch')return x.endings.has(n);
 if(task==='loReject'||task==='kepReject')return !x.endings.has(n);
 if(task==='deCatch')return n===x.de;
 if(task==='headReject')return n!==x.head;
 if(task==='threeCatch')return n===x.triple;
 if(task==='hundredReject')return n!==x.hundred;
 throw Error('UNKNOWN_METHOD_TASK');
}
function checkedHistory(history,region,station,date){
 if(!Array.isArray(history)||history.length!==500)throw Error('REQUIRE_500_COMPLETE_DRAW_RESULTS_SAME_STATION');
 const h=history.map(x=>{
  if('forecast' in x||'prediction' in x||'lotto3' in x)throw Error('FORECAST_USED_FOR_TRAINING');
  const d=normalizedStationDraw(x);
  if(d.region!==region||d.station!==station||d.draw_date>=date)throw Error('CROSS_STATION_OR_FUTURE_TRAINING');
  return d;
 }).sort((a,b)=>a.draw_date.localeCompare(b.draw_date));
 if(h.some((x,i)=>i&&x.draw_date===h[i-1].draw_date))throw Error('DUPLICATE_DRAW_HISTORY');
 return h;
}
// The 500 historical results train and validate positional method IDs, never daily vote values.
// Train on older outcomes; evaluate on newer outcomes without looking ahead to choose the methods.
export function calibrateStation500({history,region,station,predictionDate}){
 const h=checkedHistory(history,region,station,predictionDate);
 const records=tasks.map(()=>new Uint16Array(total));
 const heldout=tasks.map(()=>new Uint16Array(total));
 let trainN=0,testN=0;
 for(let i=0;i<499;i++){
  const span=delta(h[i+1].draw_date,h[i].draw_date);
  if(span<1||(region==='mb'?span!==1:span>7))continue;
  const vv=derive(h[i]),actual=result(h[i+1]);
  const training=i<349,counts=training?records:heldout;
  if(training)trainN++;else testN++;
  for(let m=0;m<total;m++)for(let t=0;t<tasks.length;t++)
   if(success(tasks[t],vv[m][t],actual))counts[t][m]++;
 }
 if(trainN<320||testN<125)throw Error('NOT_ENOUGH_VALID_HISTORICAL_TRANSITIONS_'+trainN+'_'+testN);
 const pick={},report={};
 for(let t=0;t<tasks.length;t++){
  const prior=[.27,.73,.27,.73,.01,.9,.001,.9][t];
  const ids=Array.from({length:total},(_,i)=>i).sort((a,b)=>
   (records[t][b]+4*prior)-(records[t][a]+4*prior)||a-b);
  pick[tasks[t]]=ids.slice(0,selectedCount);
  const hit=pick[tasks[t]].reduce((sum,id)=>sum+heldout[t][id],0);
  report[tasks[t]]={heldoutTransitions:testN,selectedMethods:selectedCount,
   meanSelectedMethodHitRate:+(hit/(testN*selectedCount)).toFixed(5)};
 }
 return {region,station,predictionDate,sourceDate:h.at(-1).draw_date,
  selected:pick,methodSelectionSHA256:sha(pick),historySHA256:historyFingerprint(h),
  backtest:{realCompleteDraws:500,trainTransitions:trainN,heldoutTransitions:testN,
   candidateMethodsPerTask:total,methodsSelectedPerTask:selectedCount,
   sameStationOnly:true,historyUsedForDailyVotes:false,report}};
}
function bannedFromHistory(history,region,station){
 if(!Array.isArray(history)||history.length<11)throw Error('EXCLUSIONS_REQUIRE_11_REAL_DRAWS');
 const h=history.map(normalizedStationDraw).sort((a,b)=>b.draw_date.localeCompare(a.draw_date));
 if(h.some(x=>x.region!==region||x.station!==station))throw Error('MIXED_STATION_GAN_HISTORY');
 const visible=new Set(h.slice(0,10).flatMap(x=>x.all2));
 const consecutive=new Set(h[0].all2.filter(n=>h[1].all2.includes(n)));
 const excluded=new Set(Array.from({length:100},(_,i)=>p2(i)).filter(n=>!visible.has(n)));
 for(const n of consecutive)excluded.add(n);
 return excluded;
}
export function predictFromLastDrawWithCalibration({previousDraw,history,calibration,predictionDate}){
 const d=normalizedStationDraw(previousDraw),{region,station}=d,lag=delta(predictionDate,d.draw_date);
 const checked=checkedHistory(history,region,station,predictionDate);
 if(!Number.isInteger(lag)||(region==='mb'?lag!==1:lag<1||lag>7))throw Error('WRONG_STATION_PREVIOUS_DRAW_DATE');
 if(calibration?.region!==region||calibration.station!==station||calibration.predictionDate!==predictionDate||
    calibration.sourceDate!==d.draw_date||calibration.backtest?.realCompleteDraws!==500||
    calibration.historySHA256!==historyFingerprint(checked)||
    calibration.methodSelectionSHA256!==sha(calibration.selected)||
    tasks.some(task=>{const ids=calibration.selected?.[task];return !Array.isArray(ids)||ids.length!==selectedCount||
      new Set(ids).size!==selectedCount||ids.some(i=>!Number.isInteger(i)||i<0||i>=total);}))
    throw Error('UNVERIFIED_500_STATION_CALIBRATION');
 const excluded=bannedFromHistory(history,region,station);
 const methods=derive(d),vote=tasks.map((_,i)=>new Float64Array(i===6?1000:i===5||i===7?10:100));
 for(let t=0;t<tasks.length;t++)for(const id of calibration.selected[tasks[t]])vote[t][methods[id][t]]++;
 const rank=(nums,catchIdx,rejectIdx,limit)=>nums.sort((a,b)=>
  (vote[catchIdx][b]-(rejectIdx<0?0:.45*vote[rejectIdx][b]))-
  (vote[catchIdx][a]-(rejectIdx<0?0:.45*vote[rejectIdx][a]))||a-b).slice(0,limit);
 const available=Array.from({length:100},(_,i)=>i).filter(n=>!excluded.has(p2(n)));
 const doublesAllowed=available.filter(n=>n%11===0);
 if(available.length<3||doublesAllowed.length<2)throw Error('HARD_EXCLUSIONS_NO_VALID_LOTTO');
 const lotto3=rank(available,0,1,3).map(p2).sort();
 const doubles=rank(doublesAllowed,2,3,2).map(p2).sort();
 const rejectedHead=Array.from({length:10},(_,i)=>i).sort((a,b)=>vote[5][b]-vote[5][a]||a-b)[0];
 const deNumbers=rank(Array.from({length:100},(_,i)=>i).filter(n=>Math.floor(n/10)!==rejectedHead),4,-1,75);
 const dan50=deNumbers.slice(0,50).map(p2).sort(),dan60=deNumbers.slice(0,60).map(p2).sort();
 const dan75=deNumbers.map(p2).sort();
 const rejectedHundred=Array.from({length:10},(_,i)=>i).sort((a,b)=>vote[7][b]-vote[7][a]||a-b)[0];
 const three=[];
 for(let h=0;h<10;h++)if(h!==rejectedHundred)for(const number of dan75){
  const n=Number(number),val=h*100+n;
  three.push({val,score:vote[6][val]+vote[4][n]*.01-vote[7][h]*.2});
 }
 three.sort((a,b)=>b.score-a.score||a.val-b.val);
 const three_digit=three.slice(0,500).map(x=>p3(x.val)).sort();
 if(lotto3.length!==3||doubles.length!==2||dan50.length!==50||dan60.length!==60||
  dan75.length!==75||three_digit.length!==500||
  dan50.some(x=>!dan60.includes(x))||dan60.some(x=>!dan75.includes(x))||
  three_digit.some(x=>!dan75.includes(x.slice(-2))||x[0]===String(rejectedHundred))||
  [...lotto3,...doubles].some(x=>excluded.has(x)))throw Error('INVALID_SELECTED_POOLS');
 return {region,station,predictionDate,sourceDate:d.draw_date,sourcePrizes:d.full_results.length,
  digitPositions:totalDigitPositions(region),sourceSHA256:sha([region,station,d.draw_date,d.full_results]),
  lotto3,doubles,dan50,dan60,dan75,three_digit,
  hardExcludedHead:String(rejectedHead),hardExcludedHundred:String(rejectedHundred),
  previousForecastsUsed:false,allPrizesUsed:true,allPositionsUsed:true,exclusionsValidated:true,
  method:'KQ247_ONE_LAST_DRAW_WITH_500_STATION_BACKTEST_SELECTED_METHODS',
  audit:{bridgeSourceDrawCount:1,bridgeSourceStation:station,coveredPositions:totalDigitPositions(region),
   excludedNumbers:[...excluded].sort(),methodsPerTask:total,
   calibrationSHA256:calibration.methodSelectionSHA256,historySHA256:calibration.historySHA256,
   backtest500:calibration.backtest}};
}
export function forecastOneDrawAnd500Backtest({history,region,station,predictionDate}){
 const calibration=calibrateStation500({history,region,station,predictionDate});
 const previousDraw=[...history].sort((a,b)=>b.draw_date.localeCompare(a.draw_date))[0];
 return predictFromLastDrawWithCalibration({previousDraw,history,calibration,predictionDate});
}
