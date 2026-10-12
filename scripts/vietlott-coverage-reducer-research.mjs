// Deterministic ticket-pool reduction. No claim to predict a fair lottery.
// Keeps exactly min(target, filtered.length) distinct VALID tickets and attempts
// to spread five-number subsets to improve the chance of at least one 5-match
// outcome compared with a tightly clustered score-only selection.
export function reduceCoveragePool(keys, scoreMap, targetCount, {oversampleFactor=1.5}={}){
  if(!Array.isArray(keys))throw Error('locked filtered pool must contain keys');
  const target=Math.min(keys.length,Math.max(0,Math.floor(targetCount)));
  if(!target)return {keys:[],unique_five_subsets:0,source_total:keys.length,scored_candidates:0};
  const decode=key=>{
    const nums=new Array(6);
    for(let i=5;i>=0;i--){nums[i]=key%64;key=Math.floor(key/64)}
    return nums;
  };
  const score=(key)=>{
    const n=decode(key);let sum=0;
    for(const v of n)sum+=Number(scoreMap?.[v]??scoreMap?.[String(v)]??0);
    return Number.isFinite(sum)?sum:0;
  };
  // Pre-filter to the strongest 1.5x target before diversity optimization.
  // Deterministic ordering: higher score first; equal score -> smaller key.
  const limit=Math.min(keys.length,Math.max(target,Math.ceil(target*oversampleFactor)));
  const weaker=(a,b)=>a.score<b.score||(a.score===b.score&&a.key>b.key);
  const heap=[];
  const push=item=>{
    heap.push(item);let i=heap.length-1;
    while(i){const p=(i-1)>>1;if(!weaker(heap[i],heap[p]))break;[heap[i],heap[p]]=[heap[p],heap[i]];i=p;}
  };
  const down=()=>{
    let i=0;while(true){let l=2*i+1;if(l>=heap.length)break;let r=l+1;
      const j=(r<heap.length&&weaker(heap[r],heap[l]))?r:l;
      if(!weaker(heap[j],heap[i]))break;
      [heap[i],heap[j]]=[heap[j],heap[i]];i=j;
    }
  };
  const seenKeys=new Set();
  for(const key of keys){
    if(!Number.isSafeInteger(key)||key<0)throw Error('invalid ticket encoding');
    if(seenKeys.has(key))continue;
    seenKeys.add(key);
    const item={key,score:score(key)};
    if(heap.length<limit)push(item);
    else if(weaker(heap[0],item)){heap[0]=item;down()}
  }
  // If source has fewer unique tickets than requested, return every valid key.
  const ranked=heap.sort((a,b)=>b.score-a.score||a.key-b.key);
  const selected=new Uint8Array(ranked.length),covered5=new Set(),chosen=[];
  const subsets5=key=>{
    const n=decode(key),out=new Array(6);
    for(let omit=0;omit<6;omit++){
      let v=0;for(let i=0;i<6;i++)if(i!==omit)v=v*64+n[i];
      out[omit]=v;
    }
    return out;
  };
  // Novelty passes guarantee deterministic coverage priority before score.
  for(let minNew=6;minNew>=0&&chosen.length<target;minNew--){
    for(let i=0;i<ranked.length&&chosen.length<target;i++){
      if(selected[i])continue;
      const s=subsets5(ranked[i].key);
      let newCount=0;
      for(const x of s)if(!covered5.has(x))newCount++;
      if(newCount<minNew)continue;
      selected[i]=1;chosen.push(ranked[i].key);
      for(const x of s)covered5.add(x);
    }
  }
  if(chosen.length<target)throw Error('not enough distinct eligible tickets to meet reduction target');
  chosen.sort((a,b)=>a-b);
  return {keys:chosen,unique_five_subsets:covered5.size,source_total:keys.length,
    scored_candidates:ranked.length,selection:'score_plus_unique_five_subsets'};
}
