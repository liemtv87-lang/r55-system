import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {predictFromPreviousStationDraw} from './previous-station-draw-only.mjs';
import {normalizedStationDraw} from './normalize-all-prizes.mjs';

const root=new URL('./',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const rows=(await read('mtmn-35stations-prior-draw-samples.json')).stations;
const supplement=(await read('verified-five-stations-full-results-20261014.json')).stations;
assert.equal(supplement.length,5);
const grouped=new Map();
for(const x of rows){
 const id=x.region+'|'+x.station;
 if(!grouped.has(id))grouped.set(id,[]);
 grouped.get(id).push(x);
}
assert.equal(grouped.size,35);
for(const x of supplement){
 const id=x.region+'|'+x.station;
 assert(grouped.has(id),'station identity present '+id);
 assert.deepEqual(x.full_results.map(n=>n.slice(-2)),x.all2);
 assert.equal(x.special,x.full_results[17]);
 grouped.get(id).push(x);
}
let passed=0;
const seenDigests=new Set();
for(const [id,raw] of grouped){
 const [region,station]=id.split('|');
 const history=[...raw].sort((a,b)=>b.draw_date.localeCompare(a.draw_date));
 const mostRecent=history[0];
 assert.equal(mostRecent.station,station);
 const canonical=normalizedStationDraw(mostRecent);
 assert.equal(canonical.full_results.length,18);
 assert.equal(canonical.full_results.reduce((n,s)=>n+s.length,0),82);
 const forecast=predictFromPreviousStationDraw({predictionDate:'2026-10-15',region,station,previousDraw:mostRecent,
   exclusionHistory:history.slice(0,11)});
 assert.equal(forecast.sourceDate,mostRecent.draw_date);
 assert.equal(forecast.audit.bridgeSourceStation,station);
 assert.equal(forecast.audit.bridgeSourceDrawCount,1);
 assert.equal(forecast.audit.coveredPositions,82);
 assert.equal(forecast.lotto3.length,3);
 assert.equal(forecast.doubles.length,2);
 assert.equal(forecast.dan50.length,50);
 assert.equal(forecast.dan60.length,60);
 assert.equal(forecast.dan75.length,75);
 assert.equal(forecast.three_digit.length,500);
 assert(forecast.three_digit.every(x=>forecast.dan75.includes(x.slice(-2))));
 assert.equal(forecast.previousForecastsUsed,false);
 if(supplement.some(x=>x.station===station&&x.region===region))
  assert.equal(forecast.sourceDate,'2026-10-14');
 const another={...history[1],station:'INCORRECT-STATION'};
 assert.throws(()=>predictFromPreviousStationDraw({predictionDate:'2026-10-15',region,station,
  previousDraw:mostRecent,exclusionHistory:[mostRecent,another,...history.slice(2,11)]}),/MIXED_STATIONS/);
 const fingerprint=id+'|'+forecast.sourceSHA256;
 assert(!seenDigests.has(fingerprint));
 seenDigests.add(fingerprint);
 passed++;
}
assert.equal(passed,35);
console.log('ALL_35_STATIONS_UNIT_PROOF_SUCCESS',JSON.stringify({stations:passed,fullPrizes:18,positions:82,
 supplementStations:supplement.map(x=>x.station),sourceOnlyOwnStation:true}));
