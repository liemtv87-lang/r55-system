import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {payosStatus,createPayosCheckout,processPayosWebhook} from './payos-orders.mjs';

const src=readFileSync(new URL('./worker.mjs',import.meta.url),'utf8');
const moduleCode=readFileSync(new URL('./payos-orders.mjs',import.meta.url),'utf8');

test('Bot has copy code, copy URL and three purchase term handlers',()=>{
 for(const part of ['copy_text:{text:', 'SAO CHÉP MÃ', 'SAO CHÉP LINK', "[30,'1 THÁNG'],[365,'1 NĂM'],[730,'2 NĂM']",
   "callback_data:'buy:'", "cmd.startsWith('buy:')", "callback_data:'mycodes'", "validClientUrl(product)"]){
  assert.ok(src.includes(part),'missing '+part);
 }
 assert.ok(src.includes("processPayosWebhook(pool,payload"),'missing payOS webhook');
 assert.ok(src.includes("url.pathname.endsWith('/payos/webhook')"),'missing HTTP webhook path');
});

test('Payment is blocked until credentials, HTTPS and verified webhook are configured',async()=>{
 const keys=['PAYOS_CLIENT_ID','PAYOS_API_KEY','PAYOS_CHECKSUM_KEY','PAYOS_PUBLIC_BASE_URL','PAYOS_WEBHOOK_CONFIRMED'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try {
  for(const k of keys)delete process.env[k];
  assert.equal(payosStatus().ready,false);
  await assert.rejects(()=>createPayosCheckout({},'123','football',30),/payos_payment_not_ready/);
  await assert.rejects(()=>processPayosWebhook({},{}),/payos_credentials_missing/);
  Object.assign(process.env,{PAYOS_CLIENT_ID:'test',PAYOS_API_KEY:'test',PAYOS_CHECKSUM_KEY:'test',PAYOS_PUBLIC_BASE_URL:'http://example.test',PAYOS_WEBHOOK_CONFIRMED:'1'});
  assert.equal(payosStatus().ready,false,'HTTP URL must not take real payments');
  process.env.PAYOS_PUBLIC_BASE_URL='https://example.test';
  process.env.PAYOS_WEBHOOK_CONFIRMED='0';
  assert.equal(payosStatus().ready,false,'unconfirmed webhook must not take payments');
 }finally{
  for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
 }
});

test('Webhook issuance checks authenticity, amount and database transaction/idempotency',()=>{
 for(const phrase of ['webhooks.verify(payload)','Number(order.price_vnd)!==Number(transaction.amount)',
   "order.state==='paid'", "FOR UPDATE","INSERT INTO sales_licenses","UPDATE sales_payos_orders SET state='paid'",
   'ROLLBACK','COMMIT','telegram_user_id']){
  assert.ok(moduleCode.includes(phrase),'missing '+phrase);
 }
 assert.ok(src.includes("validClientUrl(product)"),'customer link resolver required');
 assert.ok(!src.includes('process.env.PAYOS_CHECKSUM_KEY||'), 'checksum must not be hardcoded in worker');
});
