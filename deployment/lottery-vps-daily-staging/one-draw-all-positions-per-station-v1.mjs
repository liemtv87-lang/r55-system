// KQ247 ONE-DRAW ALL-DIGIT-POSITIONS engine for XSMB/XSMT/XSMN.
 // Every station is a separate input. No other station, old predictions or 500-draw backtests.
 // Heuristic positional bridges, NOT validated statistical forecasting performance.
import {createHash} from 'node:crypto';
const pad=n=>String(n).padStart(2,'0');
const nextDay=(day,step)=>new Date(Date.parse(day+'T12:00:00Z')+step*86400000).toISOString().slice(0,10);
const modeN={mb:27,mt:18,mn:18};
const fixedLengths={mb:[5,5,5,5,5,5,5,5,5,5,5,4,4,4,4,4,4,4,3,3,3,2,2,2,2,2,2]};
function validateDraw(draw){
 if(!draw||typeof draw!=='object')throw Error('MISSING_STATION_DRAW');
 const {region,station,draw_date,full_results,all2}=draw;
 if(!Object.hasOwn(modeN,region)||typeof station!=='string'||!station.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(draw_date))throw Error('INVALID_REGION_STATION_OR_DATE');
 if(!Array.isArray(full_results)||full_results.length!==modeN[region]||
  !Array.isArray(all2)||all2.length!==modeN[region])throw Error('NOT_ALL_PRIZES_PRESENT');
 for(let p=0;p<full_results.length;p++){
  const n=full_results[p];
  if(typeof n!=='string'||!/^\d{2,6}$/.test(n)||n.slice(-2)!==all2[p])throw Error('BAD_PRIZE_DIGITS_POSITION_'+p);
 }
 if(draw.special && typeof draw.special==='string' && !full_results.includes(draw.special))throw Error('SPECIAL_NOT_PRESENT');
 if(region==='mb'&&!full_results.some(x=>x.length===5))throw Error('MB_DB_MISSING');
 if(region!=='mb'&&!full_results.some(x=>x.length===6))throw Error('MTMN_DB_MISSING');
 if(Object.hasOwn(draw,'forecast')||Object.hasOwn(draw,'prediction')||Object.hasOwn(draw,'lotto3'))throw Error('FORECAST_AS_INPUT_BLOCKED');
 const pos=[];
 full_results.forEach((str,prize)=>{for(let j=0;j<str.length;j++)pos.push({d:Number(str[j]),prize,offset:j})});
 const ids=new Set(pos.map(({prize,offset})=>prize+':'+offset));
 if(ids.size!==pos.length)throw Error('POSITION_DUPLICATE');
 return pos;
}
function nextDrawDate(draw,weeklySchedule){
 if(draw.region==='mb')return nextDay(draw.draw_date,1);
 const key=draw.region+'|'+draw.station;
 const weekdays=weeklySchedule?.[key];
 if(!Array.isArray(weekdays)||!weekdays.length||weekdays.some(n=>!Number.isInteger(n)||n<0||n>6))throw Error('MISSING_VALID_WEEKLY_SCHEDULE_'+key);
 const current=new Date(draw.draw_date+'T12:00:00Z').getUTCDay();
 for(let delta=1;delta<=7;delta++)if(weekdays.includes((current+delta)%7))return nextDay(draw.draw_date,delta);
 throw Error('NO_NEXT_STATION_DRAW_DATE');
}
export function predictStationFromOneDraw(draw,{weeklySchedule}={}){
 const pos=validateDraw(draw),m=pos.length,nPrizes=draw.full_results.length;
 const voto=new Float64Array(100),de=new Float64Array(100),headReject=new Float64Array(10),hundReject=new Float64Array(10),three=new Float64Array(1000),kep=new Float64Array(10);
 const coverage=new Uint32Array(m),families={pairCrossPrize:0,pairWithinPrize:0,triangleCrossPrize:0,triangleOnePrize:0};
 let pairMethods=0,tripleMethods=0;
 // 2-digit positional bridge families: 5 structurally distinct operations.
 // All physical digits, including every leading zero, participate.
 for(let i=0;i<m;i++){const a=pos[i];for(let j=0;j<m;j++){if(i===j)continue;
  const b=pos[j],pair=a.d*10+b.d,reverse=b.d*10+a.d,sum=(a.d+b.d)%10,diff=(a.d+10-b.d)%10,prod=a.d*b.d%10;
  const split=a.prize!==b.prize;
  coverage[i]++;coverage[j]++;
  families[split?'pairCrossPrize':'pairWithinPrize']++;
  voto[pair]+=split?5:3;
  voto[reverse]+=split?2:3;
  voto[sum*10+b.d]+=2;
  voto[a.d*10+diff]+=1;
  voto[prod*10+a.d]+=1;
  de[pair]+=(split?4:2)+((a.offset===b.offset)?2:0);
  de[a.d*10+sum]+=3;
  de[diff*10+b.d]+=2;
  de[(9-a.d)*10+(9-b.d)]+=1;
  headReject[(a.d+2*b.d+Math.abs(a.offset-b.offset))%10]+=split?1:2;
  kep[a.d]+=a.d===b.d?(split?4:3):0.03;
  pairMethods+=9;
 }}
 // All ordered distinct triples. Each triple supplies several different 3-digit bridges.
 // Aggregate counts only; never materialize millions of combinations in memory.
 for(let i=0;i<m;i++){const a=pos[i];for(let j=0;j<m;j++){if(j===i)continue;
  const b=pos[j];
  for(let k=0;k<m;k++){if(k===i||k===j)continue;
   const c=pos[k],d1=a.d,d2=b.d,d3=c.d;
   const cross=new Set([a.prize,b.prize,c.prize]).size>1,weight=cross?2:1;
   families[cross?'triangleCrossPrize':'triangleOnePrize']++;
   const triple=d1*100+d2*10+d3;
   three[triple]+=3*weight;
   three[d2*100+d3*10+d1]+=weight;
   three[d1*100+((d2+d3)%10)*10+d3]+=weight;
   three[((d1+d2)%10)*100+d2*10+d3]+=weight;
   de[d2*10+d3]+=(cross?1:.5);
   voto[d1*10+d3]+=(cross?1:.5);
   hundReject[(d1+2*d2+3*d3+a.offset+c.offset)%10]+=weight;
   coverage[i]++;coverage[j]++;coverage[k]++;
   tripleMethods+=4;
  }
 }}
 if(coverage.some(x=>x===0)||tripleMethods<1_000_000||pairMethods===0)throw Error('ALL_DIGIT_BRIDGES_NOT_COVERED');
 const ranked=(arr,size,mask=()=>true,minimum=false)=>[...arr.keys()].filter(mask).sort((a,b)=>(minimum?arr[a]-arr[b]:arr[b]-arr[a])||a-b).slice(0,size);
 // Exclusion uses separate positional transformations, not yesterday's rejection sets.
 const excludeHead=ranked(headReject,1,()=>true,true)[0];
 const excludeHund=ranked(hundReject,1,()=>true,true)[0];
 const candidates=n=>Math.floor(n/10)!==excludeHead;
 const deRank=ranked(de,75,candidates);
 if(deRank.length!==75)throw Error('NOT_75_AFTER_HEAD_EXCLUSION');
 const dan50=deRank.slice(0,50).map(pad).sort(),dan60=deRank.slice(0,60).map(pad).sort(),dan75=deRank.map(pad).sort();
 const picks=ranked(voto,3,()=>true).map(pad).sort();
 const doubles=[...Array(10).keys()].sort((a,b)=>kep[b]-kep[a]||a-b).slice(0,2).map(n=>String(n)+String(n)).sort();
 const dan75set=new Set(dan75);
 const triples=ranked(three,500,n=>Math.floor(n/100)!==excludeHund&&dan75set.has(pad(n%100))).map(n=>String(n).padStart(3,'0')).sort();
 if(picks.length!==3||doubles.length!==2||triples.length!==500||new Set(triples).size!==500||triples.some(s=>!dan75set.has(s.slice(-2))))throw Error('INCOMPLETE_POOLS');
 const sourceHash=createHash('sha256').update(JSON.stringify([draw.region,draw.station,draw.draw_date,draw.full_results])).digest('hex');
 return {region:draw.region,station:draw.station,sourceDate:draw.draw_date,
  // MB draws daily; MT/MN individual stations run weekly.
  predictionDate:nextDrawDate(draw,weeklySchedule),
  lotto3:picks,doubles,de:{
    dan50,dan60,dan75,three_digit:triples,hard_excluded_head:String(excludeHead),
    three_digit_hard_excluded_hundred:String(excludeHund)
  },sourceDraws:1,previousForecastsUsed:false,otherStationDataUsed:false,backtest500Used:false,
  model:'KQ247_ONE_DRAW_ALL_POSITIONS_STATION_ISOLATED_V1',
  sourceInputHash:sourceHash,
  coverage:{sourcePrizes:nPrizes,digitPositions:m,coveredPositions:m,sourceDraws:1,pairMethods,tripleMethods,
   totalBridgeEvaluations:pairMethods+tripleMethods,families,
   generation:'single_station_previous_actual_only',headRemoval:'independent_pair_transform',
   hundredRemoval:'independent_three_digit_transform'}
 };
}
