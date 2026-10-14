// Compile full18 real-source historical files into independent same-station 500-draw
// calibration and ONE last-station-draw predictions. Strictly PRIVATE; no publication.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {normalizedStationDraw} from './normalize-all-prizes.mjs';
import {forecastOneDrawAnd500Backtest} from './one-draw-500-method-selector.mjs';
const root=process.env.KQ247_STAGE_ROOT||'/stage',archive=join(root,'mtmn-full18-history-verified');
const targets=JSON.parse(await readFile(join(root,'mtmn-500-actual-targets.json'),'utf8'));
const schedule=JSON.parse(await readFile(join(root,'mtmn-station-weekly-draw-days.json'),'utf8')).stationWeekdays;
const grouped=new Map(),expected=new Map(),sha=x=>createHash('sha256').update(x).digest('hex');
if(targets.length<15000)throw Error('NO_REAL_500_DRAWS_PER_STATION');
for(const t of targets){
 const k=t.region+'|'+t.station,day=k+'|'+t.draw_date;
 expected.set(day,t);
 if(!grouped.has(k))grouped.set(k,new Map());
}
if(grouped.size!==35)throw Error('EXPECTED_EXACT_35_PROVINCIAL_STATIONS');
let verified=0;
for(const file of await readdir(archive)){
 if(!/^(mt|mn)-\d{4}-\d{2}-\d{2}\.json$/.test(file))continue;
 const json=JSON.parse(await readFile(join(archive,file),'utf8'));
 if(json.type!=='STATION_ARCHIVE_FULL18_VERIFIED_ONLY')throw Error('UNVERIFIED_ARCHIVE_RECORD_'+file);
 for(const row of json.records){
  const key=row.region+'|'+row.station,identity=key+'|'+row.draw_date;
  if(!expected.has(identity))throw Error('EXTRA_STATION_OR_DRAW_NOT_IN_REAL_HISTORY');
  const r=normalizedStationDraw(row);
  if(r.full_results.length!==18||r.full_results.reduce((n,x)=>n+x.length,0)!==82)throw Error('NOT_FULL_18_PRIZES');
  const table=grouped.get(key);
  if(table.has(r.draw_date))throw Error('DUPLICATE_ARCHIVE_SOURCE_'+identity);
  table.set(r.draw_date,r);verified++;
 }
}
const incomplete=[];
for(const [station,rows] of grouped){
 const keys=[...expected.keys()].filter(k=>k.startsWith(station+'|'));
 const wanted=keys.map(k=>k.split('|').at(-1)).sort().reverse().slice(0,500);
 const missing=wanted.filter(day=>!rows.has(day));
 if(missing.length)incomplete.push({station,verified:500-missing.length,missing:missing.length,first:missing[0]});
}
if(incomplete.length){
 console.log('MTMN_REAL_FULL18_500_STATION_GAPS',JSON.stringify({archivedDraws:verified,completeStations:35-incomplete.length,
  pendingStations:incomplete.length,examples:incomplete.slice(0,8)}));
 process.exit(4);
}
const nextDay=d=>new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const weekday=d=>new Date(d+'T12:00:00Z').getUTCDay();
const destination=join(root,'single-draw-backtest-private');
await mkdir(destination,{recursive:true});
let computed=0;
for(const [key,map] of grouped){
 const [region,station]=key.split('|');
 const history=[...map.values()].sort((a,b)=>b.draw_date.localeCompare(a.draw_date)).slice(0,500);
 if(history.length!==500)throw Error('FAILED_HISTORY_EXACT_500_'+station);
 const days=schedule[key];
 if(!Array.isArray(days)||!days.length)throw Error('MISSING_STATION_DRAW_SCHEDULE_'+station);
 let target=null,day=history[0].draw_date;
 for(let i=0;i<7;i++){day=nextDay(day);if(days.includes(weekday(day))){target=day;break;}}
 if(!target)throw Error('CANNOT_RESOLVE_REAL_NEXT_STATION_DRAW_DAY');
 const candidate=forecastOneDrawAnd500Backtest({history,region,station,predictionDate:target});
 if(candidate.station!==station||candidate.sourceDate!==history[0].draw_date||
   candidate.audit.bridgeSourceDrawCount!==1||candidate.audit.backtest500.realCompleteDraws!==500)
   throw Error('STATION_METHOD_PROVENANCE_FAILURE');
 const name=region+'-'+sha(key).slice(0,14)+'-'+target+'.json';
 const file=join(destination,name);
 const content=JSON.stringify({type:'PRIVATE_NOT_PUBLISHED',candidate})+'\n';
 try{await writeFile(file,content,{flag:'wx'});}
 catch(e){if(e.code!=='EEXIST'||await readFile(file,'utf8')!==content)throw Error('PRIVATE_IMMUTABLE_CONFLICT_'+station);}
 computed++;
}
console.log('MTMN_REAL_500_PER_STATION_ALL_SINGLE_PREVIOUS_DRAW_FORECASTS_PRIVATE_READY',JSON.stringify({stations:computed,archivedDraws:verified,oneDrawOnly:true,publicUpdated:false}));
