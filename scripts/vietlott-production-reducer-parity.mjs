import {readFileSync,writeFileSync} from 'node:fs';
import {CFG,fetch3RegionSetForDate,collectFilteredPool,learnWeights,methodScores,METHOD_NAMES} from './engine.mjs';
import {reduceCoveragePool} from './reduce-coverage.mjs';
const rows=[['mega645','2026-10-04',45,200000],['power655','2026-10-03',55,600000]];
const xsmb=JSON.parse(readFileSync('./data/xsmb200.json','utf8'));
const bt=JSON.parse(readFileSync('./public/backtest-60.json','utf8'));
const results=[];
for(const [product,date,maxn,target] of rows){
 const hist=JSON.parse(readFileSync('./data/history-'+product+'.json','utf8')).sort((a,b)=>a.date.localeCompare(b.date));
 const draw=hist.find(x=>x.date===date);
 if(!draw)throw Error('draw missing '+product+' '+date);
 const train=hist.filter(x=>x.date<date);
 const same=await fetch3RegionSetForDate(date,maxn);
 if(!same.numbers.length)throw Error('same-day regional draw data unavailable');
 const weights=learnWeights(train,maxn,150),methods=methodScores(train,maxn,date),score={};
 for(let n=1;n<=maxn;n++){
   let s=0;for(const m of METHOD_NAMES)s+=Number(weights[m]||0)*Number(methods[m]?.[n]||0);
   score[n]=Number(s.toFixed(8));
 }
 const raw=collectFilteredPool(train,maxn,date,new Set(same.numbers),xsmb);
 if(raw.valid_total<target)throw Error('insufficient eligible tickets '+raw.valid_total);
 console.log('PARITY_POOL_'+product+'='+raw.valid_total);
 const final=reduceCoveragePool(raw.keys,score,target);
 const counts={}, main=new Set(draw.numbers);
 for(const key0 of final.keys){
   let k=key0;const ticket=Array(6);for(let j=5;j>=0;j--){ticket[j]=k%64;k=Math.floor(k/64)}
   const matches=ticket.reduce((s,v)=>s+(main.has(v)?1:0),0);
   let prize=null;
   if(product==='mega645')prize=matches===6?'Jackpot':matches===5?'Giải nhất':null;
   else prize=matches===6?'Jackpot 1':matches===5&&ticket.includes(draw.special)?'Jackpot 2':matches===5?'Giải nhất':null;
   if(prize)counts[prize]=(counts[prize]||0)+1;
 }
 const reported=bt.products?.[product]?.details30?.find(x=>x.date===date);
 results.push({product,date,eligible:raw.valid_total,target,production_reducer_counts:counts,
  reported_backtest_top_score_counts:reported?.reduced_prize_counts||null,
  prod_subset_count:final.unique_five_subsets,methods:final.selection,
  parityMatchesOnJPAndG1:['Jackpot','Jackpot 1','Jackpot 2','Giải nhất'].every(k=>Number(counts[k]||0)===Number(reported?.reduced_prize_counts?.[k]||0))});
 console.log('PARITY_RESULT_'+product+'='+JSON.stringify(results.at(-1)));
}
writeFileSync('/tmp/vietlott-production-reducer-parity.json',JSON.stringify(results,null,2));
