import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

// Regression contract for original main/client buttons and VPS staging.
// Runs without network, login, external dependencies, or changes to locked data.
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const main=read('deployment/football-original/public/index.html');
const customer=read('deployment/football-original/public/client.html');
const staging=read('deployment/football-staging/public/index.html');
const api=read('deployment/football-original/api/main-football.js');
const deploy=read('deployment/football-staging/deploy.sh');
const scripts=html=>[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(m=>!/type\s*=\s*["']application\/ld\+json["']/i.test(m[1]))
  .map(m=>m[2]).filter(s=>s.trim());

test('all public inline scripts parse (main, client, staging)',()=>{
 for(const [label,html] of [['main',main],['client',customer],['staging',staging]]){
  for(const source of scripts(html)) assert.doesNotThrow(()=>new Script(source),label);
 }
});
test('20/30/all buttons invoke correct limits on main and customer',()=>{
 for(const page of [main,customer]){
  assert.match(page,/onclick="load\(20\)"/);
  assert.match(page,/onclick="load\(30\)"/);
  assert.match(page,/onclick="load\((?:5000|100000)\)"/);
  assert.match(page,/onclick="refreshCurrent\(\)"/);
  assert.match(page,/onclick="toggleCollapse\(\)"/);
  assert.match(page,/onclick="loadFeatured\([^"]*\)"/);
  for(const [n,label] of [[20,'20'],[30,'30']]){
   assert.ok(page.includes("copyMode("+n+", 'all', '"+label+" TRẬN')"));
  }
  assert.ok(page.includes("copyMode(5000, 'featured'"));
  assert.ok(page.includes("copyMode(5000, 'all'"));
 }
});
test('featured, search, copy, and refresh preserve user-selected mode',()=>{
 for(const page of [main,customer]){
  assert.match(page,/return load\([^)]*, 'featured'\)/);
  assert.match(page,/return load\(current, currentMode\)/);
  assert.match(page,/await fetchMode\(n, mode\)/);
  assert.match(page,/await cp\(a\.map\(/);
  assert.match(page,/const s = \(\$\('q'\)\.value/);
  assert.match(page,/if \(!String\(t \|\| ''\)\.trim\(\)\) throw Error/);
 }
 assert.match(customer,/if \(!navigator\.clipboard\?\.writeText\)/);
 assert.match(customer,/const ok = document\.execCommand\('copy'\)/);
 assert.match(customer,/&from_ts=' \+ Date\.now\(\)/);
});
test('only requested fixtures are hidden; limit filtering precedes cutoff selection',()=>{
 assert.ok(api.includes('userExcludedIds=new Set(["3102824","3102993"])'));
 assert.match(api,/const upcoming=picks\.filter\(x=>.*!isUserExcluded\(x\)/);
 assert.ok(api.includes('.slice(0,limit).map(x=>toLegacy'));
 assert.ok(deploy.includes('len(predictions)==min(requested,total)'));
 assert.ok(!deploy.includes('len(d.get("predictions",[]))==30'));
});
test('staging history shows started games only; preview is a separate switch',()=>{
 for(const code of ['data-count="all"','data-count="20"','data-count="30"','id="archive"','id="native-preview"','id="reload"']){
  assert.ok(staging.includes(code),code);
 }
 assert.ok(staging.includes("state.history?d.predictions.filter(p=>Number(p.ts)>0&&Number(p.ts)<=Date.now())"));
 assert.ok(staging.includes("state.preview?'1':'0'"));
 assert.ok(staging.includes("state.history?'all':state.count"));
 assert.ok(staging.includes("root.innerHTML=showing.map(card)"));
});

test('client always queries exact canonical main prediction API and reports single COPY outcomes',()=>{
 assert.ok(customer.includes("PICKS_API = 'https://64-120-92-172.sslip.io/api/main-football?data=1'"));
 assert.ok(customer.includes("'&mode=' + encodeURIComponent(mode)"));
 assert.ok(customer.includes("'✅ Đã copy trận '"));
});

test('default main and native endpoints use current-day native preview instead of yesterday locked data',()=>{
 assert.match(api,/r55_native_preview_["']?\+calendarDay/);
 assert.ok(api.includes('const latest=verifiedSnapshots.find(x=>x.day===calendarDay)'));
 assert.ok(api.includes('const fresh=latest?null:'));
 assert.ok(api.includes('date:displayDay'));
 const native=read('deployment/football-native/publicApi.mjs');
 assert.ok(native.includes('today_prediction_not_ready'));
 assert.ok(native.includes('r55_native_preview_'+String.fromCharCode(34)+'+currentDay'));
 assert.ok(native.includes('source_detail:\x27native_live_preview_unlocked\x27'));
 assert.ok(!native.includes('legacy_locked_snapshot_fallback'));
});

test('featured matches use the exact same major-league rule in both VPS API engines',()=>{
 const native=read('deployment/football-native/publicApi.mjs');
 const extracted=source=>source.split('const leagueTier=x=>{')[1]?.split('\n};')[0];
 assert.ok(extracted(native));
 assert.equal(extracted(native),extracted(api));
 assert.ok(native.includes('top=leagueTier(m)>0'));
 assert.ok(api.includes('const priority=x=>leagueTier(x)>0'));
});

test('group bot uses current-day locked or latest preview, never yesterday predictions',()=>{
 const bot=read('deployment/football-bots/group-worker.mjs');
 assert.ok(bot.includes("WHERE day=$1::date AND source='bongdalu-r55'"));
 assert.ok(bot.includes("'r55_native_preview_'+day"));
 assert.ok(bot.includes("'r55_provisional_'+day"));
 assert.ok(bot.includes("today_bongdalu_predictions_not_ready"));
 assert.ok(!bot.includes("day>=($1::date-interval '1 day')"));
});
