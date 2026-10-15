import assert from 'node:assert/strict';
import {HARD_RULES,vietlottHeadAndLast3Gate,hardFilter,parseXsmb60,prepareFastFilter,fastFilterReason,makeFastFilter6} from './user-r34-engine.mjs';
assert.equal(HARD_RULES.length,34);
assert.equal(vietlottHeadAndLast3Gate([1,2,11,12,21,22]),'head012_max5');
assert.equal(vietlottHeadAndLast3Gate([11,12,21,22,31,32]),'head123_max5');
assert.equal(vietlottHeadAndLast3Gate([20,21,22,23,30,40]),'head234_max5');
assert.equal(vietlottHeadAndLast3Gate([1,2,3,36,37,38]),'top3_sum_max110');
assert.equal(vietlottHeadAndLast3Gate([3,7,14,20,35,55]),'ok');
assert.equal(vietlottHeadAndLast3Gate([1,2,11,12,21,35]),'ok');
const samples=[
 'XSMB Thứ 5 15/10/2026 Mã ĐB | 5 8 9 10 13 14 (HU) ĐB | 62066 G1 | 87176 G2 | 93642 37409 G3 | 28087 24887 58423 25269 33005 45004 G4 | 5904 5771 6928 7981 G5 | 0866 7772 6093 9746 0853 3967 G6 | 287 162 312 G7 | 96 27 58 91',
 'XSMB 15/10/2026 Giải Đặc Biệt | 62066 Giải Nhất | 87176 Giải Hai | 93642 37409 Giải Ba | 28087 24887 58423 25269 33005 45004 Giải Tư | 5904 5771 6928 7981 Giải Năm | 0866 7772 6093 9746 0853 3967 Giải Sáu | 287 162 312 Giải Bảy | 96 27 58 91'
];
const parsed=samples.map(s=>parseXsmb60(s)[0]);
for(const x of parsed){assert.equal(x.date,'2026-10-15');assert.equal(x.full.length,27);assert.equal(x.full[0],'62066');assert.equal(x.full.at(-1),'91')}
assert.deepEqual(parsed[0].full,parsed[1].full);
const xsmbRows=Array.from({length:205},(_,i)=>({date:new Date(Date.parse('2026-10-14T00:00:00Z')-i*86400000).toISOString().slice(0,10),full:[String(70000+i%50).padStart(5,'0')]}));
const report=[];
let seed=0x20261015;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
for(const maxn of [45,55]){
 const xset=new Set([1,2,5,8,9,11,14,16,18,20,23,25,28,31,33,35,38,40,43,45,47,50,52,55].filter(n=>n<=maxn));
 const ctx=prepareFastFilter([],maxn,'2026-10-15',xset,xsmbRows);
 const optimized=makeFastFilter6(ctx);
 let passed=0;
 for(let i=0;i<20000;i++){
  const pick=new Set();while(pick.size<6)pick.add(1+Math.floor(random()*maxn));
  const nums=[...pick].sort((a,b)=>a-b);
  const baseline=fastFilterReason(nums,ctx)==='ok';
  const speed=optimized(...nums);
  assert.equal(speed,baseline,'filter scalar/fast mismatch '+maxn+' '+nums.join(','));
  if(baseline){assert.equal(vietlottHeadAndLast3Gate(nums),'ok');passed++}
 }
 report.push({product:maxn===45?'mega645':'power655',compared:20000,fast_vs_scalar:'PASS',accepted:passed});
}
console.log('KQ247_VIETLOTT_R34_RULE_TEST='+JSON.stringify({rules:34,full27FormatParity:true,report}));
