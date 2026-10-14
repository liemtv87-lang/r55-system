// Independent historical-source proof. No database mutations, no forecasts sent.
import assert from 'node:assert/strict';
import {fetchAllOfficialDraws} from './minhngoc-all-stations.mjs';
const rows=await fetchAllOfficialDraws('2016-11-03','mn');
const an=rows.find(x=>x.source_key==='angiang');
assert(an,'An Giang missing from true 2016 source');
assert.equal(an.full_results.length,18);
assert.equal(an.full_results[0],'42');
assert.equal(an.full_results.at(-1),'272551');
assert.equal(an.special,'272551');
assert.equal(an.full_results.map(x=>x.length).reduce((a,b)=>a+b,0),82);
const lengths=[1,1,3,1,7,2,1,1,1];
let offset=0;
const groups=lengths.map(n=>{const result=an.full_results.slice(offset,offset+n);offset+=n;return result});
const dbFirst=groups.reverse().flat().map(x=>x.slice(-2));
assert.deepEqual(dbFirst,['51','95','70','09','07','78','08','43','44','33','77','04','14','69','51','52','57','42']);
console.log('REAL_2016_MT_MN_ARCHIVE_FULL_18_PRIZE_VALID=PASS');
console.log('NEON_DB_FIRST_ENDINGS_ORDER_NORMALIZED=PASS');
