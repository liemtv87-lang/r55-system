// RESEARCH ONLY: check whether softening 32 user rules helps actual FINAL pools.
// Variant modifies BOTH standard and optimized fast-filter predicates in memory.
// No production source files or locked snapshots are changed.
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import * as base from './engine.mjs';
import {reduceCoveragePool} from './vietlott-coverage-reducer-research.mjs';
import {portfolioPolicy,assertPortfolioSize} from './pool-policy.mjs';
const source=readFileSync('./scripts/engine.mjs','utf8');
const replacements=[
 ['if(total>(maxn===45?160:200))','if(total>(maxn===45?185:235))'],
 ['if(total>(c.maxn===45?160:200))','if(total>(c.maxn===45?185:235))'],
 ['if(hd(2)+hd(3)<2)','if(hd(2)+hd(3)<1)'],
 ['if((hd[2]||0)+(hd[3]||0)<2)','if((hd[2]||0)+(hd[3]||0)<1)'],
 ['if(hd(2)+hd(3)+hd(4)+(maxn===55?hd(5):0)<3)','if(hd(2)+hd(3)+hd(4)+(maxn===55?hd(5):0)<2)'],
 ['if((hd[2]||0)+(hd[3]||0)+(hd[4]||0)+(c.maxn===55?(hd[5]||0):0)<3)','if((hd[2]||0)+(hd[3]||0)+(hd[4]||0)+(c.maxn===55?(hd[5]||0):0)<2)']
];
let engine=source;
for(const [from,to] of replacements){
 if(engine.split(from).length!==2)throw Error('Ambiguous rule variant anchor: '+from);
 engine=engine.replace(from,to);
}
const soft=await import('data:text/javascript;base64,'+Buffer.from(engine).toString('base64'));
const output='/app/data/vietlott-rule-softsum-head-research';
mkdirSync(output,{recursive:true});
const histJSON=p=>JSON.parse(readFileSync(p,'utf8'));
const xsmb=histJSON('./data/xsmb200.json');
const details=histJSON('./public/backtest-60.json').products;
const MAX=Math.max(1,Math.min(3,Number(process.env.RESEARCH_DRAW_COUNT||3)));
const decode=key=>{const a=Array(6);for(let i=5;i>=0;i--){a[i]=key%64;key=Math.floor(key/64)}return a};
const save=(p,obj)=>{const t=p+'.tmp';writeFileSync(t,JSON.stringify(obj,null,2));renameSync(t,p)};
function grade(keys,draw,product){
 const win=new Set(draw.numbers),c={};
 for(const k of keys){
  const n=decode(k),hits=n.reduce((s,x)=>s+Number(win.has(x)),0);
  const prize=product==='mega645'?(hits===6?'Jackpot':hits===5?'Giải nhất':null):
    (hits===6?'Jackpot 1':hits===5&&n.includes(draw.special)?'Jackpot 2':hits===5?'Giải nhất':null);
  if(prize)c[prize]=(c[prize]||0)+1;
 }
 return c;
}
for(const [product,maxn] of [['mega645',45],['power655',55]]){
 const policy=portfolioPolicy(product);
 const hist=histJSON('./data/history-'+product+'.json').sort((a,b)=>a.date.localeCompare(b.date));
 const available=details[product].details30;
 const dates=(MAX===3?[0,Math.floor((available.length-1)/2),available.length-1]:available.slice(-MAX).map((_,i)=>available.length-MAX+i)).map(i=>available[i].date);
 for(const date of dates){
  const draw=hist.find(x=>x.date===date),train=hist.filter(x=>x.date<date);
  if(!draw||train.length<45)throw Error('not enough predraw data '+product+' '+date);
  const same=await base.fetch3RegionSetForDate(date,maxn);
  if(!same.numbers.length)throw Error('regional history missing '+product+' '+date);
  const raw=soft.collectFilteredPool(train,maxn,date,new Set(same.numbers),xsmb);
  if(raw.valid_total<policy.target)throw Error('not enough eligible after relaxed rules');
  const w=base.learnWeights(train,maxn,150),methods=base.methodScores(train,maxn,date),score={};
  for(let n=1;n<=maxn;n++){let v=0;for(const method of base.METHOD_NAMES)v+=Number(w[method]||0)*Number(methods[method]?.[n]||0);score[n]=Number(v.toFixed(8))}
  const selected=reduceCoveragePool(raw.keys,score,policy.target,{oversampleFactor:1.5});
  assertPortfolioSize(product,selected.keys.length);
  const baseFile=resolve('/app/data/coverage-r40-walkforward-30',product+'-'+date+'.json');
  const old=JSON.parse(readFileSync(baseFile,'utf8'));
  if(old.target!==policy.target||old.selector!=='score_plus_unique_five_subsets_v1')throw Error('baseline fixed size mismatch');
  const row={product,date,version:'soft_sum_185_235_head23_min1_headband_min2',
   user_rules_retained:32,portfolio_target:policy.target,hard_max:policy.max,
   candidates_before_selection:raw.valid_total,selected_count:selected.keys.length,
   selected_five_subsets:selected.unique_five_subsets,prizes:grade(selected.keys,draw,product),
   baseline_five_subsets:old.subset_diversity,baseline_prizes:old.prize_counts};
  save(resolve(output,product+'-'+date+'.json'),row);
  console.log('SOFT_RULE_FIXED_POOL_'+product+'_'+date+'='+JSON.stringify(row));
 }
}
console.log('SOFT_RULE_FIXED_POOL_RESEARCH_COMPLETED=YES');
