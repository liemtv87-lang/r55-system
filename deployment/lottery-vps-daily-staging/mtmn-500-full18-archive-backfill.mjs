// KQ247 historical full-prize acquisition (staging, append-only, read-only public sources).
// Works per date/region against 500 actual same-station draw dates supplied by Neon.
// Never updates live DB, customer HTML, public locks, or Telegram.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fetchAllOfficialDraws} from './minhngoc-all-stations.mjs';
import {normalizedStationDraw} from './normalize-all-prizes.mjs';
const root=process.env.KQ247_STAGE_ROOT||'/stage',input=join(root,'mtmn-500-actual-targets.json');
const dest=join(root,'mtmn-full18-history-verified'),quarantine=join(root,'mtmn-full18-history-quarantine');
const max=Number(process.argv.find(x=>x.startsWith('--max='))?.slice(6)||'35');
if(!Number.isSafeInteger(max)||max<1||max>250)throw Error('MAX_BATCH_1_TO_250');
const raw=JSON.parse(await readFile(input,'utf8'));
if(!Array.isArray(raw)||raw.length<15000)throw Error('NOT_ALL_HISTORIC_STATION_DATES_SUPPLIED');
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
const alias=s=>{const v=norm(s);return ['tphcm','thanhphohochiminh','thanhphohcm','hochiminh'].includes(v)?'tphcm':['thuathienhue','hue'].includes(v)?'hue':v;};
const groups=new Map(),seen=new Set(),stations=new Map();
for(const row of raw){
 if(!['mt','mn'].includes(row.region)||!/^\d{4}-\d{2}-\d{2}$/.test(row.draw_date)||
   !Array.isArray(row.all2)||row.all2.length!==18||row.all2.some(x=>typeof x!=='string'||!/^\d{2}$/.test(x)))
   throw Error('UNTRUSTED_NEON_HISTORICAL_INPUT');
 const key=row.region+'|'+row.station+'|'+row.draw_date;
 if(seen.has(key))throw Error('DUPLICATE_NEON_STATION_HISTORY');seen.add(key);
 const ident=row.region+'|'+row.station;
 stations.set(ident,(stations.get(ident)||0)+1);
 const group=row.region+'|'+row.draw_date;
 if(!groups.has(group))groups.set(group,[]);
 groups.get(group).push(row);
}
if(stations.size!==35||[...stations.values()].some(n=>n<500))
 throw Error('REQUIRE_500_HISTORICAL_DATES_PER_EACH_OF_35_STATIONS');
await mkdir(dest,{recursive:true});
await mkdir(quarantine,{recursive:true});
const reversePrizeGroups=full=>{
 let i=0;
 const a=[1,1,3,1,7,2,1,1,1].map(len=>{const part=full.slice(i,i+len);i+=len;return part});
 if(i!==18)throw Error('INVALID_18_GROUP_ORDER');
 return a.reverse().flat().map(x=>x.slice(-2));
};
let complete=0,skipped=0,failed=0,attempted=0;
const errors=[];
for(const [group,expect] of [...groups].sort((a,b)=>b[0].split('|')[1].localeCompare(a[0].split('|')[1])||a[0].localeCompare(b[0]))){
 const [region,day]=group.split('|');
 const file=join(dest,region+'-'+day+'.json'),bad=join(quarantine,region+'-'+day+'.json');
 if(existsSync(file)||existsSync(bad)){skipped++;continue;}
 if(attempted>=max)break;
 attempted++;
 let found;
 for(let tries=1;tries<=3;tries++){
  try{found=await fetchAllOfficialDraws(day,region);break;}
  catch(e){if(tries===3)errors.push({group,reason:'source_'+String(e.message).slice(0,90)});else await new Promise(r=>setTimeout(r,tries*1700));}
 }
 if(!found){failed++;await writeFile(bad,JSON.stringify({group,error:errors.at(-1)?.reason||'FETCH_FAILED'})+'\n',{flag:'wx'});continue;}
 try{
  const record=[];
  for(const item of expect){
   const x=found.find(v=>alias(v.source_station)===alias(item.station));
   if(!x)throw Error('MISSING_SAME_STATION_'+item.station);
   const actual=normalizedStationDraw({...x,station:item.station});
   if(actual.region!==region||actual.draw_date!==day||actual.full_results.length!==18||
     actual.full_results.join('') .length!==82)
    throw Error('INCOMPLETE_ARCHIVE_RESULT_'+item.station);
   const fromDatabase=reversePrizeGroups(actual.full_results);
   const stored=JSON.stringify(item.all2);
   const prizeFirst=JSON.stringify(actual.all2),dbFirst=JSON.stringify(fromDatabase);
   if(stored!==prizeFirst&&stored!==dbFirst)
    throw Error('HISTORICAL_ENDINGS_MISMATCH_BOTH_ORDERS_'+item.station);
   record.push({region,station:item.station,draw_date:day,full_results:actual.full_results,
    all2:actual.all2,special:actual.special,source:'minhngoc.net.vn',source_url:x.source_url});
  }
  const payload=JSON.stringify({type:'STATION_ARCHIVE_FULL18_VERIFIED_ONLY',group,records:record})+'\n';
  await writeFile(file,payload,{flag:'wx'});complete++;
 }catch(e){failed++;const reason=String(e.message).slice(0,100);errors.push({group,reason});await writeFile(bad,JSON.stringify({group,error:reason})+'\n',{flag:'wx'});}
 await new Promise(r=>setTimeout(r,1100));
}
console.log('MTMN_500_FULL18_ARCHIVE_PROGRESS',JSON.stringify({stations:stations.size,totalDrawRows:raw.length,
 groupedSourceDates:groups.size,attempted,verifiedGroups:complete,alreadyVerified:skipped,failed,
 firstErrors:errors.slice(0,12),writesOnlyToPrivateArchive:true}));
if(attempted && complete===0)process.exitCode=2;
