import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {collectFilteredPool,fetch3RegionSetForDate,learnWeights,methodScores,METHOD_NAMES} from './engine.mjs';
import {reduceBalancedCoveragePool} from './vietlott-balanced-coverage-research.mjs';
import {portfolioPolicy,assertPortfolioSize} from './pool-policy.mjs';
const reportDir='/app/data/vietlott-balanced-selector-holdout';
mkdirSync(reportDir,{recursive:true});
const count=Math.max(1,Math.min(30,Number(process.env.COMPARE_DRAWS||3)));
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,x)=>{const tmp=p+'.tmp';writeFileSync(tmp,JSON.stringify(x,null,2));renameSync(tmp,p)};
const bt=json('./public/backtest-60.json'),xsmb=json('./data/xsmb200.json');
const decode=key=>{let x=key,a=[];for(let i=0;i<6;i++){a.unshift(x%64);x=Math.floor(x/64)}return a};
function scoreTicketPool(keys,draw,product){
 const main=new Set(draw.numbers),prizes={};
 for(const key of keys){
   const nums=decode(key),matches=nums.filter(n=>main.has(n)).length;
   const p=product==='mega645'?(matches===6?'Jackpot':matches===5?'Giải nhất':null):
      (matches===6?'Jackpot 1':matches===5&&nums.includes(draw.special)?'Jackpot 2':matches===5?'Giải nhất':null);
   if(p)prizes[p]=(prizes[p]||0)+1;
 }
 return prizes;
}
for(const [product,maxn] of [['mega645',45],['power655',55]]){
 const policy=portfolioPolicy(product),hist=json('./data/history-'+product+'.json').sort((a,b)=>a.date.localeCompare(b.date));
 const dates=(bt.products?.[product]?.details30||[]).slice(-count).map(d=>d.date);
 for(const date of dates){
   const file=resolve(reportDir,product+'-'+date+'.json');
   if(existsSync(file)){
     const item=json(file);
     if(item.selector==='uniform_candidates_2_25_5subset_v1'&&item.portfolio_target===policy.target){
       console.log('BALANCED_HOLDOUT_REUSED '+product+' '+date);continue;
     }
   }
   const draw=hist.find(d=>d.date===date),train=hist.filter(d=>d.date<date);
   if(!draw||train.length<45)throw Error('incomplete historic training '+product+' '+date);
   const three=await fetch3RegionSetForDate(date,maxn);
   if(!three.numbers?.length)throw Error('missing dated regional results '+date);
   const eligible=collectFilteredPool(train,maxn,date,new Set(three.numbers),xsmb);
   if(eligible.valid_total<policy.target)throw Error('candidate pool too small: '+product+' '+eligible.valid_total);
   const weights=learnWeights(train,maxn,150),scores=methodScores(train,maxn,date),score={};
   for(let n=1;n<=maxn;n++){
     let v=0;for(const method of METHOD_NAMES)v+=Number(weights[method]||0)*Number(scores[method]?.[n]||0);
     score[n]=Number(v.toFixed(8));
   }
   // Salt depends on product + target date ONLY. No actual winning draw leakage.
   const alt=reduceBalancedCoveragePool(eligible.keys,score,policy.target,{
     oversampleFactor:2.25,salt:product+'|'+date
   });
   assertPortfolioSize(product,alt.keys.length);
   const oldPath=resolve('/app/data/coverage-r40-walkforward-30',product+'-'+date+'.json');
   const base=existsSync(oldPath)?json(oldPath):null;
   const row={product,date,selector:'uniform_candidates_2_25_5subset_v1',source_total:eligible.valid_total,
     portfolio_target:policy.target,hard_max:policy.max,selected:alt.keys.length,
     unique_five_subsets:alt.unique_five_subsets,prize_counts:scoreTicketPool(alt.keys,draw,product),
     baseline_from_same_live_selector:base?.selector==='score_plus_unique_five_subsets_v1'?{
       portfolio_target:base.target,unique_five_subsets:base.subset_diversity,
       prize_counts:base.prize_counts
     }:null};
   save(file,row);
   console.log('BALANCED_HOLDOUT_'+product+'_'+date+'='+JSON.stringify(row));
 }
}
const summary={schema_version:'R41_BALANCED_CANDIDATE_SAMPLING_30_DRAW_RESEARCH',draws_per_product:count,
  run_type:'historic_comparison_not_future_guarantee',final_portfolio_only:true,products:{}};
for(const [product,target,cap] of [['mega645',200000,220000],['power655',600000,650000]]){
 const dates=(bt.products?.[product]?.details30||[]).slice(-count).map(d=>d.date);
 const rows=dates.map(date=>json(resolve(reportDir,product+'-'+date+'.json')));
 if(rows.length!==count||rows.some(x=>x.portfolio_target!==target||x.selected!==target||x.hard_max!==cap||
  x.baseline_from_same_live_selector?.portfolio_target!==target))throw Error('incomplete or mis-sized comparison '+product);
 const tally=selector=>rows.reduce((v,row)=>{
  const c=(selector==='new'?row.prize_counts:row.baseline_from_same_live_selector.prize_counts)||{};
  for(const [k,n] of Object.entries(c))v[k]=(v[k]||0)+Number(n);
  return v;
 },{});
 const avg=key=>rows.reduce((sum,row)=>sum+Number(key==='new'?row.unique_five_subsets:row.baseline_from_same_live_selector.unique_five_subsets),0)/rows.length;
 const coverageOld=avg('old'),coverageNew=avg('new');
 summary.products[product]={draws:count,portfolio_target:target,hard_max:cap,
  historical_baseline_prizes:tally('old'),balanced_sampling_prizes:tally('new'),
  average_five_subset_coverage_old:Math.round(coverageOld),
  average_five_subset_coverage_new:Math.round(coverageNew),
  relative_coverage_gain_pct:Number(((coverageNew/coverageOld-1)*100).toFixed(2)),
  note:'Các con số là kết quả trên cùng các kỳ lịch sử, không phải bảo đảm tương lai'};
 console.log('BALANCED_SELECTOR_30_RESULT_'+product+'='+JSON.stringify(summary.products[product]));
}
save(resolve(reportDir,'summary-'+count+'-draws.json'),summary);
console.log('BALANCED_SELECTOR_RESEARCH_COMPLETE=YES');
