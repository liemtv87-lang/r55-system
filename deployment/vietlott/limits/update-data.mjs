import {snapshotPolicy} from './snapshot-policy.mjs';
import {reduceCoveragePool} from './reduce-coverage.mjs';
import {portfolioPolicy,assertPortfolioSize} from './pool-policy.mjs';
import {restoreBeforeDraw} from './restore-log.mjs';
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {
  catchUpSecondary,expectedDrawDate,CFG,HARD_RULES,SYSTEM_FILTER_RULES,USER_METHOD_RULES,METHOD_NAMES,fetchText,parseSeedCsv,catchUpOfficial,crossCheckLatest,fetchXsmb60,fetchPrizeMeta,
  chooseTargetDate,evaluatePredLog,countFilteredPool,collectFilteredPool,scanFilteredOutcome,actual60,backtest60,methodScores,learnWeights,
  xsmbBefore,xsmbJackpotSetBefore,fetch3RegionSetForDate
} from './engine.mjs';

const ROOT=new URL('../',import.meta.url);
const pathOf=p=>new URL(p,ROOT);
const iso=d=>d.toISOString().slice(0,10);
const vnToday=()=>iso(new Date(Date.now()+7*3600*1000));
const vnAnalysisDate=()=>{
  const d=new Date(Date.now()+7*3600*1000);
  if(d.getUTCHours()<19)d.setUTCDate(d.getUTCDate()-1);
  return iso(d);
};

async function readJson(rel,fallback){
  try{return JSON.parse(await readFile(pathOf(rel),'utf8'))}catch{return fallback}
}
async function writeJson(rel,obj){
  const u=pathOf(rel);
  const file=u.pathname;
  await mkdir(dirname(file),{recursive:true});
  // A terminated daily job must not leave a partial JSON snapshot.
  // The temp file lives on the same volume, so rename is atomic on Linux.
  const temporary=file+'.tmp-'+process.pid+'-'+Math.random().toString(36).slice(2);
  try {
    await writeFile(temporary,JSON.stringify(obj,null,2)+'\n','utf8');
    await rename(temporary,file);
  } catch(error) {
    await unlink(temporary).catch(()=>{});
    throw error;
  }
}
function retentionCutoff(days=365){
  const d=new Date(Date.now()+7*3600*1000);d.setUTCDate(d.getUTCDate()-days);
  return d.toISOString().slice(0,10);
}
function pruneYear(rows,dateKey='date'){
  const cut=retentionCutoff(365);
  return (rows||[]).filter(x=>String(x?.[dateKey]||'')>=cut);
}
function clippedLog(log){
  const cut=retentionCutoff(365);
  return (log||[]).filter(x=>String(x?.target_date||x?.date||'')>=cut).slice(-220);
}

async function loadHistory(product){
  const cfg=CFG[product];
  let hist=await readJson(`data/history-${product}.json`,[]);
  if(hist.length<100){const csv=await fetchText(cfg.seed,2);hist=parseSeedCsv(csv,product)}
  if(hist.length<100)throw new Error(`${product}: insufficient seed`);
  const cu=await catchUpOfficial(product,hist,36);
  const fallback=await catchUpSecondary(product,cu.history,36);hist=pruneYear(fallback.history);
  await writeJson(`data/history-${product}.json`,hist);
  return {hist,health:[...cu.health,...fallback.health],changes:{added:cu.added.length+fallback.added,latest_official:cu.latest?.date||null,latest_available:hist.at(-1)?.date,retention_days:365,retained:hist.length,oldest_retained:hist[0]?.date||null}};
}

function reportList(log){return (log||[]).filter(x=>x.pool_report).slice(-30).map(x=>x.pool_report)}

const RULESET_VERSION='USER_32_HARD_RULES_SAME_DAY_2026_10_07_R6';
function decodePoolKey(key){const n=Array(6);for(let i=5;i>=0;i--){n[i]=key%64;key=Math.floor(key/64)}return n}
function buildUserMethodProfile(history,maxn,targetDate){
  const weights=learnWeights(history,maxn,150), methods=methodScores(history,maxn,targetDate), number_scores={};
  for(let n=1;n<=maxn;n++){
    let s=0;
    for(const m of METHOD_NAMES)s+=Number(weights[m]||0)*Number(methods[m]?.[n]||0);
    number_scores[n]=Number(s.toFixed(8));
  }
  return {weights,number_scores};
}
function previewReducedPool(reduced,scoreMap={},limit=120){
  const keys=Array.isArray(reduced?.keys)?reduced.keys:[];
  const scoreKey=key=>decodePoolKey(key).reduce((s,n)=>s+Number(scoreMap[n]??scoreMap[String(n)]??0),0);
  const out=[];
  for(const key of keys){
    const numbers=decodePoolKey(key),score=scoreKey(key),row={numbers,score:Number(score.toFixed(6))};
    if(out.length<limit){out.push(row);out.sort((a,b)=>a.score-b.score||b.numbers.join('-').localeCompare(a.numbers.join('-')))}
    else if(score>out[0].score){out[0]=row;out.sort((a,b)=>a.score-b.score||b.numbers.join('-').localeCompare(a.numbers.join('-')))}
  }
  return out.sort((a,b)=>b.score-a.score||a.numbers.join('-').localeCompare(b.numbers.join('-')));
}

function reduceLockedPool(pool,ctx,product,maxn){
  const keys=Array.isArray(pool?.keys)?pool.keys:[];
  const policy=portfolioPolicy(product);
  if(keys.length<policy.target)throw Error(product+': KHÔNG ĐỦ BỘ HỢP LỆ ('+keys.length+'/'+policy.target+'), không khóa dàn rỗng hoặc phát hành thiếu');
  const target=policy.target;
  const ranked=reduceCoveragePool(keys,ctx?.number_scores||{},target);
  assertPortfolioSize(product,ranked.keys.length);
  if(new Set(ranked.keys).size!==target)throw Error(product+': dàn rút gọn trùng vé, từ chối khóa');
  return {product,target_date:pool?.target_date||ctx?.target_date||null,locked:true,
    source:'user_methods_5subset_coverage',source_total:keys.length,
    valid_total:ranked.keys.length,portfolio_target:policy.target,portfolio_hard_max:policy.max,
    keys_within_hard_limit:true,encoding:pool?.encoding||'base64x6-int',
    keys:ranked.keys,methods:[...METHOD_NAMES],ruleset_version:RULESET_VERSION,
    diversity:{metric:'unique_5_number_subsets',coverage_count:ranked.unique_five_subsets,
      scored_candidates:ranked.scored_candidates,algorithm:ranked.selection}};
}

async function main(){
  const today=vnToday(),analysisDate=vnAnalysisDate(),nowIso=new Date().toISOString(),errors=[],previousState=await readJson('public/state.json',null),healthAll={},histories={},changes={},prizeMeta={};
  const timePolicy=snapshotPolicy(nowIso,null),allowSnapshotRepair=process.env.ALLOW_SNAPSHOT_REPAIR==='1',fastSnapshotRepair=process.env.FAST_SNAPSHOT_REPAIR==='1';
  console.log(`[R15] Bắt đầu cập nhật lúc ${today} (VN); ngày phân tích=${analysisDate} (trước 19h dùng hôm qua, từ 19h dùng hôm nay)`);
  const products={...(previousState?.products||{})};
  for(const product of ['mega645','power655']){
    try{
    console.log(`[R5] Tải lịch sử ${product}...`);
    const h=await loadHistory(product);histories[product]=h.hist;healthAll[product]=h.health;changes[product]=h.changes;
    prizeMeta[product]=await fetchPrizeMeta(product).catch(e=>({product,error:e.message,fetched_at:new Date().toISOString()}));
    console.log(`[R7] ${product}: ${h.hist.length} kỳ, mới +${h.changes.added}`);
    }catch(e){errors.push(`${product}: ${e.message}`);healthAll[product]=[{ok:false,error:e.message}]} 
  }

  console.log('[R5] Tải/đối chiếu XSMB 200 ngày từ 3 nguồn...');
  const xb=await fetchXsmb60().catch(e=>({rows:[],health:[{ok:false,error:e.message}]}));healthAll.xsmb=xb.health;
  let xsmbRows=xb.rows;
  const cachedXsmb=await readJson('data/xsmb200.json',[]);
  if(xsmbRows.length<30&&cachedXsmb.length){console.warn(`[R5] XSMB mới chỉ ${xsmbRows.length} ngày; dùng cache ${cachedXsmb.length} ngày.`);xsmbRows=cachedXsmb}
  if(xsmbRows.length)await writeJson('data/xsmb200.json',xsmbRows);
  if(xsmbRows.length<30)errors.push(`Thiếu XSMB: ${xsmbRows.length} ngày; vẫn chấm dự đoán đã lưu`);

  if(process.env.REFRESH_ONLY==='1'){
    const sameDay=await fetch3RegionSetForDate(analysisDate,55);
    healthAll.same_day_preflight=sameDay.health;
    if(!sameDay.numbers.length)throw new Error(`Chưa đủ KQXS MB+MT+MN đúng ngày ${analysisDate}; chưa chạy backtest/chưa khóa snapshot`);
    console.log(`[R14] Preflight ${analysisDate}: đã có KQXS MB+MT+MN đúng ngày (${sameDay.numbers.length} số trong miền 1..55). Sẵn sàng backtest.`);
    return;
  }

  async function persistState(checkpoint=false){
    const state={
      ok:errors.length===0,ready:Object.values(products).some(p=>p?.latest||p?.snapshot),schema_version:'R13_SAME_DAY_SNAPSHOT',snapshot:{locked:Object.values(products).filter(Boolean).every(p=>p?.snapshot?.locked===true),products:{mega645:products.mega645?.snapshot||null,power655:products.power655?.snapshot||null}},last_update_error:errors.length?{at:new Date().toISOString(),message:errors.join(' | ')}:null,generated_at:new Date().toISOString(),generated_at_vn:new Date(Date.now()+7*3600*1000).toISOString(),
      automation:{mode:'snapdeploy_runner',runs_without_browser:true,crons_vn:['19:00','19:10 retry','19:20 retry'],update_after_19h:true,snapshot_key:'product_target_analysis_date',hard_rules_locked:true,user_hard_rule_count:HARD_RULES.length,system_filter_rule_count:0,learning_scope:'user_methods_only',statistics_scope:'full_user_rules_pool_plus_user_method_reduction',bridge_role:'proxy_locked_snapdeploy_snapshot_only'},
      note:'Phân tích thống kê/backtest; xổ số là ngẫu nhiên và không có phương pháp nào bảo đảm trúng.',products,
      xsmb_previous:xsmbRows[0]||{date:null,last2:[],full:[]},xsmb200_count:Math.min(200,xsmbRows.length),retention:{raw_draw_history_days:365,prediction_log_days:365,locked_pool_days:4,locked_pool_delete_after_statistics:true,policy:'delete_oldest_first'},source_health:healthAll,changes,
      hard_rules:HARD_RULES,system_filter_rules:SYSTEM_FILTER_RULES,user_methods:USER_METHOD_RULES,method_names:METHOD_NAMES
    };
    await writeJson('public/state.json',state);
    if(checkpoint)console.log(`[R17] Checkpoint state: Mega=${state.snapshot.products.mega645?.locked===true?'LOCKED':'pending'} • Power=${state.snapshot.products.power655?.locked===true?'LOCKED':'pending'}`);
    return state;
  }

  for(const [product,maxn] of [['mega645',45],['power655',55]]){
    const hist=histories[product];if(!hist)continue;
    try{
    let log=restoreBeforeDraw(await readJson(`data/predlog-${product}.json`,[]),product);
    const ev=evaluatePredLog(log,hist,product);log=ev.log;
    await writeJson(`data/predlog-${product}.json`,clippedLog(log));
    products[product]={...(products[product]||{}),count:hist.length,first_date:hist[0]?.date,last_date:hist.at(-1)?.date,latest:hist.at(-1),actual60:actual60(log,today),grading:{checked_at:new Date().toISOString(),newly_graded:ev.newly.length,pending:log.filter(x=>!x.evaluated&&!x.evaluation_error&&x.target_date<=today).length,excluded_late:log.filter(x=>x.evaluation_error).length}};
    const expected=expectedDrawDate(product,analysisDate);
    if(hist.at(-1)?.date<expected)throw new Error(`Kết quả cũ: ${hist.at(-1)?.date}; cần ${expected}`);
    if(!timePolicy.canGenerate&&!allowSnapshotRepair)throw new Error('Đã cập nhật/chấm; chờ 19:00 VN để tạo và khóa snapshot mới');
    if(xsmbRows.length<30)throw new Error('Không đủ XSMB cho dự đoán mới');

    // Mỗi ngày ưu tiên chấm kỳ mới nhất trên toàn bộ dàn theo điều kiện người dùng.
    // Dàn 200k/600k dùng toàn bộ PP người dùng; không có PP assistant.
    const pending=fastSnapshotRepair?[]:log.filter(x=>x.evaluated&&!x.pool_report).sort((a,b)=>b.target_date.localeCompare(a.target_date)).slice(0,1);
    for(const rec of pending){
      const draw=hist.find(d=>d.date===rec.target_date);if(!draw)continue;
      console.log(`[R5] ${product}: chấm toàn bộ tập hợp kỳ ${rec.target_date}...`);
      const train=hist.filter(d=>d.date<rec.target_date),xrowOld=xsmbBefore(xsmbRows,rec.target_date);
      const xsetOld=xrowOld?new Set(xrowOld.last2.filter(n=>n>=1&&n<=maxn)):new Set();
      rec.pool_report=scanFilteredOutcome(train,product,maxn,rec.target_date,xsetOld,xsmbRows,draw,rec.candidates||[]);
      rec.report_generated_at=new Date().toISOString();
      rec.pool_report.reconstructed=true;
      rec.pool_report.statistics_scope={user_rules:'user_only',system_rules:0,mode:'full_filtered_pool',reduction_applied:false};
      await writeJson(`data/predlog-${product}.json`,clippedLog(log));
      console.log(`[R5] ${product}: hợp lệ ${rec.pool_report.pool.valid_total}, có giải ${rec.pool_report.pool.winning_tickets}`);
    }

    const target=chooseTargetDate(product,analysisDate,hist);
    const xrow=xsmbRows.find(r=>r.date===analysisDate)||null;
    const today3=await fetch3RegionSetForDate(analysisDate,maxn);
    healthAll[`same_day_3region_${product}`]=today3.health;
    const xset=new Set(today3.numbers);
    if(!xrow)throw new Error(`${product}: chưa có XSMB đúng ngày ${analysisDate}; retry sau`);
    if(!xset.size)throw new Error(`${product}: chưa đủ tập MB+MT+MN đúng ngày ${analysisDate}; retry sau`);
    const savedSnapshot=await readJson(`data/snapshot-${product}.json`,null);
    const productPolicy=snapshotPolicy(nowIso,savedSnapshot,{target_date:target,source_draw_date:hist.at(-1)?.date||null,analysis_date:analysisDate});
    if(productPolicy.reuse&&savedSnapshot?.ruleset_version===RULESET_VERSION){
      const poolPath=`public/filtered-pool-${product}.json`;
      let lockedPool=await readJson(poolPath,null);
      if(!lockedPool||lockedPool.locked!==true||lockedPool.target_date!==target||!Array.isArray(lockedPool.keys)){
        console.log(`[R10] ${product}: kho snapshot khóa bị thiếu, sửa kho một lần trên máy chủ...`);
        const pool=collectFilteredPool(hist,maxn,target,xset,xsmbRows);
        lockedPool={product,target_date:target,locked:true,encoding:pool.encoding,valid_total:pool.valid_total,keys:pool.keys};
        await writeJson(poolPath,lockedPool);
      }
      const filteredTotal=Number(lockedPool.valid_total);
      if(filteredTotal!==lockedPool.keys.length)throw new Error(`${product}: kho khóa báo ${filteredTotal} nhưng có ${lockedPool.keys.length} bộ`);
      savedSnapshot.context={...(savedSnapshot.context||{}),filtered_total:filteredTotal,filtered_scanned:Number(savedSnapshot?.context?.filtered_scanned||savedSnapshot?.state?.snapshot?.filtered_scanned||0),locked:true};
      savedSnapshot.state={...(savedSnapshot.state||{}),snapshot:{...(savedSnapshot.state?.snapshot||{}),filtered_total:filteredTotal,locked:true}};
      savedSnapshot.filtered_total=filteredTotal;
      await writeJson(`public/filter-context-${product}.json`,savedSnapshot.context);
      await writeJson(`data/snapshot-${product}.json`,savedSnapshot);
      const reduced=reduceLockedPool(lockedPool,savedSnapshot.context,product,maxn);
      await writeJson(`public/reduced-pool-${product}.json`,reduced);
      products[product]={...savedSnapshot.state,prize_meta:prizeMeta[product]||savedSnapshot.state?.prize_meta||null};
      products[product].snapshot={...(products[product].snapshot||{}),filtered_total:filteredTotal,reduced_total:reduced.valid_total};
      const preview=previewReducedPool(reduced,savedSnapshot.context?.number_scores||{},120);
      products[product].prediction={...(products[product].prediction||{}),target_date:target,candidates:preview,weights:savedSnapshot.context?.method_weights||products[product].prediction?.weights||{},number_scores:savedSnapshot.context?.number_scores||{},source:'locked_reduced_pool_preview',preview_only:true,reduced_total:reduced.valid_total};
      products[product].prediction_count=reduced.valid_total;
      savedSnapshot.state=products[product];
      await writeJson(`data/snapshot-${product}.json`,savedSnapshot);
      await persistState(true);
      console.log(`[R16] ${product}: dùng nguyên kho SNAP khóa; USER-ONLY=${filteredTotal}, rút gọn=${reduced.valid_total}, preview=${preview.length}; KHÔNG quét lại ở client`);
      continue;
    }
    const jp=xsmbJackpotSetBefore(xsmbRows,target,maxn,200);if(!jp.size)throw new Error(`${product}: thiếu tập ĐB XSMB 200 ngày`);


    console.log(`[R15] ${product}: dùng MB+MT+MN ngày phân tích ${analysisDate}; toàn bộ PP người dùng cho kỳ ${target}`);
    const existing=log.find(r=>r.target_date===target&&!r.evaluated&&r.schema_version==='R13_SAME_DAY_SNAPSHOT'&&(r.analysis_date===analysisDate||(!r.analysis_date&&snapshotPolicy(r.generated_at,null).date===analysisDate)));
    const pred=existing?.prediction||{target_date:target,candidates:[],weights:{},number_scores:{},rejects:{},hard_context:{user_only:true}};
    const rec=existing||{schema_version:'R13_SAME_DAY_SNAPSHOT',prediction:pred,source_last_date:hist.at(-1)?.date,target_date:target,analysis_date:analysisDate,generated_at:new Date().toISOString(),xsmb_date:xrow.date,candidates:pred.candidates,weights:pred.weights,hard_context:pred.hard_context,user_rules:'user_only',system_rules:0,evaluated:false};
    const at=log.findIndex(x=>x.target_date===target&&!x.evaluated);if(at>=0)log[at]=rec;else log.push(rec);
    log=clippedLog(log);await writeJson(`data/predlog-${product}.json`,log);

    let bt=previousState?.products?.[product]?.backtest60||null;
    if(!fastSnapshotRepair&&(!bt||bt.asof!==analysisDate)){console.log(`[R5] ${product}: walk-forward 60 ngày...`);bt=backtest60(hist,product,maxn,analysisDate,xsmbRows,20);bt.asof=analysisDate}
    const reports=reportList(log);
    products[product]={
      grading:products[product]?.grading,count:hist.length,first_date:hist[0]?.date||null,last_date:hist.at(-1)?.date||null,latest:hist.at(-1)||null,
      prediction:pred,prediction_count:pred.candidates.length,actual60:actual60(log,today),backtest60:bt,
      daily_report:reports.at(-1)||null,daily_reports:reports,
      prize_meta:prizeMeta[product]||products[product]?.prize_meta||null
    };

    const profile=buildUserMethodProfile(hist,maxn,target);
    const ctx={
      ok:true,ready:true,schema_version:'R13_SAME_DAY_SNAPSHOT',ruleset_version:RULESET_VERSION,product,maxn,target_date:target,analysis_date:analysisDate,three_region_date:analysisDate,
      history:hist.map(d=>d.numbers),xsmb_date:xrow.date,xsmb_numbers:xrow.last2.filter(n=>n>=1&&n<=maxn),three_region_numbers:[...xset],
      xsmb_jackpot_200:[...jp],adaptive_rules:{enabled:false,user_only:true},hard_rules:HARD_RULES,system_filter_rules:SYSTEM_FILTER_RULES,
      user_methods:USER_METHOD_RULES,method_names:METHOD_NAMES,method_weights:profile.weights,number_scores:profile.number_scores,
      generated_at:new Date().toISOString()
    };
    const filteredPool=collectFilteredPool(hist,maxn,target,xset,xsmbRows);
    ctx.filtered_total=filteredPool.valid_total;
    ctx.filtered_scanned=filteredPool.scanned;
    const lockedPool={product,target_date:target,locked:true,encoding:filteredPool.encoding,valid_total:filteredPool.valid_total,keys:filteredPool.keys};
    await writeJson(`public/filtered-pool-${product}.json`,lockedPool);
    ctx.filtered_counted_at=new Date().toISOString();
    ctx.number_scores=profile.number_scores;
    ctx.reduction_target=Math.min(filteredPool.valid_total,product==='mega645'?200000:600000);
    ctx.reduction_methods=[...METHOD_NAMES];
    ctx.snapshot_target_date=target;ctx.snapshot_source_draw_date=hist.at(-1)?.date||null;ctx.locked=true;
    const reduced=reduceLockedPool(lockedPool,ctx,product,maxn);
    await writeJson(`public/reduced-pool-${product}.json`,reduced);
    const preview=previewReducedPool(reduced,ctx.number_scores||{},120);
    products[product].prediction={...(products[product].prediction||pred),target_date:target,candidates:preview,weights:ctx.method_weights||products[product].prediction?.weights||{},number_scores:ctx.number_scores||{},source:'locked_reduced_pool_preview',preview_only:true,reduced_total:reduced.valid_total};
    products[product].prediction_count=reduced.valid_total;
    products[product].snapshot={product,target_date:target,analysis_date:analysisDate,three_region_date:analysisDate,source_draw_date:hist.at(-1)?.date||null,locked:true,locked_at:new Date().toISOString(),filtered_total:ctx.filtered_total,filtered_scanned:ctx.filtered_scanned,reduction_target:ctx.reduction_target,reduced_total:reduced.valid_total};
    await writeJson(`public/filter-context-${product}.json`,ctx);
    await writeJson(`data/snapshot-${product}.json`,{product,target_date:target,analysis_date:analysisDate,three_region_date:analysisDate,source_draw_date:hist.at(-1)?.date||null,locked:true,locked_at:new Date().toISOString(),ruleset_version:RULESET_VERSION,state:products[product],context:ctx});
    await persistState(true);
    }catch(e){
      errors.push(`${product}: ${e.message}`);
      products[product]={...(products[product]||{}),update_error:e.message};
      console.error(e.message);
      await persistState(true);
    }
  }

  const state=await persistState(false);
  if(errors.length)process.exitCode=1;
  console.log(`[R6] Xong. State ${state.generated_at_vn}; XSMB ${state.xsmb200_count} ngày.`);
}

main().catch(async e=>{
  console.error(e?.stack||e);
  const old=await readJson('public/state.json',{});
  const fail={...old,ready:old?.ready===true,automation:{...(old?.automation||{}),mode:'snapdeploy_runner'},last_update_error:{at:new Date().toISOString(),message:String(e?.message||e)}};
  await writeJson('public/state.json',fail);
  process.exitCode=1;
});

