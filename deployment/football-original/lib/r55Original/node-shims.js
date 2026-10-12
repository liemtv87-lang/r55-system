// Hatchable portability bridge for the original Cloudflare R55 worker.
// Exact original worker remains stored as lib/legacy_full_original_r55.zip.
// This shim is used only through a serialized adapter; async-scoped stores are
// not safe for interleaved top-level requests without Node async_hooks.
export class AsyncLocalStorage{
 constructor(){this.current=undefined}
 getStore(){return this.current}
 run(value,fn){
  const previous=this.current;this.current=value;
  try{const result=fn();if(result&&typeof result.then==="function")return result.finally(()=>{this.current=previous});
   this.current=previous;return result;
  }catch(e){this.current=previous;throw e}
 }
}
const rot=(x,n)=>(x<<n)|(x>>>(32-n));
function encodeBytes(chunks){let n=0;for(const a of chunks)n+=a.byteLength;const out=new Uint8Array(n);let pos=0;for(const a of chunks){out.set(a,pos);pos+=a.length}return out}
function sha1(bytes){
 let h0=0x67452301,h1=0xefcdab89,h2=0x98badcfe,h3=0x10325476,h4=0xc3d2e1f0;
 const padded=pad(bytes),w=new Uint32Array(80);
 for(let off=0;off<padded.length;off+=64){
  for(let i=0;i<16;i++){let at=off+i*4;w[i]=(padded[at]<<24|padded[at+1]<<16|padded[at+2]<<8|padded[at+3])>>>0}
  for(let i=16;i<80;i++)w[i]=rot(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);
  let a=h0,b=h1,c=h2,d=h3,e=h4;
  for(let i=0;i<80;i++){
   const f=i<20?(b&c|~b&d):i<40?(b^c^d):i<60?(b&c|b&d|c&d):(b^c^d);
   const k=i<20?0x5a827999:i<40?0x6ed9eba1:i<60?0x8f1bbcdc:0xca62c1d6;
   const tmp=(rot(a,5)+f+e+k+w[i])>>>0;
   e=d;d=c;c=rot(b,30);b=a;a=tmp;
  }
  h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;h3=(h3+d)>>>0;h4=(h4+e)>>>0;
 }
 return [h0,h1,h2,h3,h4].map(x=>x.toString(16).padStart(8,"0")).join("");
}
const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function pad(bytes){
 const n=bytes.length,len=Math.ceil((n+9)/64)*64,out=new Uint8Array(len),bits=n*8;
 out.set(bytes);out[n]=128;
 const hi=Math.floor(bits/4294967296),lo=bits>>>0;
 out[len-8]=(hi>>>24)&255;out[len-7]=(hi>>>16)&255;out[len-6]=(hi>>>8)&255;out[len-5]=hi&255;
 out[len-4]=(lo>>>24)&255;out[len-3]=(lo>>>16)&255;out[len-2]=(lo>>>8)&255;out[len-1]=lo&255;
 return out;
}
function shr(x,n){return x>>>n}
function sha256(bytes){
 let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
 const padded=pad(bytes),w=new Uint32Array(64);
 for(let off=0;off<padded.length;off+=64){
  for(let i=0;i<16;i++){const p=off+i*4;w[i]=(padded[p]<<24|padded[p+1]<<16|padded[p+2]<<8|padded[p+3])>>>0}
  for(let i=16;i<64;i++){
   const a=w[i-15],b=w[i-2],s0=(shr(a,7)|a<<25)^(shr(a,18)|a<<14)^shr(a,3);
   const s1=(shr(b,17)|b<<15)^(shr(b,19)|b<<13)^shr(b,10);
   w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
  }
  let [a,b,c,d,e,f,g,h]=H;
  for(let i=0;i<64;i++){
   const s1=(shr(e,6)|e<<26)^(shr(e,11)|e<<21)^(shr(e,25)|e<<7);
   const ch=(e&f)^((~e)&g),t1=(h+s1+ch+K[i]+w[i])>>>0;
   const s0=(shr(a,2)|a<<30)^(shr(a,13)|a<<19)^(shr(a,22)|a<<10);
   const maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;
   h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
  }
  H=H.map((x,i)=>(x+[a,b,c,d,e,f,g,h][i])>>>0);
 }
 return H.map(x=>x.toString(16).padStart(8,"0")).join("");
}
export function createHash(alg){
 const name=String(alg).toLowerCase(),chunks=[];
 if(name!=="sha1"&&name!=="sha256")throw Error("Unsupported original R55 hash "+name);
 return {update(v){const bytes=v instanceof Uint8Array?v:new TextEncoder().encode(String(v));chunks.push(bytes);return this},
 digest(format){if(format!=="hex")throw Error("Only original hex digests supported");
 const data=encodeBytes(chunks);return name==="sha1"?sha1(data):sha256(data)}};
}