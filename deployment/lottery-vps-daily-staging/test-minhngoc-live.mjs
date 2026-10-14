import assert from 'node:assert/strict';
import {fetchAllOfficialDraws} from './minhngoc-all-stations.mjs';
import {readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(new URL('./verified-five-stations-full-results-20261014.json',import.meta.url)));
const failures=[],checks=[];
for(const region of ['mt','mn']){
 try{
  const results=await fetchAllOfficialDraws('2026-10-14',region);
  for(const expected of fixture.stations.filter(x=>x.region===region)){
   const norm=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
   const found=results.find(x=>norm(x.source_station)===norm(expected.station));
   assert(found,'missing_'+expected.station);
   assert.deepEqual(found.full_results,expected.full_results,'18 full prizes mismatch for '+expected.station);
   checks.push(expected.station);
  }
 }catch(e){failures.push({region,error:String(e.message)});}
}
console.log('LIVE_OFFICIAL_20261014_FULL_PRIZE_PROBE',JSON.stringify({checked:checks,failed:failures}));
if(failures.length||checks.length!==5)process.exitCode=1;
