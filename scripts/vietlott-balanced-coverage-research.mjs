// RESEARCH ONLY — do not replace locked pools until genuine held-out results are verified.
// Alternative to score-top oversampling: select a representative, date-seeded
// sample of eligible tickets, then apply the SAME five-subset novelty passes.
// Targets and caps remain exact, this cannot guarantee lottery winnings.
export function reduceBalancedCoveragePool(keys,numberScore,targetCount,{oversampleFactor=2.25,salt=''}={}){
  if(!Array.isArray(keys))throw Error('filtered ticket array required');
  const target=Math.floor(Number(targetCount));
  if(!Number.isSafeInteger(target)||target<1||keys.length<target)throw Error('invalid/undersized portfolio');
  if(!Number.isFinite(oversampleFactor)||oversampleFactor<1||oversampleFactor>4)throw Error('unsafe sampling ratio');
  if(target!==200000&&target!==600000)throw Error('only approved Mega 200k or Power 600k final portfolios');
  const hardMax=target===200000?220000:650000;
  if(target>hardMax)throw Error('hard cap exceeded');
  const limit=Math.min(keys.length,Math.ceil(target*oversampleFactor));
  let seed=2166136261;
  for(const c of String(salt)){seed^=c.charCodeAt(0);seed=Math.imul(seed,16777619)>>>0}
  const hash32=(key)=>{
    const low=key>>>0,high=Math.floor(key/4294967296)>>>0;
    let x=(low^Math.imul(high,0x85ebca6b)^seed)>>>0;
    x^=x>>>16;x=Math.imul(x,0x7feb352d)>>>0;
    x^=x>>>15;x=Math.imul(x,0x846ca68b)>>>0;
    x^=x>>>16;return x>>>0;
  };
  const worse=(a,b)=>a.hash>b.hash||(a.hash===b.hash&&a.key>b.key);
  const heap=[];
  const push=item=>{
    heap.push(item);let i=heap.length-1;
    while(i){const p=(i-1)>>1;if(!worse(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p}
  };
  const down=()=>{
    let i=0;for(;;){
      const l=i*2+1;if(l>=heap.length)break;
      const r=l+1,j=r<heap.length&&worse(heap[r],heap[l])?r:l;
      if(!worse(heap[j],heap[i]))break;
      [heap[j],heap[i]]=[heap[i],heap[j]];i=j;
    }
  };
  const seen=new Set();
  for(const key of keys){
    if(!Number.isSafeInteger(key)||key<0)throw Error('invalid base64x6 key');
    if(seen.has(key))continue;seen.add(key);
    const item={key,hash:hash32(key)};
    if(heap.length<limit)push(item);
    else if(worse(heap[0],item)){heap[0]=item;down()}
  }
  if(heap.length<target)throw Error('too few unique source tickets');
  const decode=key=>{
    const v=Array(6);for(let i=5;i>=0;i--){v[i]=key%64;key=Math.floor(key/64)}return v
  };
  const score=key=>decode(key).reduce((sum,n)=>sum+Number(numberScore?.[n]??0),0);
  const ranked=heap.map(x=>({key:x.key,score:score(x.key)})).sort((a,b)=>b.score-a.score||a.key-b.key);
  const marked=new Uint8Array(ranked.length),covered=new Set(),out=[];
  const fiveKeys=key=>{
    const n=decode(key),sub=new Array(6);
    for(let omit=0;omit<6;omit++){let x=0;for(let i=0;i<6;i++)if(i!==omit)x=x*64+n[i];sub[omit]=x}
    return sub;
  };
  for(let novelty=6;novelty>=0&&out.length<target;novelty--){
    for(let i=0;i<ranked.length&&out.length<target;i++){
      if(marked[i])continue;
      const sub=fiveKeys(ranked[i].key);
      let newSets=0;for(const x of sub)if(!covered.has(x))newSets++;
      if(newSets<novelty)continue;
      marked[i]=1;out.push(ranked[i].key);
      for(const x of sub)covered.add(x);
    }
  }
  if(out.length!==target||new Set(out).size!==target)throw Error('final number of unique tickets incorrect');
  out.sort((a,b)=>a-b);
  return {keys:out,unique_five_subsets:covered.size,source_total:keys.length,scored_candidates:ranked.length,
    selection:'seeded_uniform_candidate_sample_plus_5subset_coverage',seed_basis:'predraw_date_only'};
}
