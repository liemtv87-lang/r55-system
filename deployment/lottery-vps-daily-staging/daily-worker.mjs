// KQ247 XSMB local VPS daily engine. Immutable staging snapshots; never publishes
// until today's DE and 3-cang have independent verified data and release is approved.
import {readFile,writeFile,rename,open} from 'node:fs/promises';
import {join} from 'node:path';
import {getXsDraws} from './minhngoc-draw.mjs';
import {predictIndependentDaily} from './independent500.mjs';
const ROOT='/stage', HISTORY=join(ROOT,'xsmb-history-live.json');
const SEED=join(ROOT,'xsmb-505-actual-through-20261014.json');
const pad=n=>String(n).padStart(2,'0');
const dayPlus=d=>new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const now=new Date();
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const parts=Object.fromEntries(fmt.formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
const today=parts.year+'-'+parts.month+'-'+parts.day, time=parts.hour+':'+parts.minute;
if(time<'19:30')throw Error('lottery_pre_draw_refuse_'+time);
const lock=await open(join(ROOT,'daily-lock'),'wx').catch(e=>{throw Error('concurrent_or_stale_lock_'+e.code)});
try {
 let rows=JSON.parse(await readFile(HISTORY,'utf8').catch(e=>e.code==='ENOENT'?readFile(SEED,'utf8'):Promise.reject(e)));
 if(!Array.isArray(rows)||rows.length<500)throw Error('insufficient_seed');
 if(!rows.some(x=>x.draw_date===today&&x.region==='mb'&&x.station==='XSMB')){
   const results=await getXsDraws(today,'xsmb',['XSMB']);
   const d=results.XSMB;
   if(!d||!Array.isArray(d.all2)||d.all2.length!==27||!/^[0-9]{5}$/.test(d.special))throw Error('incomplete_result');
   rows.push({region:'mb',station:'XSMB',draw_date:today,all2:d.all2,source:'minhngoc.net.vn'});
   rows.sort((a,b)=>b.draw_date.localeCompare(a.draw_date));
   const temp=HISTORY+'.tmp.'+process.pid;
   await writeFile(temp,JSON.stringify(rows),{flag:'wx'});
   await rename(temp,HISTORY);
 }
 const target=dayPlus(today);
 const prior=rows.filter(x=>x.region==='mb'&&x.station==='XSMB'&&x.draw_date<target).sort((a,b)=>b.draw_date.localeCompare(a.draw_date)).slice(0,500);
 const pred=predictIndependentDaily({predictionDate:target,region:'mb',station:'XSMB',draws:prior,ganDaysLimit:10});
 if(pred.sourceLastDate!==today)throw Error('stale_history_refused');
 const snapshot={predictionDate:target,region:'mb',station:'XSMB',
    lotto3:pred.picks,doubles:pred.doubles,sourceDate:today,sourceDraws:500,
    model:pred.model,publication:'STAGING_UNPUBLISHED',previousForecastsUsed:false,
    generatedAt:now.toISOString()};
 const output=join(ROOT,'xsmb-'+target+'-staging.json');
 try {await writeFile(output,JSON.stringify(snapshot),{flag:'wx'})}
 catch(e){
   if(e.code!=='EEXIST')throw e;
   const old=JSON.parse(await readFile(output,'utf8'));
   if(JSON.stringify(old.lotto3)!==JSON.stringify(snapshot.lotto3)||
      JSON.stringify(old.doubles)!==JSON.stringify(snapshot.doubles)||
      old.sourceDate!==today)throw Error('locked_snapshot_conflict');
 }
 console.log('KQ247_XS_VPS_FRESH_STAGING',JSON.stringify(snapshot));
} finally {
 await lock.close();
 await import('node:fs/promises').then(m=>m.unlink(join(ROOT,'daily-lock')).catch(()=>{}));
}
