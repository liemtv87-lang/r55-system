// Stage only: independently compute each station from that station's most recent
// actual complete result. 500-draw backtesting is not required or performed.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {predictFromPreviousStationDraw} from './previous-station-draw-only.mjs';
import {fetchAllOfficialDraws} from './minhngoc-all-stations.mjs';
const ROOT='/stage',archive=JSON.parse(await readFile(join(ROOT,'mtmn-35stations-prior-draw-samples.json'),'utf8'));
const samples=archive.stations;
const mb=JSON.parse(await readFile(join(ROOT,'xsmb-history-live.json'),'utf8'))
 .filter(x=>x.region==='mb'&&x.station==='XSMB').sort((a,b)=>b.draw_date.localeCompare(a.draw_date)).slice(0,15);
const stations=new Map();
for(const row of [...samples,...mb]){
 const id=row.region+'|'+row.station;
 if(!stations.has(id))stations.set(id,[]);
 stations.get(id).push(row);
}
if(stations.size!==36)throw Error('MISSING_STATIONS_'+stations.size);
const normalize=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d')
 .toLowerCase().replace(/[^a-z0-9]/g,'');
const aliased=x=>{
 const n=normalize(x);
 if(['thanhphohcm','thanhphohochiminh','tphochiminh','tphcm'].includes(n))return 'tphcm';
 if(['thuathienhue','hue'].includes(n))return 'hue';
 return n;
};
const stationNames=new Map([...stations.keys()].map(id=>{
 const [region,station]=id.split('|');return [region+'|'+aliased(station),id];
}));
const dateShift=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const vn=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',
 month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
 .formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
const nowDate=vn.year+'-'+vn.month+'-'+vn.day;
const completedDate=(vn.hour+':'+vn.minute)>='19:30'?nowDate:dateShift(nowDate,-1);
const offline=process.argv.includes('--offline');
const affected=new Set();
if(!offline){
 const queries=[];
 for(let delta=7;delta>=0;delta--)for(const region of ['mt','mn'])
  queries.push({day:dateShift(completedDate,-delta),region});
 for(let i=0;i<queries.length;i+=4){
  const jobs=await Promise.allSettled(queries.slice(i,i+4).map(async q=>{
   const result=await fetchAllOfficialDraws(q.day,q.region);
   return {q,result};
  }));
  for(const j of jobs){
   if(j.status!=='fulfilled'){console.error('SOURCE_DATE_UNAVAILABLE',String(j.reason?.message||j.reason));continue;}
   for(const fresh of j.value.result){
    const id=stationNames.get(fresh.region+'|'+aliased(fresh.source_station));
    if(!id){console.error('UNKNOWN_LIVE_STATION',fresh.region,fresh.source_station);continue;}
    const old=stations.get(id),matching=old.find(r=>r.draw_date===fresh.draw_date);
    if(matching){
     if(matching.all2.length!==fresh.all2.length||matching.all2.some((v,n)=>v!==fresh.all2[n]))
      throw Error('PRIZE_SOURCE_CONFLICT_'+id+'_'+fresh.draw_date);
     if(!matching.full_results)matching.full_results=fresh.full_results;
    }else{
     old.push({...fresh,station:id.split('|')[1]});
     affected.add(id);
    }
   }
  }
 }
}
const runDir=join(ROOT,'station-next-private');
await mkdir(runDir,{recursive:true});
const completed=[];
const rejected=[];
for(const [id,list] of stations){
 const [region,station]=id.split('|');
 const draws=[...list].sort((a,b)=>b.draw_date.localeCompare(a.draw_date))
  .filter((x,i,a)=>!i||x.draw_date!==a[i-1].draw_date);
 if(draws.length<11){rejected.push({station:id,error:'INSUFFICIENT_11_STATION_DRAWS_FOR_GAN'});continue;}
 const latest=draws[0];
 if(!latest.full_results){rejected.push({station:id,error:'MISSING_LATEST_FULL_PRIZES'});continue;}
 const lag=(Date.parse(completedDate)-Date.parse(latest.draw_date))/86400000;
 if(lag<0||lag>7){rejected.push({station:id,error:'SOURCE_TOO_OLD_'+latest.draw_date});continue;}
 const weekly=new Set(draws.slice(0,11).map(x=>new Date(x.draw_date+'T12:00:00Z').getUTCDay()));
 let target=null;
 for(let step=1;step<=8;step++){
  const candidate=dateShift(completedDate,step);
  if(region==='mb'||weekly.has(new Date(candidate+'T12:00:00Z').getUTCDay())){target=candidate;break;}
 }
 if(!target){rejected.push({station:id,error:'CANNOT_INFER_NEXT_DRAW_DAY'});continue;}
 try{
  const prediction=predictFromPreviousStationDraw({predictionDate:target,region,station,
   previousDraw:latest,exclusionHistory:draws.slice(0,11)});
  const snapshot={
   ...prediction,sourceType:'OFFICIAL_FULL_PRIZE_PREVIOUS_STATION_DRAW',
   targetDayProvenance:region==='mb'?'daily_station_schedule':'inferred_from_last_11_station_draw_weekdays',
   publication:'PRIVATE_LOCKED_STAGING',calculatedAt:new Date().toISOString()
  };
  const hashed=createHash('sha256').update(id).digest('hex').slice(0,14);
  const out=join(runDir,region+'-'+hashed+'-'+latest.draw_date+'.json');
  try{await writeFile(out,JSON.stringify(snapshot),{flag:'wx'});}
  catch(e){
   if(e.code!=='EEXIST')throw e;
   const before=JSON.parse(await readFile(out,'utf8'));
   for(const key of ['sourceSHA256','lotto3','doubles','dan50','dan60','dan75','three_digit'])
    if(JSON.stringify(before[key])!==JSON.stringify(snapshot[key]))
     throw Error('IMMUTABLE_PRIVATE_STATION_CONFLICT_'+id);
  }
  completed.push({region,station,source:latest.draw_date,target,prizes:prediction.sourcePrizes,positions:prediction.digitPositions,file:out});
 }catch(e){rejected.push({station:id,error:String(e.message).slice(0,140)});}
}
console.log('KQ247_ALL_STATIONS_NEXT_PRIVATE',JSON.stringify({completed:completed.length,rejected:rejected.length,
 latestSourceAsOf:completedDate,offline,affected:[...affected],examples:completed.slice(0,5),errors:rejected}));
if(rejected.length)process.exitCode=2;
