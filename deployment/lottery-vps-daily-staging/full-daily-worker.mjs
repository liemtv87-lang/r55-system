// Independent daily XSMB full staging: 500 factual results, 1000x3 DE methods.
// Fail closed on missing actual result; no previous forecasts are used.
import {readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {predictIndependentDaily} from './independent500.mjs';
import {calculateDeDaily} from './de-1000-consensus.mjs';
import {getXsDraws} from './minhngoc-draw.mjs';
const ROOT='/stage', HISTORY=join(ROOT,'xsmb-history-live.json');
const now=new Date();
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const parts=Object.fromEntries(fmt.formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
const localCalendarDate=parts.year+'-'+parts.month+'-'+parts.day;
const time=parts.hour+':'+parts.minute;
const plusDay=d=>new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const previousDay=d=>new Date(Date.parse(d+'T12:00:00Z')-86400000).toISOString().slice(0,10);
// Before 19:30, latest completed draw is YESTERDAY; never attempt today's unfinished draw.
const today=time<'19:30'?previousDay(localCalendarDate):localCalendarDate;
const target=plusDay(today);
const lockPath=join(ROOT,'full-daily-lock');
const lock=await open(lockPath,'wx').catch(e=>{throw Error('ANOTHER_DAILY_RUN_OR_STALE_LOCK_'+e.code)});
try{
 let rows=JSON.parse(await readFile(HISTORY,'utf8'));
 if(rows.length<500)throw Error('MISSING_500_HISTORICAL_DRAWS');
 let todays=rows.filter(x=>x.region==='mb'&&x.station==='XSMB'&&x.draw_date===today);
 if(todays.length>1)throw Error('DUPLICATE_LATEST_DAY');
 if(!todays.length || !/^\d{5}$/.test(todays[0].special||'')){
  const current=(await getXsDraws(today,'xsmb',['XSMB'])).XSMB;
  if(!current||current.all2.length!==27||!/^\d{5}$/.test(current.special))throw Error('INCOMPLETE_NEW_RESULTS');
  if(todays.length){
   if(JSON.stringify(todays[0].all2)!==JSON.stringify(current.all2))throw Error('EXISTING_NEW_RESULT_MISMATCH');
   todays[0].special=current.special;
  }else rows.push({draw_date:today,region:'mb',station:'XSMB',all2:current.all2,special:current.special,source:'minhngoc.net.vn'});
  rows.sort((a,b)=>b.draw_date.localeCompare(a.draw_date));
  const tmp=HISTORY+'.pending.'+process.pid;
  await writeFile(tmp,JSON.stringify(rows),{flag:'wx'});
  await rename(tmp,HISTORY);
 }
 const past=rows.filter(x=>x.region==='mb'&&x.station==='XSMB'&&x.draw_date<target).sort((a,b)=>b.draw_date.localeCompare(a.draw_date)).slice(0,500);
 if(past.length!==500||past[0].draw_date!==today||past.some(x=>!/^\d{5}$/.test(x.special||'')))throw Error('HISTORY_NOT_FRESH_OR_NO_SPECIAL');
 const lotto=predictIndependentDaily({predictionDate:target,region:'mb',station:'XSMB',draws:past,ganDaysLimit:10});
 const de=calculateDeDaily({predictionDate:target,draws:past});
 if(de.sourceDate!==lotto.sourceLastDate)throw Error('DE_LOTTO_SOURCE_DAY_CONFLICT');
 const full={predictionDate:target,region:'mb',station:'XSMB',lotto3:lotto.picks,doubles:lotto.doubles,
  de,sourceDate:today,sourceDraws:500,model:'KQ247_500_DAILY_LOTTO_PLUS_DE1000_V1',
  publication:'STAGING_UNPUBLISHED',previousForecastsUsed:false,generatedAt:now.toISOString()};
 const file=join(ROOT,'xsmb-'+target+'-full-staging.json');
 try{await writeFile(file,JSON.stringify(full),{flag:'wx'});}
 catch(e){
  if(e.code!=='EEXIST')throw e;
  const prev=JSON.parse(await readFile(file,'utf8'));
  if(JSON.stringify(prev.lotto3)!==JSON.stringify(full.lotto3)
   ||JSON.stringify(prev.doubles)!==JSON.stringify(full.doubles)
   ||JSON.stringify(prev.de)!==JSON.stringify(full.de)
   ||prev.sourceDate!==full.sourceDate)throw Error('FULL_SNAPSHOT_IMMUTABLE_CONFLICT');
 }
 console.log('XSMB_FRESH_FULL_STAGING_OK',JSON.stringify({target,sourceDate:today,lotto3:full.lotto3,doubles:full.doubles,
  rejectHead:de.hard_excluded_head,rejectHundred:de.three_digit_hard_excluded_hundred,
  methods:de.method_counts,poolSizes:[de.dan50.length,de.dan60.length,de.dan75.length,de.three_digit.length]}));
}finally{await lock.close();await unlink(lockPath).catch(()=>{});}
