import {db} from "hatchable";
// Sign the immutable source snapshot locally. Only the public key is installed
// in Neon. No Neon database passwords or signing secret leave this project.
const P=0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G=[0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const URL="https://br-divine-resonance-az0qxt8z-kq247bdsync.compute.c-3.ap-southeast-1.aws.neon.tech/";
const mod=(v,n)=>((v%n)+n)%n;
function inverse(x,m){let a=mod(x,m),b=m,u=1n,v=0n;while(b){const q=a/b;[a,b]=[b,a-q*b];[u,v]=[v,u-q*v]}if(a!==1n)throw Error("signature_inverse_invalid");return mod(u,m)}
function add(a,b){
 if(!a)return b;if(!b)return a;
 if(a[0]===b[0]&&mod(a[1]+b[1],P)===0n)return null;
 const slope=a[0]===b[0]&&a[1]===b[1]
  ?mod(3n*a[0]*a[0]*inverse(2n*a[1],P),P)
  :mod((b[1]-a[1])*inverse(b[0]-a[0],P),P);
 const x=mod(slope*slope-a[0]-b[0],P);
 return [x,mod(slope*(a[0]-x)-a[1],P)];
}
function multiply(k){let ans=null,q=G;while(k>0n){if(k&1n)ans=add(ans,q);q=add(q,q);k>>=1n}return ans}
function derInt(x){let h=x.toString(16);if(h.length%2)h="0"+h;if(parseInt(h.slice(0,2),16)>=128)h="00"+h;return h.match(/../g).map(s=>parseInt(s,16))}
async function signature(body,privateHex){
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body)));
 const z=BigInt("0x"+Array.from(digest,b=>b.toString(16).padStart(2,"0")).join(""));
 const d=BigInt("0x"+privateHex);
 if(d<=0n||d>=N)throw Error("signer_invalid");
 for(let i=0;i<10;i++){
  const random=crypto.getRandomValues(new Uint8Array(32));
  const k=BigInt("0x"+Array.from(random,b=>b.toString(16).padStart(2,"0")).join(""));
  if(k<=0n||k>=N)continue;
  const r=multiply(k)[0]%N;
  if(!r)continue;
  const s=mod(inverse(k,N)*(z+r*d),N);
  if(!s)continue;
  const a=derInt(r),b=derInt(s);
  const out=[48,4+a.length+b.length,2,a.length,...a,2,b.length,...b];
  return btoa(String.fromCharCode(...out));
 }
 throw Error("could_not_sign");
}
const priority=s=>/(premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|libertadores|j1 league|j-league)/i.test(String(s||""));
const toLegacy=m=>{
 const k=m.market||{},type=k.type,chosen=k.pick||"";
 const choice={pick:type==="OU"?(chosen==="OVER"?"TÀI":"XỈU"):(chosen==="HOME"?"CHỦ":"KHÁCH"),line:k.line,price:k.odds,confidence:k.confidence};
 return {id:String(m.id),home:m.home,away:m.away,league:m.league,country:m.country||"",ts:new Date(m.kickoff).getTime(),
  provider:"Bongdalu",source_detail:m.sourceRef||"bongdalu_native_original_v128",trusted_pick:true,confidence_score:m.score??null,
  ah:type==="AH"?choice:null,ou:type==="OU"?choice:null,
  ah_release:type==="AH",ou_release:type==="OU",bookmaker_count:m.bookmakerCount||1,
  bookmaker_names:k.bookmaker?[k.bookmaker]:[],learning_methods:[String(m.method||"bookmaker_consensus_unvalidated")],
  method:String(m.method||"bookmaker_consensus_unvalidated"),top:priority(m.league),
  market_scores:type==="AH"?{ah:Number(k.confidence)||0}:{ou:Number(k.confidence)||0}};
};
export async function mirrorLockedFootball(day){
 const scope="r55_neon_sync_"+day;
 const src=await db.query("SELECT source,payload,locked_at FROM football_snapshots WHERE day=$1::date LIMIT 1",[day]);
 const snap=src.rows[0];
 if(snap?.source!=="bongdalu-r55"||!snap.locked_at)return {ok:false,error:"source_snapshot_not_locked",day};
 const picks=Array.isArray(snap.payload?.matches)?snap.payload.matches:[];
 if(!picks.length||picks.length>5000||picks.some(x=>!/^BDL_\d{5,12}$/.test(String(x?.id||""))||!["AH","OU"].includes(x?.market?.type)))
  return {ok:false,error:"source_snapshot_invalid",day};
 const converted=picks.map(toLegacy);
 if(new Set(converted.map(m=>m.id)).size!==converted.length)return {ok:false,error:"duplicate_match_ids",day};
 const secret=await db.query("SELECT secret FROM football_runtime_credentials WHERE name='neon_bongdalu_signer_private' LIMIT 1");
 const privateHex=secret.rows[0]?.secret;
 if(!/^[a-f0-9]{64}$/i.test(String(privateHex||"")))return {ok:false,error:"signer_not_configured",day};
 const data={day,locked:true,source:"bongdalu_verified_only",updatedAt:new Date(snap.locked_at).toISOString(),
  predictions:converted,daily_stats:Array.isArray(snap.payload?.daily_stats)?snap.payload.daily_stats:[],
  method_performance:Array.isArray(snap.payload?.method_performance)?snap.payload.method_performance:[]};
 // Omit redundant transport metadata: method already identifies the learner,
 // market_scores is derived and empty; null values carry no information.
 // Keep every prediction and all concrete source, market, price and score data.
 const body=JSON.stringify(data,(key,value)=>
  key==="learning_methods"||key==="market_scores"||value===null?undefined:value);
 const payloadBytes=new TextEncoder().encode(body).length;
 try{
  const sig=await signature(body,privateHex);
  const resp=await fetch(URL,{method:"POST",headers:{"content-type":"application/json","x-kq247-signature":sig},
   body,signal:AbortSignal.timeout(17000)});
  const j=await resp.json().catch(()=>({ok:false,error:"invalid_mirror_response"}));
  if(!resp.ok||!j.ok||Number(j.count)!==converted.length||String(j.day)!==day)throw Error("mirror_"+resp.status+"_"+String(j.error||"verification_failed").slice(0,130));
  // Only declare success after the same API used by both Render UIs reads the
  // exact frozen IDs. Earlier periods remain immutable and are not queried as current.
  const activeCycle=new Date(Date.now()+7*3600000-(12*60+5)*60000).toISOString().slice(0,10);
  if(day===activeCycle){
   const check=await fetch("https://br-divine-resonance-az0qxt8z-kq247bdapi.compute.c-3.ap-southeast-1.aws.neon.tech/?action=football-predictions&mode=all&limit=5000&from_ts=0",{cache:"no-store",signal:AbortSignal.timeout(14000)});
   const live=await check.json().catch(()=>({}));
   const liveIds=Array.isArray(live.predictions)?live.predictions.map(x=>String(x.id)):[];
   const expectedIds=new Set(converted.map(x=>String(x.id)));
   if(!check.ok||!live.ok||!live.locked||String(live.date)!==day||liveIds.length!==converted.length||liveIds.some(id=>!expectedIds.has(id)))
    throw Error("mirror_readback_mismatch_"+liveIds.length+"_expected_"+converted.length);
   const remoteById=new Map(live.predictions.map(x=>[String(x.id),x]));
   const mismatch=converted.find(x=>{
    const y=remoteById.get(String(x.id));
    if(!y||String(x.home)!==String(y.home)||String(x.away)!==String(y.away)||
      String(x.league)!==String(y.league)||Number(x.ts)!==Number(y.ts))return true;
    const pick=x.ah||x.ou,shown=x.ah?y.ah:y.ou;
    return !shown||!!(x.ah?y.ou:y.ah)||String(pick.pick)!==String(shown.pick)||
      Number(pick.line)!==Number(shown.line)||Number(pick.price)!==Number(shown.price);
   });
   if(mismatch)throw Error("mirror_market_readback_mismatch_"+String(mismatch.id));
  }
  const log={state:"synced",day,payloadBytes,count:converted.length,verifiedAt:new Date().toISOString(),readbackVerified:day===activeCycle,applied:j.applied===true,unchanged:j.unchanged===true,source:"bongdalu_verified_only"};
  await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated_at=now()",[scope,JSON.stringify(log)]);
  return {ok:true,...log};
 }catch(e){
  const error=String(e.message||e).slice(0,180);
  await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload,updated_at=now()",[scope,JSON.stringify({state:"sync_failed",day,error,at:new Date().toISOString()})]);
  return {ok:false,error,day};
 }
}