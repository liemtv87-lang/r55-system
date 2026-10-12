import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const engine=await import(pathToFileURL(process.cwd()+'/scripts/engine.mjs').href);
const source=readFileSync('./scripts/engine.mjs','utf8');
const start=source.indexOf('function hardFilter(');
const stop=source.indexOf('\nfunction normalize(',start);
if(start<0||stop<0)throw Error('Unable to locate original hardFilter; audit cancelled');
const original=source.slice(start,stop);
const changes={
  sum_max: [["if(total>(maxn===45?160:200))","if(total>(maxn===45?185:235))"]],
  head_min: [["if(hd(2)+hd(3)<2)","if(hd(2)+hd(3)<1)"],["if(hd(2)+hd(3)+hd(4)+(maxn===55?hd(5):0)<3)","if(hd(2)+hd(3)+hd(4)+(maxn===55?hd(5):0)<2)"]],
  three_region: [["if(prevLotteryOverlap<1)","if(prevLotteryOverlap<0)"]],
  xsmb_db: [["if(overlapCount(a,extra.xsmbJackpotSet)<1)","if(overlapCount(a,extra.xsmbJackpotSet)<0)"]],
  historical_five: [["for(const k of comb5keys(a))if(five?.has(k))return [false,'past_overlap'];","if(false)return [false,'past_overlap'];"]]
};
const configs=[
 {name:'baseline',turn:[]},
 ...Object.keys(changes).map(name=>({name,turn:[name]})),
 {name:'soft_sum_head',turn:['sum_max','head_min']},
 {name:'soft_calendar',turn:['three_region','xsmb_db']},
 {name:'soft_all_five',turn:['sum_max','head_min','three_region','xsmb_db','historical_five']}
];
async function variant(spec){
 if(!spec.turn.length)return {hardFilter:engine.hardFilter};
 let code=original;
 for(const name of spec.turn)for(const [before,after] of changes[name]){
   if(!code.includes(before))throw Error('Missing exact filter anchor '+name+': '+before);
   code=code.replace(before,after);
 }
 return import('data:text/javascript;base64,'+Buffer.from(source.slice(0,start)+code+source.slice(stop)).toString('base64'));
}
const variants=[];
for(const spec of configs)variants.push({name:spec.name,mod:await variant(spec)});
const asof=process.env.RESEARCH_ASOF||'2026-10-12';
const drawWindow=Math.max(1,Math.min(60,Number(process.env.RESEARCH_DRAWS||30)));
const begin='determined_by_last_draws';
const xsmb=JSON.parse(readFileSync('./data/xsmb200.json','utf8'));
const findings={version:'R39_rule_potential_screen',mode:'historic_eligibility_upper_bound_not_selected_200k_600k',start:begin,end:asof,variants:configs.map(x=>({name:x.name,changed:x.turn})),products:{},errors:[]};
for(const product of ['mega645','power655']){
 const maxn=product==='mega645'?45:55;
 const draws=JSON.parse(readFileSync('./data/history-'+product+'.json','utf8')).sort((a,b)=>a.date.localeCompare(b.date));
 const window=draws.filter(d=>d.date<=asof).slice(-drawWindow);
 const out={draws:[],summaries:{}};
 for(const variant of variants)out.summaries[variant.name]={tested:0,jp_eligible:0,jp2_eligible:0,g1_eligible:0,g1_possible:0};
 for(const d of window){
   const train=draws.filter(x=>x.date<d.date);
   const five=engine.fiveSet(train), exact=engine.exactSet(train);
   let same;
   try{same=await engine.fetch3RegionSetForDate(d.date,maxn)}catch(e){findings.errors.push(product+' '+d.date+' '+String(e).slice(0,70));continue}
   if(!same.numbers?.length){findings.errors.push(product+' '+d.date+' no same-day 3region data');continue}
   const set=new Set(same.numbers),extra={xsmbJackpotSet:engine.xsmbJackpotSetBefore(xsmb,d.date,maxn,200)};
   if(!extra.xsmbJackpotSet.size){findings.errors.push(product+' '+d.date+' no xsmb DB200 set');continue}
   const win=[...d.numbers].sort((a,b)=>a-b);
   const tickets=[{type:'jp',numbers:win}];
   const winningSet=new Set(win);
   for(let omit=0;omit<6;omit++){
     const base=win.filter((_,i)=>i!==omit);
     for(let n=1;n<=maxn;n++){
       if(winningSet.has(n))continue;
       tickets.push({type:product==='power655'&&d.special===n?'jp2':'g1',numbers:[...base,n].sort((a,b)=>a-b)});
     }
   }
   const row={date:d.date,draw_id:d.draw_id,three_region_count:set.size,variants:{}};
   for(const {name,mod} of variants){
     let jp=0,jp2=0,g1=0,possible=0;const reasons={};
     for(const ticket of tickets){
       if(ticket.type==='g1')possible++;
       const [ok,reason]=mod.hardFilter(ticket.numbers,maxn,five,set,exact,extra);
       if(ok){if(ticket.type==='jp')jp++;else if(ticket.type==='jp2')jp2++;else g1++}
       else if(name==='baseline')reasons[reason]=(reasons[reason]||0)+1;
     }
     row.variants[name]={jp,jp2,g1,possible};
     if(name==='baseline')row.baseline_rejections=reasons;
     const t=out.summaries[name];t.tested++;t.jp_eligible+=jp;t.jp2_eligible+=jp2;t.g1_eligible+=g1;t.g1_possible+=possible;
   }
   out.draws.push(row);
   console.log('AUDIT_DRAW',product,d.date,'baseline',JSON.stringify(row.variants.baseline),'wide',JSON.stringify(row.variants.soft_all_five));
 }
 const n=out.draws.length,split=Math.floor(n*0.65);
 out.training_draws=out.draws.slice(0,split).map(x=>x.date);
 out.holdout_draws=out.draws.slice(split).map(x=>x.date);
 out.holdout_results={};
 for(const item of variants){
   const x=out.draws.slice(split).map(r=>r.variants[item.name]);
   out.holdout_results[item.name]={draws:x.length,jp_eligible:x.reduce((a,b)=>a+b.jp,0),jp2_eligible:x.reduce((a,b)=>a+b.jp2,0),g1_eligible:x.reduce((a,b)=>a+b.g1,0)};
 }
 findings.products[product]=out;
}
writeFileSync('/tmp/vietlott-rule-research-30d-results.json',JSON.stringify(findings,null,2));
console.log('VIETLOTT_RULE_AUDIT_RESULTS='+JSON.stringify(Object.fromEntries(Object.entries(findings.products).map(([k,v])=>[k,{summaries:v.summaries,holdout:v.holdout_results}]))));
console.log('VIETLOTT_RULE_AUDIT_MISSING='+findings.errors.length);
