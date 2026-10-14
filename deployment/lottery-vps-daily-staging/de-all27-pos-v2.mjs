// KQ247 stage v2: full 27 XSMB prizes, every available digit position.
// 20 structurally different positional bridge encoders x 10 lookbacks x 5 similarity
// tests = 1000 deterministic rule definitions for each of 3 separate tasks.
// IMPORTANT: this is a NEW implementation, not a verified historical 1000-method archive.
const windows=[30,45,60,80,110,150,210,280,380,499];
const prev=d=>new Date(Date.parse(d+'T12:00:00Z')-86400000).toISOString().slice(0,10);
const pad=x=>String(x).padStart(2,'0');
function encode(prizes){
 if(!Array.isArray(prizes)||prizes.length!==27||prizes.some(s=>typeof s!=='string'||!/^\d{2,6}$/.test(s)))throw Error('BAD_ALL27');
 const stream=[];prizes.forEach((s,p)=>[...s].forEach((digit,j)=>stream.push({a:+digit,p,j})));
 const z=stream.length;
 return Array.from({length:20},(_,family)=>{
  const pair=new Float64Array(100),hundred=new Float64Array(10),stride=1+family%13;
  for(let t=0;t<z;t++){
   const A=stream[t],B=stream[(t+stride)%z],C=stream[(t+2*stride+family)%z];
   let a=A.a,b=B.a,c=C.a,x,y,h;
   switch(family){
    case 0:[x,y,h]=[a,b,c];break;
    case 1:[x,y,h]=[b,a,c];break;
    case 2:[x,y,h]=[(a+b)%10,c,a];break;
    case 3:[x,y,h]=[a,Math.abs(b-c),b];break;
    case 4:[x,y,h]=[(a*b)%10,b,(a+c)%10];break;
    case 5:[x,y,h]=[(a+A.j)%10,(b+c)%10,c];break;
    case 6:[x,y,h]=[(a+A.p)%10,b,c];break;
    case 7:[x,y,h]=[a,(b+A.j)%10,(c+A.p)%10];break;
    case 8:[x,y,h]=[9-a,b,9-c];break;
    case 9:[x,y,h]=[(a+10-b)%10,b,(a+c)%10];break;
    case 10:[x,y,h]=[a,(2*b+c)%10,c];break;
    case 11:[x,y,h]=[(a^b)%10,b,(b^c)%10];break;
    case 12:[x,y,h]=[(a+c)%10,(b+c)%10,a];break;
    case 13:[x,y,h]=[(a+2*b)%10,(b+2*c)%10,a];break;
    case 14:[x,y,h]=[(a+c+A.p)%10,(b+A.j)%10,c];break;
    case 15:[x,y,h]=[(a*b+c)%10,(a+c)%10,b];break;
    case 16:[x,y,h]=[a,(a+b+c)%10,(a+b)%10];break;
    case 17:[x,y,h]=[(a+9-c)%10,(b+9-a)%10,c];break;
    case 18:[x,y,h]=[(a+A.p+A.j)%10,(b+c+A.j)%10,(a+b+c)%10];break;
    default:[x,y,h]=[(a*c)%10,(b*c+A.j)%10,(a+b+c+A.p)%10];
   }
   const w=1/(1+Math.floor(A.p/9)*.15);
   pair[x*10+y]+=w;hundred[h]+=w;
  }
  const sum=pair.reduce((a,b)=>a+b,0);
  for(let i=0;i<100;i++)pair[i]/=sum;
  for(let i=0;i<10;i++)hundred[i]/=sum;
  return {pair,hundred};
 });
}
function similarity(left,right,metric,hund=false){
 const a=hund?left.hundred:left.pair,b=hund?right.hundred:right.pair;
 let dot=0,aa=0,bb=0,overlap=0,dist=0,strong=0,n=0;
 const max=Math.max(...a);
 for(let i=0;i<a.length;i++){
  dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];
  overlap+=Math.min(a[i],b[i]);dist+=Math.abs(a[i]-b[i]);
  if(a[i]>=max*.75){strong+=b[i];n++;}
 }
 const cosine=dot/(Math.sqrt(aa*bb)+1e-12);
 return Math.max(.005,[cosine,overlap,Math.exp(-dist*5),n?strong*a.length/n:0,
   .5*cosine+.3*overlap+.2*Math.exp(-dist*7)][metric]);
}
export function predictDe27Daily({predictionDate,draws}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(predictionDate)||!Array.isArray(draws)||draws.length!==500)throw Error('500_DRAWS_REQUIRED');
 const hist=[...draws].sort((a,b)=>b.draw_date.localeCompare(a.draw_date));
 if(hist[0].draw_date!==prev(predictionDate))throw Error('MUST_USE_YESTERDAYS_ACTUAL');
 for(let i=0;i<hist.length;i++){
  const d=hist[i];
  if(d.draw_date>=predictionDate||i&&d.draw_date===hist[i-1].draw_date||!Array.isArray(d.all2)||d.all2.length!==27||!Array.isArray(d.full_results)||d.full_results.length!==27||d.full_results[0]!==d.special||!d.full_results.every((v,j)=>v.slice(-2)===d.all2[j]))throw Error('INVALID_FULL_PRIZE_HISTORY_'+i);
 }
 const features=hist.map(r=>encode(r.full_results));
 const votesDE=new Array(100).fill(0),votesHead=new Array(10).fill(0),votesHund=new Array(10).fill(0);
 const scoresDE=new Float64Array(100),scoresHead=new Float64Array(10),scoresHund=new Float64Array(10);
 for(let method=0;method<1000;method++){
  const family=Math.floor(method/50),windowIndex=Math.floor((method%50)/5),metric=method%5;
  const tasks=[
   {type:'de',family,window:windows[windowIndex],metric},
   {type:'head',family:(family*7+3)%20,window:windows[(windowIndex*3+2)%10],metric:(metric+2)%5},
   {type:'hund',family:(family*11+7)%20,window:windows[(windowIndex*7+1)%10],metric:(metric+3)%5}
  ];
  for(const task of tasks){
   const labels=new Float64Array(task.type==='de'?100:10);
   for(let lag=1;lag<=task.window;lag++){
    const ref=hist[lag-1].special;
    const pick=task.type==='de'?+ref.slice(-2):task.type==='head'?+ref.at(-2):+ref.at(-3);
    const weight=similarity(features[0][task.family],features[lag][task.family],task.metric,task.type==='hund')/(1+lag/(task.window*.7));
    labels[pick]+=weight;
   }
   let best=0;
   for(let i=1;i<labels.length;i++)if(task.type==='de'?labels[i]>labels[best]+1e-12:labels[i]<labels[best]-1e-12)best=i;
   const votes=task.type==='de'?votesDE:task.type==='head'?votesHead:votesHund;
   const totals=task.type==='de'?scoresDE:task.type==='head'?scoresHead:scoresHund;
   votes[best]++;
   for(let i=0;i<labels.length;i++)totals[i]+=labels[i];
  }
 }
 const maxVote=(votes,scores)=>[...votes.keys()].sort((a,b)=>votes[b]-votes[a]||scores[a]-scores[b]||a-b)[0];
 const excludeHead=maxVote(votesHead,scoresHead),excludeHund=maxVote(votesHund,scoresHund);
 const ranked=[...Array(100).keys()].filter(i=>Math.floor(i/10)!==excludeHead)
  .sort((a,b)=>votesDE[b]-votesDE[a]||scoresDE[b]-scoresDE[a]||a-b);
 const dan50=ranked.slice(0,50).map(pad).sort(),dan60=ranked.slice(0,60).map(pad).sort(),dan75=ranked.slice(0,75).map(pad).sort();
 const ranks=new Map(ranked.map((v,i)=>[v,i]));
 const triples=[];
 for(let h=0;h<10;h++)if(h!==excludeHund)for(const n of dan75){
  const v=+n;
  triples.push({number:String(h)+n,score:votesDE[v]*6+scoresDE[v]*.15-ranks.get(v)*.04-votesHund[h]*.4+scoresHund[h]*.003});
 }
 triples.sort((a,b)=>b.score-a.score||a.number.localeCompare(b.number));
 const three_digit=triples.slice(0,500).map(v=>v.number).sort();
 if(votesDE.reduce((a,b)=>a+b,0)!==1000||votesHead.reduce((a,b)=>a+b,0)!==1000||votesHund.reduce((a,b)=>a+b,0)!==1000||dan75.length!==75||three_digit.length!==500||new Set(three_digit).size!==500||dan50.some(x=>!dan60.includes(x))||dan60.some(x=>!dan75.includes(x))||three_digit.some(x=>x[0]===String(excludeHund)||!dan75.includes(x.slice(-2))))throw Error('POOL_OR_METHOD_FAILED');
 return {predictionDate,sourceDate:hist[0].draw_date,sourceDraws:500,fullPrizesPerDay:27,
  model:'KQ247_27_PRIZES_ALL_POS_1000x3_RULES_V2',previousForecastsUsed:false,
  dan50,dan60,dan75,three_digit,three_digit_count:500,
  hard_excluded_head:String(excludeHead),three_digit_hard_excluded_hundred:String(excludeHund),
  three_digit_source_dan75:dan75,
  method_counts:{de_single_pick:1000,remove_head:1000,remove_hundred:1000},
  method_design:{structuralBridgeFamilies:20,historyWindows:10,similarityTests:5,
   all27PrizesUsed:true,allDigitPositionsUsed:true,sourceOnlyActualResults:true},
  audit:{votesDE,votesHead,votesHund}
 };
}