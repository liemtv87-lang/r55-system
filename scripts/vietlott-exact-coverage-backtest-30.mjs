import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {CFG,fetch3RegionSetForDate,collectFilteredPool,learnWeights,methodScores,METHOD_NAMES} from './engine.mjs';
import {reduceCoveragePool} from './vietlott-coverage-reducer-research.mjs';

const MAX_DRAWS=Math.max(1,Math.min(30,Number(process.env.MAX_DRAWS||30)));
const ROOT='/app/data/coverage-r40-walkforward-30';
mkdirSync(ROOT,{recursive:true});
const readJson=path=>JSON.parse(readFileSync(path,'utf8'));
const atomic=(path,obj)=>{const temp=path+'.tmp';writeFileSync(temp,JSON.stringify(obj,null,2));renameSync(temp,path)};
const snap=readJson('./public/backtest-60.json');
const xsmb=readJson('./data/xsmb200.json');
const result={schema_version:'R40_SAME_REDUCER_AS_PRODUCTION',mode:'actual_coverage_reducer_not_score_only',asof:snap.generated_at,products:{},max_draws:MAX_DRAWS};
function decode(key){const a=Array(6);for(let i=5;i>=0;i--){a[i]=key%64;key=Math.floor(key/64)}return a}
function computePrizes(keys,draw,product){
 const main=new Set(draw.numbers),counts={};
 for(const key of keys){
   const nums=decode(key),m=nums.reduce((a,n)=>a+(main.has(n)?1:0),0);
   const prize=product==='mega645'?(m===6?'Jackpot':m===5?'Giải nhất':null):
      (m===6?'Jackpot 1':m===5&&nums.includes(draw.special)?'Jackpot 2':m===5?'Giải nhất':null);
   if(prize)counts[prize]=(counts[prize]||0)+1;
 }
 return counts;
}
for(const [product,maxn,target] of [['mega645',45,200000],['power655',55,600000]]){
 const hist=readJson('./data/history-'+product+'.json').sort((a,b)=>a.date.localeCompare(b.date));
 const all=hist.slice(),perDraw=snap.products[product].details30.map(x=>x.date).sort().slice(-MAX_DRAWS);
 const rows=[];
 for(let i=0;i<perDraw.length;i++){
   const date=perDraw[i],draw=hist.find(d=>d.date===date),file=resolve(ROOT,product+'-'+date+'.json');
   if(existsSync(file)){
     const old=readJson(file);if(old.target===target&&old.product===product&&old.selector==='score_plus_unique_five_subsets_v1'){rows.push(old);console.log('REUSE_EXACT_'+product+' '+date);continue}
   }
   if(!draw){rows.push({date,product,error:'missing_draw'});continue}
   const train=hist.filter(x=>x.date<date);
   try{
     const same=await fetch3RegionSetForDate(date,maxn);
     if(!same.numbers.length)throw Error('missing_same_day_regional_results');
     const pool=collectFilteredPool(train,maxn,date,new Set(same.numbers),xsmb);
     if(pool.valid_total<target)throw Error('filtered_count_below_target_'+pool.valid_total);
     const w=learnWeights(train,maxn,150),methods=methodScores(train,maxn,date),score={};
     for(let n=1;n<=maxn;n++){
       let t=0;for(const method of METHOD_NAMES)t+=Number(w[method]||0)*Number(methods[method]?.[n]||0);
       score[n]=Number(t.toFixed(8));
     }
     const reduced=reduceCoveragePool(pool.keys,score,target);
     const prize_counts=computePrizes(reduced.keys,draw,product);
     const row={date,draw_id:draw.draw_id,product,target,selector:'score_plus_unique_five_subsets_v1',
       filtered:pool.valid_total,reduced:reduced.keys.length,prize_counts,subset_diversity:reduced.unique_five_subsets};
     atomic(file,row);rows.push(row);
     console.log('EXACT_COVERAGE_'+product+' '+date+' '+JSON.stringify({filtered:pool.valid_total,reduced:row.reduced,prizes:prize_counts}));
   }catch(e){const err={date,product,error:String(e?.message||e).slice(0,170)};rows.push(err);console.log('EXACT_COVERAGE_MISSING_'+product+' '+date+' '+err.error)}
 }
 const good=rows.filter(r=>!r.error),counts={};
 for(const r of good)for(const [k,v] of Object.entries(r.prize_counts||{}))counts[k]=(counts[k]||0)+Number(v||0);
 result.products[product]={requested:MAX_DRAWS,completed:good.length,missing:rows.length-good.length,
   window_start:perDraw.at(0)||null,window_end:perDraw.at(-1)||null,counts,
   rows:rows.map(r=>({date:r.date,error:r.error||null,prize_counts:r.prize_counts||null}))};
 atomic(resolve(ROOT,'summary.json'),result);
 console.log('EXACT_COVERAGE_SUMMARY_'+product+' '+JSON.stringify(result.products[product]).slice(0,2100));
}
console.log('EXACT_REDUCER_BACKTEST_COMPLETE='+String(Object.values(result.products).every(x=>x.completed===MAX_DRAWS)));
