const cp=new Map([...new TextDecoder('windows-1252').decode(Uint8Array.from({length:256},(_,i)=>i))].map((c,i)=>[c,i]));
// Repair only reversible UTF-8 text incorrectly decoded as Windows-1252.
export function repairText(value){
 let s=String(value??'').normalize('NFC');

 const bad=x=>(x.match(/[ÃÂâðÄÅ]|á[º»]/g)||[]).length;
 for(let pass=0;pass<2&&bad(s);pass++){
  s=s.replace(/[^\s]+/g,word=>{if(!bad(word))return word;const bytes=[...word].map(c=>cp.get(c));if(bytes.some(x=>x===undefined))return word;try{const decoded=new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes));return bad(decoded)<bad(word)?decoded:word}catch{return word}});
 }
 return s.normalize('NFC');
}
export async function decodeResponse(r){
 const bytes=new Uint8Array(await r.arrayBuffer()),head=new TextDecoder('ascii').decode(bytes.slice(0,4096));
 const charset=(r.headers.get('content-type')?.match(/charset\s*=\s*["']?([^;\s"']+)/i)||head.match(/charset\s*=\s*["']?([^\s"'/>;]+)/i))?.[1];
 let text;try{text=new TextDecoder(charset||'utf-8',{fatal:true}).decode(bytes)}catch{try{text=new TextDecoder(charset||'utf-8').decode(bytes)}catch{text=new TextDecoder().decode(bytes)}}
 return repairText(text);
}
export function cleanLabel(value){
 let s=repairText(value);
 for(let i=0;i<3;i++)s=s.replace(/&(?:#(x[0-9a-f]+|\d+)|(amp|lt|gt|quot|apos|nbsp));/gi,(m,n,k)=>{if(n){const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):m}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[k.toLowerCase()]});
 return s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/?[a-z][^>]*>/gi,'').replace(/\s+/g,' ').trim().normalize('NFC');
}
