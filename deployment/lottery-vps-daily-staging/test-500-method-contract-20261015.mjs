// Offline contract tests. All 500 fixtures below are SYNTHETIC; never publish predictions from them.
import assert from 'node:assert/strict';
import {calibrateStation500,predictFromLastDrawWithCalibration} from './one-draw-500-method-selector.mjs';
const lenMB=[...Array(10).fill(5),...Array(10).fill(4),...Array(3).fill(3),...Array(4).fill(2)];
const lenRegion=[2,3,...Array(4).fill(4),...Array(11).fill(5),6];
const pastDay=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')-n*86400000).toISOString().slice(0,10);
function digits(seed,n){
 let x=(seed*2654435761+2246822519)>>>0,s='';
 for(let i=0;i<n;i++){x^=x<<13;x^=x>>>17;x^=x<<5;s+=String((x>>>0)%10);}
 return s;
}
function makeFixture(region,station){
 const lens=region==='mb'?lenMB:lenRegion;
 return Array.from({length:500},(_,n)=>{
  const full_results=lens.map((len,j)=>digits((500-n)*991+j*1783+(region==='mb'?11:region==='mt'?17:23),len));
  return {region,station,draw_date:pastDay('2026-10-14',n),full_results,
    all2:full_results.map(s=>s.slice(-2)),special:region==='mb'?full_results[0]:full_results[17]};
 });
}
function audit(region,station){
 const history=makeFixture(region,station),predictionDate='2026-10-15';
 const calibration=calibrateStation500({history,region,station,predictionDate});
 assert.equal(calibration.backtest.realCompleteDraws,500);
 assert.equal(calibration.backtest.trainTransitions,349);
 assert.equal(calibration.backtest.heldoutTransitions,150);
 const previousDraw=history[0];
 const x=predictFromLastDrawWithCalibration({previousDraw,history,calibration,predictionDate});
 assert.equal(x.method,'KQ247_ONE_LAST_DRAW_WITH_500_STATION_BACKTEST_SELECTED_METHODS');
 assert.equal(x.audit.bridgeSourceDrawCount,1);
 assert.equal(x.audit.bridgeSourceStation,station);
 assert.equal(x.audit.backtest500.historyUsedForDailyVotes,false);
 assert.equal(x.digitPositions,region==='mb'?107:82);
 for(const [key,n] of [['lotto3',3],['doubles',2],['dan50',50],['dan60',60],['dan75',75],['three_digit',500]]){
  assert.equal(x[key].length,n,key);
  assert.equal(new Set(x[key]).size,n,key);
 }
 assert(x.dan50.every(s=>x.dan60.includes(s)));
 assert(x.dan60.every(s=>x.dan75.includes(s)));
 assert(x.three_digit.every(s=>x.dan75.includes(s.slice(-2))));
 assert(x.lotto3.concat(x.doubles).every(s=>!x.audit.excludedNumbers.includes(s)));
 const tampered={...previousDraw,full_results:[...previousDraw.full_results]};
 tampered.full_results[1]=(tampered.full_results[1][0]==='9'?'0':'9')+tampered.full_results[1].slice(1);
 assert.throws(()=>predictFromLastDrawWithCalibration({previousDraw:tampered,history,calibration,predictionDate}),/PREVIOUS_DRAW_NOT_EQUAL/);
 const mixed=[...history];mixed[400]={...mixed[400],station:'NOT_'+station};
 assert.throws(()=>calibrateStation500({history:mixed,region,station,predictionDate}),/CROSS_STATION/);
 assert.throws(()=>calibrateStation500({history:history.slice(0,499),region,station,predictionDate}),/REQUIRE_500/);
 console.log('SYNTHETIC_METHOD_CONTRACT_PASS',region,station,
   'sourcePrizes',previousDraw.full_results.length,'digitPositions',x.digitPositions,
   'historyForMethodSelection',500,'todayVoteSourceDraws',1,'heldout',calibration.backtest.heldoutTransitions);
}
audit('mb','XSMB');
audit('mt','Bình Định');
audit('mn','An Giang');
console.log('OFFLINE_CONTRACTS_ONLY_NOT_REAL_WORLD_HIT_RATE');
