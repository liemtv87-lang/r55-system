// KQ247 station-isolated actual results refresh, no history scores, no backtest.
// Uses each station's own latest actual and fixed weekly schedule, never another station.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {fetchAllOfficialDraws} from './minhngoc-all-stations.mjs';
import {normalizedStationDraw} from './normalize-all-prizes.mjs';
const root='/stage';
const seed=JSON.parse(await readFile(root+'/mtmn-35-latest-each-station-one-draw-verified.json','utf8')).draws;
const weekdays=JSON.parse(await readFile(root+'/mtmn-station-weekly-draw-days.json','utf8')).stationWeekdays;
const stateFile=root+'/mtmn-one-draw-actual-latest.json';
let previous;
try{previous=JSON.parse(await readFile(stateFile,'utf8')).draws}catch(e){if(e.code!=='ENOENT')throw e;previous=seed;}
const fixed=(r)=>r.region+'|'+r.station;
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
const alias=x=>{const k=norm(x);return ['thanhphohcm','thanhphohochiminh','tphochiminh','hochiminh','tphcm'].includes(k)?'tphcm':['thuathienhue','hue'].includes(k)?'hue':k;};

const rows=new Map();
for(const r of previous){
 const key=fixed(r);
 if(rows.has(key)||!weekdays[key]||r.full_results?.length!==18||r.all2?.length!==18||
    r.full_results.some((n,i)=>!(/^\d{2,6}$/.test(n))||n.slice(-2)!==r.all2[i]))throw Error('INVALID_LATEST_SOURCE_'+key);
 rows.set(key,r);
}
if(rows.size!==35)throw Error('NEED_EXACT_35_MT_MN_STATIONS');
const nowparts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',
 month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date())
 .filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
const localDate=nowparts.year+'-'+nowparts.month+'-'+nowparts.day;
const delta=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const cutoff=(nowparts.hour+':'+nowparts.minute)>='19:30'?localDate:delta(localDate,-1);
function nextDate(row){
 const days=weekdays[fixed(row)],wd=new Date(row.draw_date+'T12:00:00Z').getUTCDay();
 if(!Array.isArray(days)||!days.length)throw Error('INVALID_DRAW_SCHEDULE');
 for(let n=1;n<=7;n++)if(days.includes((wd+n)%7))return delta(row.draw_date,n);
 throw Error('NO_NEXT_STATION_DRAW');
}
let targets=[];
for(const r of rows.values()){
 let x=r;
 for(let i=0;i<3;i++){
  const date=nextDate(x);
  if(date>cutoff)break;
  targets.push({region:r.region,station:r.station,date});
  x={...x,draw_date:date};
 }
}
const grouped=new Map();
for(const t of targets){
 const key=t.region+'|'+t.date;
 (grouped.get(key)??(grouped.set(key,[]),grouped.get(key))).push(t.station);
}
const refreshed=[];
for(const [key,stations] of grouped){
 const [region,date]=key.split('|');
 let got,err;
 for(let attempt=1;attempt<=3;attempt++){
  try{got=await fetchAllOfficialDraws(date,region);break}catch(e){err=e;}
 }
 if(!got)throw Error('REQUIRED_ALL_STATIONS_DRAW_UNAVAILABLE_'+key+'_'+String(err?.message).slice(0,100));
 const expected=new Map();
 for(const station of stations){
  const normalized=alias(station);
  if(expected.has(normalized))throw Error('AMBIGUOUS_STATION_ALIAS_'+key+'_'+station);
  expected.set(normalized,station);
 }
 const matched=new Map();
 for(const source of got){
  const station=expected.get(alias(source.source_station));
  if(!station)continue;
  if(matched.has(station))throw Error('DUPLICATED_SOURCE_STATION_'+key+'_'+station);
  const clean=normalizedStationDraw({...source,region,station,draw_date:date});
  if(clean.full_results.length!==18||clean.full_results.some((n,i)=>n.slice(-2)!==clean.all2[i]))
   throw Error('INCOMPLETE_ACTUAL_'+key+'_'+station);
  matched.set(station,clean);
 }
 if(matched.size!==stations.length)
  throw Error('MISSING_REAL_STATIONS_'+key+'_'+stations.filter(n=>!matched.has(n)).join(','));
 for(const station of stations){
  const g=matched.get(station),old=rows.get(region+'|'+station);
  if(old.draw_date>=date)continue;
  const row={region,station,draw_date:date,special:g.special,all2:g.all2,full_results:g.full_results,
   source:'minhngoc.net.vn',source_url:g.source_url};
  rows.set(region+'|'+station,row);
  refreshed.push({region,station,source:date,prizes:g.full_results.length});
 }
}
const all=[...rows.values()].sort((a,b)=>a.region.localeCompare(b.region)||a.station.localeCompare(b.station));
for(const row of all)if(nextDate(row)<=cutoff)throw Error('STALE_STATION_SOURCE_'+fixed(row)+'_'+row.draw_date);
const content=JSON.stringify({source:'ONE_REAL_DRAW_PER_STATION_VPS_VALIDATED',updatedAt:new Date().toISOString(),draws:all});
if(refreshed.length||previous===seed){
 const tmp=stateFile+'.pending.'+process.pid;
 await writeFile(tmp,content,{flag:'wx'});
 await rename(tmp,stateFile);
}
console.log('STATION_ACTUALS_ONE_PREVIOUS_DRAW_REFRESHED',JSON.stringify({cutoff,stations:all.length,refreshed,totalFetched:targets.length,details:refreshed}));
