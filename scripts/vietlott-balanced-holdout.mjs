import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {collectFilteredPool,fetch3RegionSetForDate,learnWeights,methodScores,METHOD_NAMES} from './engine.mjs';
import {reduceBalancedCoveragePool} from './vietlott-balanced-coverage-research.mjs';
import {portfolioPolicy,assertPortfolioSize} from './pool-policy.mjs';
const reportDir='/app/data/vietlott-balanced-selector-holdout';
mkdirSync(reportDir,{recursive:true});
const count=Math.max(1,Math.min(10,Number(process.env.COMPARE_DRAWS||3)));
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
console.log('BALANCED_SELECTOR_RESEARCH_COMPLETE=YES');
