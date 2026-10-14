// Shared full-prize canonical layout across 3 Vietnamese lottery regions.
// Preserves leading zeros and every digit from each station's OWN previous draw.
const mbLen=[...Array(10).fill(5),...Array(10).fill(4),...Array(3).fill(3),...Array(4).fill(2)];
const southLen=[2,3,...Array(4).fill(4),...Array(11).fill(5),6];
const fromDbFirst=[1,1,1,2,7,1,3,1,1]; // DB,G1,G2,G3,G4,G5,G6,G7,G8
function reverseGroups(vals,groupSizes){
 let k=0;const groups=groupSizes.map(count=>{let x=vals.slice(k,k+count);k+=count;return x;});
 if(k!==vals.length)throw Error('BAD_GROUP_LAYOUT');
 return groups.reverse().flat();
}
export function canonicalizePrizes(region,raw){
 const expected=region==='mb'?27:(region==='mt'||region==='mn'?18:0);
 if(!expected||!Array.isArray(raw)||raw.length!==expected)throw Error('INCOMPLETE_STATION_PRIZES_'+region);
 const v=raw.map(x=>{if(typeof x!=='string'||!/^\d{2,6}$/.test(x))throw Error('INVALID_PRIZE_DIGITS');return x});
 if(region==='mb'){
  if(v.some((s,i)=>s.length!==mbLen[i]))throw Error('BAD_MB_PRIZE_POSITIONS');
  return v;
 }
 const ordered=v[0].length===2&&v[17].length===6?v:
   v[0].length===6&&v[17].length===2?reverseGroups(v,fromDbFirst):null;
 if(!ordered||ordered.some((s,i)=>s.length!==southLen[i]))throw Error('BAD_MT_MN_PRIZE_POSITIONS');
 return ordered;
}
export function normalizedStationDraw(row){
 if(!['mb','mt','mn'].includes(row.region)||typeof row.station!=='string'||!row.station.trim()||!row.draw_date)throw Error('BAD_STATION_OR_DAY');
 const original=row.full_results;
 const prizes=canonicalizePrizes(row.region,original);
 if(row.all2 && (!Array.isArray(row.all2)||row.all2.length!==original.length||original.some((x,i)=>x.slice(-2)!==row.all2[i])))
  throw Error('RAW_TWO_DIGIT_INCONSISTENCY');
 const special=row.region==='mb'?prizes[0]:prizes[17];
 if(row.special&&row.special!==special)throw Error('SPECIAL_DOES_NOT_MATCH');
 return {...row,full_results:prizes,all2:prizes.map(x=>x.slice(-2)),special};
}
export function totalDigitPositions(region){return region==='mb'?107:(region==='mt'||region==='mn'?82:0)}
