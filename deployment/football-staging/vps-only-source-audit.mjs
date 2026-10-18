// Run on the VPS against the candidate checkout. Read-only source inspection.
// node deployment/football-staging/vps-only-source-audit.mjs
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=async p=>readFile(resolve(root,p),'utf8');
const files=Object.fromEntries(await Promise.all([
 'deployment/football-staging/Caddyfile',
 'deployment/football-original/server.mjs',
 'deployment/football-original/api/main-football.js',
 'deployment/football-native/publicApi.mjs',
 'deployment/football-bots/group-worker.mjs',
 'deployment/sales-bot/worker.mjs',
 'deployment/football-original/public/client.html',
].map(async p=>[p,await read(p)])));
const find=p=>files['deployment/'+p];
let failures=0;
function verify(name,condition){
 const ok=Boolean(condition);
 console.log((ok?'PASS':'BLOCK')+':'+name);
 if(!ok)failures++;
}
const caddy=find('football-staging/Caddyfile');
const routes=[...caddy.matchAll(/handle\s+\/api\/main-football\s*\{([^{}]*)\}/g)];
verify('one_canonical_public_api_route',routes.length===1 &&
  routes[0][1].trim()==='reverse_proxy football-original:3002');
verify('vps_customer_auth_reverse_proxy',/handle_path\s+\/api\/customer-auth\/\*\s*\{\s*reverse_proxy\s+kq247-customer-auth-fixed-20261018:3039\s*\}/.test(caddy));
const server=find('football-original/server.mjs');
verify('no_legacy_snapshot_fallback_in_primary',!/readExistingLockedMirror|football-cache:3000|neon_locked_snapshot/.test(server));
const main=find('football-original/api/main-football.js');
verify('one_locked_source_in_primary',main.includes('source==="bongdalu-r55"&&!!x.locked_at') &&
  main.includes('snapshot_id:snapshotId') && main.includes('const preRelease=false'));
verify('no_public_provisional_or_unlocked_forecast',!/r55_provisional_|draft\.rows|preRelease\?/.test(main));
const native=find('football-native/publicApi.mjs');
verify('native_no_external_fallback',!/football-cache:3000|neon_locked_snapshot|legacy_locked_snapshot_fallback|async function legacy\(/.test(native));
const bot=find('football-bots/group-worker.mjs');
verify('separate_football_bot_token',bot.includes('process.env.R55_GROUP_BOT_TOKEN') &&
  !bot.includes('process.env.TELEGRAM_LOTTERY_BOT_TOKEN'));
verify('single_bot_locked_payload_cache',bot.includes('canonicalLockedSnapshot(day)') &&
  bot.includes('source=\'bongdalu-r55\' AND locked_at IS NOT NULL'));
const sales=find('sales-bot/worker.mjs');
verify('vps_only_sales_database',sales.includes('SALES_DATABASE_URL') &&
  sales.includes('KQ247_SALES_DATABASE_MUST_BE_VPS_LOCAL') &&
  !sales.includes('process.env.NEON_DATABASE_URL'));
verify('no_external_payment_runtime',!/PAYOS_BRIDGE_URL|createRemotePayosCheckout|tool-sales-bot\.onrender\.com/.test(sales));
const customer=find('football-original/public/client.html');
verify('vps_customer_auth_origin',customer.includes('https://64-120-92-172.sslip.io/api/customer-auth/') &&
  !customer.includes('compute.c-3.ap-southeast-1.aws.neon.tech'));
verify('one_customer_snapshot_read',customer.includes('if (!SNAPSHOT_REQUEST)') &&
  customer.includes('SNAPSHOT_REQUEST = (async () => {') &&
  customer.includes('snapshot_id'));
verify('no_client_auto_url_change',!/location\.replace\(latest\.href/.test(customer));
verify('old_url_preserved_in_client_metadata',customer.includes('https://kq247-football-live.onrender.com/client.html'));
verify('no_external_analytics',!/us\.i\.posthog\.com|KQ247_PH_URL/.test(customer));
if(failures)process.exitCode=1;
else console.log('SOURCE_GATE_OK:read_only:production_not_deployed');
