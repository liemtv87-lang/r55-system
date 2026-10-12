// Explicit payOS webhook registration. Run only from the existing single VPS sales container
// with the merchant's active credentials and a tested public HTTPS callback.
// This script never logs the keys, webhook signatures, or customer details.
import {PayOS} from '@payos/node';

const expectedOrigin='https://64-120-92-172.sslip.io';
const keys=['PAYOS_CLIENT_ID','PAYOS_API_KEY','PAYOS_CHECKSUM_KEY'];
if(keys.some(key=>!process.env[key])){
 console.error('PAYOS_MISSING_CREDENTIALS');process.exit(2);
}
const base=process.env.PAYOS_PUBLIC_BASE_URL?.replace(/\/+$/,'');
if(base!==expectedOrigin){
 console.error('PAYOS_PUBLIC_ORIGIN_MISMATCH');process.exit(3);
}
const webhookUrl=base+'/payos/webhook';
const returnUrl=base+'/payos/return';
const returnProbe=await fetch(returnUrl,{signal:AbortSignal.timeout(12000)});
if(!returnProbe.ok){
 console.error('PAYOS_RETURN_NOT_REACHABLE');process.exit(4);
}
// The callback must be reachable but reject unsigned payloads. 400 is expected.
const invalidProbe=await fetch(webhookUrl,{
 method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(12000)
});
if(invalidProbe.status!==400){
 console.error('PAYOS_WEBHOOK_UNSIGNED_DATA_NOT_REJECTED');process.exit(5);
}
const client=new PayOS({
 clientId:process.env.PAYOS_CLIENT_ID,
 apiKey:process.env.PAYOS_API_KEY,
 checksumKey:process.env.PAYOS_CHECKSUM_KEY
});
try {
 // payOS sends a signed verification payload during registration.
 const result=await client.webhooks.confirm(webhookUrl);
 if(!result || result.webhookUrl!==webhookUrl){
   throw new Error('webhook_confirmation_mismatch');
 }
 console.log('PAYOS_SIGNED_WEBHOOK_CONFIRMATION=PASS');
} catch {
 console.error('PAYOS_SIGNED_WEBHOOK_CONFIRMATION=FAIL');process.exit(6);
}
