// KQ247 XSMB daily DE / hundreds-digit consensus, staged independent model.
// 1000 different time-local parameter sets EACH for DE selection, rejected head,
// and rejected hundreds digit. No prior predictions or historical exclusions used.
// This is a NEW auditable implementation, not a recovered original 1000-method checkpoint.
const pad=n=>String(n).padStart(2,'0');
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const hash=(s)=>{let h=2166136261>>>0;for(const ch of s){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;};
function rand(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function normalizeFeatures(matrix){
 const counts=matrix[0]?.length||0;
 for(let col=0;col<counts;col++){
  let max=0;for(const row of matrix)max=Math.max(max,row[col]);
  if(max)for(const row of matrix)row[col]/=max;
 }
 return matrix;
}
function buildPairFeatures(draws,day){
 const matrix=Array.from({length:100},()=>Array(15).fill(0));
 const recent=draws[0].special.slice(-2), recentH=+recent[0],recentT=+recent[1];
 const recentHundred=+draws[0].special.at(-3);
 const currentDay=new Date(day+'T12:00:00Z').getUTCDay();
 for(let i=0;i<draws.length;i++){
  const s=draws[i].special,p=s.slice(-2),k=+p, previous=draws[i+1]?.special;
  const rec=1/Math.sqrt(i+1);
  const v=matrix[k];
  v[0]++;v[1]+=i<7?1:0;v[2]+=i<14?1:0;v[3]+=i<30?1:0;
  v[4]+=i<60?1:0;v[5]+=i<120?1:0;v[6]+=rec;
  if(new Date(draws[i].draw_date+'T12:00:00Z').getUTCDay()===currentDay)v[7]++;
  if(previous){
   const ph=+previous.at(-2),pt=+previous.at(-1);
   if(ph===recentH)v[8]+=rec;
   if(pt===recentT)v[9]+=rec;
   if((ph+pt)%10===(recentH+recentT)%10)v[10]+=rec;
   if((ph-pt+10)%10===(recentH-recentT+10)%10)v[11]+=rec;
   if(+previous.at(-3)===recentHundred)v[12]+=rec;
   if(previous.slice(-2)===recent)v[13]+=rec;
  }
  if((+s.at(-2)+ +s.at(-1))%10===(recentH+recentT)%10)v[14]+=rec;
 }
 return normalizeFeatures(matrix);
}
function hundredsFeatures(draws,day){
 const a=Array.from({length:10},()=>Array(10).fill(0));
 const last=draws[0].special,base=+last.at(-3),lastTail=+last.at(-1);
 const dow=new Date(day+'T12:00:00Z').getUTCDay();
 for(let i=0;i<draws.length;i++){
  const s=draws[i].special,h=+s.at(-3),v=a[h],before=draws[i+1]?.special;
  const rec=1/Math.sqrt(i+1);
  v[0]++;v[1]+=i<7?1:0;v[2]+=i<14?1:0;v[3]+=i<30?1:0;
  v[4]+=i<60?1:0;v[5]+=i<120?1:0;v[6]+=rec;
  if(new Date(draws[i].draw_date+'T12:00:00Z').getUTCDay()===dow)v[7]++;
  if(before && +before.at(-3)===base)v[8]+=rec;
  if(before && +before.at(-1)===lastTail)v[9]+=rec;
 }
 return normalizeFeatures(a);
}
function weightedChoice(matrix,seed,least=false){
 const next=rand(seed),cols=matrix[0].length;
 const weights=Array.from({length:cols},(_,k)=>.06+next()*2.4+(k%4===0?.25:0));
 let best=least?Infinity:-Infinity,chosen=-1;
 for(let n=0;n<matrix.length;n++){
  let v=0;for(let k=0;k<cols;k++)v+=matrix[n][k]*weights[k];
  v/=weights.reduce((a,b)=>a+b,0);
  // Method-specific tie break makes deterministic independent rule indices.
  const tie=(next()-.5)*.015;
  v+=tie;
  if(chosen<0||(least?v<best:v>best)){best=v;chosen=n;}
 }
 return chosen;
}
const uniqueSorted=(arr,size,re)=>{const a=[...new Set(arr)].sort();if(a.length!==size||a.some(n=>!re.test(n)))throw Error('invalid_pool_'+size);return a;};
export function calculateDeDaily({predictionDate,draws}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(predictionDate)||!Array.isArray(draws)||draws.length!==500)throw Error('DE_NEEDS_500_REAL_DRAWS');
 const rows=[...draws].sort((a,b)=>b.draw_date.localeCompare(a.draw_date));
 for(let i=0;i<500;i++){
  const d=rows[i];
  if(d.draw_date>=predictionDate||i&&d.draw_date===rows[i-1].draw_date
    || !/^\d{5}$/.test(d.special||''))throw Error('BAD_DE_HISTORY_'+i);
 }
 const expected=new Date(Date.parse(predictionDate+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 if(rows[0].draw_date!==expected)throw Error('DE_REQUIRES_YESTERDAY_RESULT');
 const pairs=buildPairFeatures(rows,predictionDate);
 const hundreds=hundredsFeatures(rows,predictionDate);
 const votes=Array(100).fill(0),headExclusion=Array(10).fill(0),hundredExclusion=Array(10).fill(0);
 const headFeature=Array.from({length:10},(_,head)=>{
  const vec=Array(15).fill(0);
  for(let t=0;t<10;t++)for(let k=0;k<15;k++)vec[k]+=pairs[head*10+t][k]/10;
  return vec;
 });
 const base=hash(predictionDate+'|XSMB|DE1000|'+rows[0].special+'|'+rows[1].special);
 for(let i=0;i<1000;i++){
  const seed=(base^Math.imul(i+1,2654435761))>>>0;
  const winner=weightedChoice(pairs,(seed^0x9e3779b9)>>>0,false);
  votes[winner]++;
  headExclusion[weightedChoice(headFeature,(seed^0x6a09e667)>>>0,true)]++;
  hundredExclusion[weightedChoice(hundreds,(seed^0x3c6ef372)>>>0,true)]++;
 }
 // Aggregate 1000 independent hard-removal votes per day; never reuse yesterday's head/hundred.
 const rankedDigits=a=>[...a.keys()].sort((x,y)=>a[y]-a[x]||x-y);
 const rejectHead=rankedDigits(headExclusion)[0];
 const rejectHundred=rankedDigits(hundredExclusion)[0];
 const rank=[...Array(100).keys()].filter(n=>Math.floor(n/10)!==rejectHead)
  .sort((a,b)=>votes[b]-votes[a]||
   pairs[b].reduce((x,y)=>x+y,0)-pairs[a].reduce((x,y)=>x+y,0)||
   a-b);
 const dan75=uniqueSorted(rank.slice(0,75).map(pad),75,/^\d{2}$/);
 const dan60=uniqueSorted(rank.slice(0,60).map(pad),60,/^\d{2}$/);
 const dan50=uniqueSorted(rank.slice(0,50).map(pad),50,/^\d{2}$/);
 if([...dan50].some(n=>!dan60.includes(n))||dan60.some(n=>!dan75.includes(n)))throw Error('NON_NESTED_DE');
 const three=[];
 for(let h=0;h<10;h++){
  if(h===rejectHundred)continue;
  for(const n of dan75){
   const special3=String(h)+n;
   let historyScore=0;
   for(let i=0;i<500;i++)if(rows[i].special.slice(-3)===special3)historyScore+=3/Math.sqrt(i+1);
   const score=(1000-hundredExclusion[h])*.0002+votes[+n]*.8+historyScore+hundreds[h].reduce((a,b)=>a+b,0);
   three.push({number:special3,score});
  }
 }
 three.sort((a,b)=>b.score-a.score||a.number.localeCompare(b.number));
 const three_digit=uniqueSorted(three.slice(0,500).map(x=>x.number),500,/^\d{3}$/);
 if(three_digit.some(s=>s[0]===String(rejectHundred)||!dan75.includes(s.slice(-2))))throw Error('THREE_DIGIT_NOT_SUBSET');
 return {
  dan50,dan60,dan75,three_digit,three_digit_count:500,
  hard_excluded_head:String(rejectHead),three_digit_hard_excluded_hundred:String(rejectHundred),
  three_digit_source_dan75:dan75,method_counts:{de_single_pick:1000,remove_head:1000,remove_hundred:1000},
  model:'KQ247_DE_DAILY_1000x3_INDEPENDENT_PARAMETER_CONSENSUS_V1',
  predictionDate,sourceDate:rows[0].draw_date,previousForecastsUsed:false,
  audit:{topDEVotes:rank.slice(0,10).map(n=>({number:pad(n),votes:votes[n]})),rejectHeadVotes:headExclusion,rejectHundredVotes:hundredExclusion}
 };
}
