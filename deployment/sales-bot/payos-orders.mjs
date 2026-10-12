// payOS lifecycle for the sole active VPS sales bot. Never log API keys, signatures or customer codes.
import crypto from 'node:crypto';

const PRODUCTS=new Set(['football','lottery','vietlott']);
const PAID_TERMS=new Set([30,180,360,365,720,730]);
let client=null,prepared=false;

export function payosStatus(){
  let publicEndpoint=false;
  try{const u=new URL(process.env.PAYOS_PUBLIC_BASE_URL||'');publicEndpoint=u.protocol==='https:'&&!u.username&&!u.password&&!!u.hostname;}
  catch{}
  const credentials=!!(process.env.PAYOS_CLIENT_ID&&process.env.PAYOS_API_KEY&&process.env.PAYOS_CHECKSUM_KEY);
  const webhookConfirmed=process.env.PAYOS_WEBHOOK_CONFIRMED==='1';
  return {credentials,publicEndpoint,webhookConfirmed,ready:credentials&&publicEndpoint&&webhookConfirmed};
}
function baseUrl(){
  const state=payosStatus();
  if(!state.publicEndpoint)throw Error('payos_public_https_url_missing');
  return (process.env.PAYOS_PUBLIC_BASE_URL||'').replace(/\/+$/,'');
}
async function payosClient(){
  if(!payosStatus().credentials)throw Error('payos_credentials_missing');
  if(!client){
    const {PayOS}=await import('@payos/node');
    client=new PayOS({clientId:process.env.PAYOS_CLIENT_ID,apiKey:process.env.PAYOS_API_KEY,checksumKey:process.env.PAYOS_CHECKSUM_KEY});
  }
  return client;
}
export async function ensurePaymentSchema(pool){
  if(prepared)return;
  // Schema is provisioned once by the Neon administrator; do not require CREATE
  // permissions or mutate the public schema from the restricted Telegram bot.
  const r=await pool.query("SELECT to_regclass('public.sales_payos_orders') AS orders_table");
  if(!r.rows[0]?.orders_table)throw Error('sales_payos_schema_missing');
  prepared=true;
}
export async function createPayosCheckout(pool,telegramUserId,product,days){
  if(!payosStatus().ready)throw Error('payos_payment_not_ready');
  if(!PRODUCTS.has(product)||!PAID_TERMS.has(Number(days)))throw Error('invalid_paid_plan');
  await ensurePaymentSchema(pool);
  const plan=(await pool.query('SELECT duration_days,price_vnd FROM sales_plans WHERE product=$1 AND duration_days=$2 AND enabled=true LIMIT 1',[product,days])).rows[0];
  const amount=Number(plan?.price_vnd);
  if(!Number.isSafeInteger(amount)||amount<=0)throw Error('paid_plan_unavailable');
  // Return a recent unpaid link rather than creating multiple purchase links per tap.
  const prev=(await pool.query(`SELECT checkout_url,order_code FROM sales_payos_orders
   WHERE telegram_user_id=$1 AND product=$2 AND duration_days=$3 AND price_vnd=$4
   AND state='checkout_ready' AND created_at>NOW()-INTERVAL '40 minutes'
   ORDER BY created_at DESC LIMIT 1`,[String(telegramUserId),product,days,amount])).rows[0];
  if(prev?.checkout_url)return {checkoutUrl:prev.checkout_url,orderCode:prev.order_code,amount,reused:true};

  const orderCode=Date.now()*1000+crypto.randomInt(0,1000);
  await pool.query(`INSERT INTO sales_payos_orders(order_code,telegram_user_id,product,duration_days,price_vnd)
    VALUES($1,$2,$3,$4,$5)`,[orderCode,String(telegramUserId),product,days,amount]);
  const b=baseUrl(),returnUrl=b+'/payos/return',cancelUrl=b+'/payos/cancel';
  const request={orderCode,amount,description:'KQ247 '+String(orderCode).slice(-8),returnUrl,cancelUrl,expiredAt:Math.floor(Date.now()/1000)+3600};
  try {
    const result=await (await payosClient()).paymentRequests.create(request);
    const checkoutUrl=String(result?.checkoutUrl||'');
    const target=new URL(checkoutUrl);
    if(target.protocol!=='https:'||!target.hostname)throw Error('payos_checkout_url_invalid');
    await pool.query(`UPDATE sales_payos_orders SET checkout_url=$2,payment_link_id=$3,state='checkout_ready',updated_at=NOW()
      WHERE order_code=$1 AND state='creating'`,[orderCode,checkoutUrl,String(result?.paymentLinkId||'')]);
    return {checkoutUrl,orderCode,amount,reused:false};
  }catch(e){
    await pool.query("UPDATE sales_payos_orders SET state='failed',updated_at=NOW() WHERE order_code=$1 AND state='creating'",[orderCode]).catch(()=>{});
    throw Error('payos_create_failed');
  }
}
export async function processPayosWebhook(pool,payload,onPaid){
  if(!payosStatus().credentials)throw Error('payos_credentials_missing');
  if(!payload||typeof payload!=='object')throw Error('invalid_payos_payload');
  // Official SDK verifies the HMAC signature against the checksum key.
  const transaction=await (await payosClient()).webhooks.verify(payload);
  if(!transaction||!Number.isSafeInteger(Number(transaction.orderCode)))throw Error('invalid_verified_payment');
  if(payload.success!==true||payload.code!=='00'||transaction.code!=='00')return {accepted:true,paid:false};
  await ensurePaymentSchema(pool);
  const db=await pool.connect();
  let receipt=null;
  try {
    await db.query('BEGIN');
    const q=await db.query('SELECT * FROM sales_payos_orders WHERE order_code=$1 FOR UPDATE',[String(transaction.orderCode)]);
    const order=q.rows[0];
    // payOS's webhook confirmation sends a signed sample order; never issue a license for an unknown order.
    if(!order){await db.query('COMMIT');return {accepted:true,paid:false,reason:'unknown_order'};}
    if(Number(order.price_vnd)!==Number(transaction.amount))throw Error('payment_amount_mismatch');
    if(order.state==='paid'){
      await db.query('COMMIT');
      return {accepted:true,paid:true,duplicate:true};
    }
    if(order.state!=='checkout_ready')throw Error('payment_order_not_ready');
    if(order.payment_link_id&&transaction.paymentLinkId&&String(order.payment_link_id)!==String(transaction.paymentLinkId))throw Error('payment_link_mismatch');
    const code=({football:'BD',lottery:'XS',vietlott:'VL'})[order.product]+'-'+crypto.randomBytes(10).toString('hex').toUpperCase();
    const hash=crypto.createHash('sha256').update(code).digest('hex');
    await db.query(`INSERT INTO sales_licenses(code_hash,code_hint,code_value,product,duration_days,status,telegram_user_id)
      VALUES($1,$2,$3,$4,$5,'active',$6)`,[hash,code.slice(-4),code,order.product,order.duration_days,order.telegram_user_id]);
    await db.query(`UPDATE sales_payos_orders SET state='paid',license_hash=$2,paid_at=NOW(),updated_at=NOW()
      WHERE order_code=$1`,[String(transaction.orderCode),hash]);
    await db.query('COMMIT');
    receipt={telegramUserId:order.telegram_user_id,product:order.product,code};
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}
  finally{db.release()}
  if(receipt&&onPaid)await onPaid(receipt).catch(()=>{}); // paid license persists even if Telegram delivery fails
  return {accepted:true,paid:true,duplicate:false};
}
