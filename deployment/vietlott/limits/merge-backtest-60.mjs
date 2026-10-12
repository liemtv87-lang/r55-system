import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {HARD_RULES} from './engine.mjs';
import {portfolioPolicy,assertPortfolioSize} from './pool-policy.mjs';

const ROOT=new URL('../',import.meta.url);
const dir=new URL('backtest-parts/',ROOT);
const names=await readdir(dir);
const REQUIRED_SHARDS=24;
const SHARD_SCHEMA='R16_USER32_ALL_METHODS_SAME_DAY_SHARD';
const PRODUCTS=['mega645','power655'];
if(HARD_RULES.length!==32)throw new Error('Merge blocked: source engine is not 32 hard rules');
const engineSha256=createHash('sha256').update(await readFile(new URL('./engine.mjs',import.meta.url))).digest('hex');
const byProduct=new Map(PRODUCTS.map(p=>[p,new Map()]));
let commonWindowEnd=null,commonWindowStart=null;
for(const name of names){
  if(!name.endsWith('.json'))continue;
  const match=/^(mega645|power655)-(\d+)\.json$/.exec(name);
  if(!match)throw new Error('Merge blocked: unexpected shard filename '+name);
  let part;
  try{part=JSON.parse(await readFile(new URL(name,dir),'utf8'))}
  catch(e){throw new Error('Merge blocked: invalid JSON '+name+': '+e.message)}
  const product=match[1],shard=Number(match[2]);
  if(part.product!==product||part.shard!==shard||part.total_shards!==REQUIRED_SHARDS||shard<0||shard>=REQUIRED_SHARDS)
    throw new Error('Merge blocked: invalid shard metadata '+name);
  if(part.schema_version!==SHARD_SCHEMA||part.hard_rule_count!==32||part.engine_sha256!==engineSha256)
    throw new Error('Merge blocked: schema/rule count/engine fingerprint mismatch '+name);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(part.window_end||'')||!/^\d{4}-\d{2}-\d{2}$/.test(part.window_start||''))
    throw new Error('Merge blocked: invalid window '+name);
  if(commonWindowEnd===null){commonWindowEnd=part.window_end;commonWindowStart=part.window_start}
  if(part.window_end!==commonWindowEnd||part.window_start!==commonWindowStart)
    throw new Error('Merge blocked: inconsistent backtest windows '+name);
  if(!Array.isArray(part.rows))throw new Error('Merge blocked: missing rows '+name);
  const m=byProduct.get(product);
  if(m.has(shard))throw new Error('Merge blocked: duplicate shard '+name);
  m.set(shard,part);
}
const parts=[];
for(const product of PRODUCTS){
  const m=byProduct.get(product);
  const missing=Array.from({length:REQUIRED_SHARDS},(_,i)=>i).filter(i=>!m.has(i));
  if(missing.length)throw new Error('Merge blocked: '+product+' missing shards '+missing.join(','));
  const seenRows=new Set();
  for(let i=0;i<REQUIRED_SHARDS;i++){
    const part=m.get(i);
    for(const row of part.rows){
      if(!row||typeof row.date!=='string'||typeof row.draw_id!=='string')
        throw new Error('Merge blocked: invalid row in '+product+' shard '+i);
      const key=row.date+'|'+row.draw_id;
      if(seenRows.has(key))throw new Error('Merge blocked: duplicate draw '+product+' '+key);
      if(!row.skipped)assertPortfolioSize(product,Number(row.reduced?.total));
      seenRows.add(key);
    }
    parts.push(part);
  }
}

const compact=r=>({
  date:r.date,draw_id:r.draw_id,result:r.result,special:r.special,
  // Filtered universe can contain millions of candidates; never report its prize count as the purchased portfolio.
  final_portfolio_cap:Math.max(0,Number(r.reduced?.target_total||0)),
  final_portfolio_size:r.reduced?.total||0,
  winning_tickets:r.reduced?.winning_tickets||0,
  prize_counts:r.reduced?.prize_counts||{},
  wins:(r.reduced?.wins||[]).slice(0,120),
  reduced_total:r.reduced?.total||0,
  reduced_winning_tickets:r.reduced?.winning_tickets||0,
  reduced_prize_counts:r.reduced?.prize_counts||{},
  reduced_wins:(r.reduced?.wins||[]).slice(0,120),
  method_weights:r.method_weights||{}
});

function aggregate(rows,field='filtered',windowStart=null,windowEnd=null){
  const counts={};let totalWins=0,winningDraws=0,sumPool=0;
  for(const r of rows){
    const f=r[field]||{},w=Number(f.winning_tickets||0);
    if(w>0)winningDraws++;
    totalWins+=w;
    sumPool+=Number(f.total||0);
    for(const [k,v] of Object.entries(f.prize_counts||{}))counts[k]=(counts[k]||0)+Number(v||0);
  }
  return {
    window_start:windowStart??rows[0]?.date??null,
    window_end:windowEnd??rows.at(-1)?.date??null,
    draws_tested:rows.length,
    winning_draws:winningDraws,
    total_winning_tickets:totalWins,
    prize_counts:counts,
    avg_pool:rows.length?sumPool/rows.length:0,
    avg_filtered_pool:rows.length?sumPool/rows.length:0,
    scope:field
  };
}

function addDaysIso(iso,delta){
  const d=new Date(iso+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()+delta);
  return d.toISOString().slice(0,10);
}

function rowsInCalendarWindow(all,end,days){
  const start=addDaysIso(end,-(days-1));
  return {start,end,rows:all.filter(r=>r.date>=start&&r.date<=end)};
}

const products={};
for(const product of ['mega645','power655']){
  const pp=parts.filter(x=>x.product===product);
  const all=pp.flatMap(x=>x.rows||[]).filter(x=>!x.skipped).sort((a,b)=>a.date.localeCompare(b.date));
  const end=all.at(-1)?.date||null;
  const details30=all.slice(-30);
  const rows60=all.slice(-60);
  if(rows60.length<60)throw new Error('Merge blocked: '+product+' has only '+rows60.length+' valid draws; need at least 60');
  const w365=end?rowsInCalendarWindow(all,end,365):{start:null,end:null,rows:[]};
  // Kỳ quay (draw count), not calendar days. Never fabricate unobserved 150/1500 draws.
  const drawWindow=(drawCount,field)=>{
    const rows=all.slice(-drawCount);
    return {...aggregate(rows,field),requested_draws:drawCount,available_draws:rows.length,
      missing_draws:Math.max(0,drawCount-rows.length),complete:rows.length===drawCount,
      basis:'verified_walk_forward_draws',missing_data_note:rows.length<drawCount?
      'Chưa đủ kỳ hồi kiểm xác thực; không ngoại suy hoặc tự điền giải thưởng':null};
  };

  products[product]={
    product,
    filter_scope:{user_rules:'user_only',system_rules:0,mode:'final_portfolio_only',reduction_applied:true,
      target:portfolioPolicy(product).target,hard_max:portfolioPolicy(product).max,provisional:true},
    portfolio_target:portfolioPolicy(product).target,
    portfolio_hard_max:portfolioPolicy(product).max,

    // UI: 30 kỳ gần nhất, có chi tiết từng kỳ.
    details30:details30.map(compact),
    detail30_start:details30[0]?.date||null,
    detail30_end:details30.at(-1)?.date||null,

    // UI: chỉ giữ 60 kỳ gần nhất và 1 năm gần nhất.
    // Public stats never include performance from filtered universes >220k/650k.
    stats30:drawWindow(30,'reduced'),
    stats60:drawWindow(60,'reduced'),
    stats150:drawWindow(150,'reduced'),
    stats1500:drawWindow(1500,'reduced'),
    stats365:aggregate(w365.rows,'reduced',w365.start,w365.end),
    reduced_stats30:drawWindow(30,'reduced'),
    reduced_stats60:drawWindow(60,'reduced'),
    reduced_stats150:drawWindow(150,'reduced'),
    reduced_stats1500:drawWindow(1500,'reduced'),
    reduced_stats365:aggregate(w365.rows,'reduced',w365.start,w365.end),
    method_names:pp[0]?.method_names||[],
    user_methods:pp[0]?.user_methods||[]
  };
}

const out={
  schema_version:'R17_USER32_ALL_METHODS_SAME_DAY_30DRAWS_60DRAWS_365D',
  generated_at:new Date().toISOString(),
  verification:{hard_rule_count:32,engine_sha256:engineSha256,shard_schema:SHARD_SCHEMA,shards_per_product:REQUIRED_SHARDS,verified_total_shards:parts.length,window_start:commonWindowStart,window_end:commonWindowEnd},
  products
};

await writeFile(new URL('public/backtest-60.json',ROOT),JSON.stringify(out,null,2)+'\n','utf8');
const windows={
  ok:true,generated_at:out.generated_at,source:'historical_score_only_reducer_NOT_PRODUCTION',
  provisional:true,matches_production_reducer:false,
  warning:'Các số JP/G1 này là hồi kiểm dùng bộ chọn theo điểm; chưa phải hồi kiểm chính xác của dàn khách chọn theo độ phủ 5 số.',
  portfolio_policy:{mega645:{target:200000,hard_max:220000},power655:{target:600000,hard_max:650000}},
  target30:{jackpot:5,giai_nhat:2000},
  note:'Kỳ quay không phải ngày; không suy đoán các kỳ còn thiếu; mục tiêu không bảo đảm',
  products:{}
};
for(const product of PRODUCTS){
  const p=products[product],byCount={},policy=portfolioPolicy(product);
  for(const n of [30,60,150,1500]){
    const row=p['reduced_stats'+n],c=row?.prize_counts||{};
    if(row&&row.draws_tested>0&&row.avg_pool>policy.max)throw Error('Public statistics exceed '+product+' cap');
    byCount[String(n)]={requested:n,available:row?.available_draws||0,complete:row?.complete===true,
      window_start:row?.window_start||null,window_end:row?.window_end||null,
      jackpot:(c.Jackpot||0)+(c['Jackpot 1']||0)+(c['Jackpot 2']||0),
      jackpot1:c['Jackpot 1']||0,jackpot2:c['Jackpot 2']||0,g1:c['Giải nhất']||0,
      // Never include winnings from million-ticket candidate universes in customer statistics.
      portfolio_target:policy.target,portfolio_cap:policy.max,
      average_pool:row?.avg_pool||0,under_cap:(!row||row.avg_pool<=policy.max)};
  }
  windows.products[product]=byCount;
}
await writeFile(new URL('public/draw-windows.json',ROOT),JSON.stringify(windows,null,2)+'\n','utf8');

console.log(JSON.stringify(Object.fromEntries(Object.entries(products).map(([k,v])=>[k,{
  details30:v.details30.length,
  detail30_start:v.detail30_start,
  detail30_end:v.detail30_end,
  stats60:v.stats60,
  stats365:v.stats365,
  filter_scope:v.filter_scope
}])),null,2));
