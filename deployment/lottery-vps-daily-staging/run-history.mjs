import {readFileSync} from 'node:fs';
import {predictIndependentDaily} from './independent500.mjs';

const file=process.argv[2];
if(!file)throw new Error('history_json_required');
const rows=JSON.parse(readFileSync(file,'utf8'));
if(!Array.isArray(rows))throw new Error('invalid_history');
for(const day of ['2026-10-11','2026-10-15']){
 const hist=rows.filter(x=>x.region==='mb'&&x.station==='XSMB'&&x.draw_date<day)
   .sort((a,b)=>b.draw_date.localeCompare(a.draw_date)).slice(0,500);
 const result=predictIndependentDaily({predictionDate:day,region:'mb',station:'XSMB',draws:hist,ganDaysLimit:10});
 if(result.sourceDraws!==500 || result.sourceLastDate>=day)throw new Error('source_guard_failed');
 if(day==='2026-10-11'&&result.picks.join(',')!=='35,51,75')throw new Error('original_day11_mismatch:'+result.picks.join(','));
 console.log('KQ247_XS_VPS_LOCAL_REPLAY',JSON.stringify({day,picks:result.picks,doubles:result.doubles,sourceDate:result.sourceLastDate,sourceDraws:result.sourceDraws,previousForecastsUsed:false}));
}
