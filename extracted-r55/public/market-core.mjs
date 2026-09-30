// STRICT full-time Asian Handicap / O-U main-line selector.
// Rule: price balance may choose WHICH QUOTED LINE is main, but may never change
// the sign/direction of a provider's handicap or synthesize a different O/U line.
export function bookId(name){
 let raw=String(name||'').split(' • ')[0].trim();
 raw=raw.replace(/\s+(?:via|through|from)\s+.+$/i,'').replace(/\s*\(via\s+[^)]+\)\s*$/i,'').replace(/\s*@\s*.+$/,'').trim();
 const s=raw.toLowerCase().replace(/[^a-z0-9]/g,'');
 return ({ps:'pinnacle',p:'pinnacle',b365:'bet365','365':'bet365',bet365sportsbook:'bet365',ladbrokesaustralia:'ladbrokes',ladbrokesau:'ladbrokes',x1:'1xbet',onexbet:'1xbet',williamhilluk:'williamhill',willhill:'williamhill',unibetuk:'unibet'})[s]||s;
}
function pairMetrics(x){
 const il=1/x.lo,ir=1/x.ro,sum=il+ir;
 if(!(sum>0))return{q:999,balance:1};
 const p=il/sum,balance=Math.abs(p-.5),avg=(x.lo+x.ro)/2;
 const margin=Math.abs(sum-1.04);
 const extreme=Math.max(0,1.70-Math.min(x.lo,x.ro))*8+Math.max(0,Math.max(x.lo,x.ro)-2.30)*8;
 return{sum,p,balance,avg,margin,q:balance*8+Math.abs(avg-1.93)*.12+margin*.20+extreme};
}
function pairQuality(x){return pairMetrics(x).q}
export function marketPairs(row,type){
 const pairs=[];
 for(const b of row?.od?.[0]?.bookmakers||[]){
  const id=bookId(b.name); if(!id||/consensus|aggregate|average|maximum|minimum|model|synthetic/.test(id))continue;
  for(const m of b.bets||[]){
   if(m.name!==(type==='AH'?'Asian Handicap':'Goals Over/Under'))continue;
   const parse=v=>{
    const z=String(v.value||'').trim().match(/^(Home|Away|Over|Under)\s+([+-]?\d+(?:\.\d+)?)$/i),odd=Number(v.odd);
    if(!z||!Number.isFinite(odd)||odd<=1||odd>=20)return null;
    const line=Number(z[2]); if(!Number.isFinite(line)||Math.abs(line*4-Math.round(line*4))>1e-8)return null;
    return{side:z[1].toLowerCase(),line,odd};
   };
   const v=(m.values||[]).map(parse).filter(Boolean),left=type==='AH'?'home':'over',right=type==='AH'?'away':'under';
   for(const l of v.filter(x=>x.side===left))for(const r of v.filter(x=>x.side===right)){
    // AH must be exact inverse signs from the provider; O/U must be exact same total.
    if(Math.abs(type==='AH'?l.line+r.line:l.line-r.line)>1e-8)continue;
    if(type!=='AH'&&l.line<=0)continue;
    const x={book:b.name,bookId:id,line:l.line,left:type==='AH'?'Home':'Over',right:type==='AH'?'Away':'Under',lo:l.odd,ro:r.odd};
    const idx=pairs.findIndex(y=>y.bookId===id&&y.line===x.line);
    if(idx<0)pairs.push(x); else if(pairQuality(x)<pairQuality(pairs[idx]))pairs[idx]=x;
   }
  }
 }
 return pairs;
}
export function eligibleMainPair(x){
 if(!Number.isFinite(x.lo)||!Number.isFinite(x.ro)||x.lo<1.70||x.ro<1.70||x.lo>2.30||x.ro>2.30)return false;
 const m=pairMetrics(x); return m.sum>=.98&&m.sum<=1.15&&m.balance<=.08;
}
function median(a){if(!a.length)return NaN;const z=[...a].sort((x,y)=>x-y),m=z.length>>1;return z.length%2?z[m]:(z[m-1]+z[m])/2}
export function bestCluster(items){
 // R12: keep EVERY real quoted exact line that passes the balanced-price gate, but only one
 // best quote per bookmaker PER EXACT LINE. Then choose the exact line shared by the most
 // independent books. This fixes the R10 coverage bug where selecting one line per book too
 // early fragmented consensus and discarded otherwise valid nearby fixtures.
 // IMPORTANT: we never synthesize +/-0.25 lines and never flip a provider's AH direction.
 const perBookLine=new Map();
 for(const x of items){
  if(!eligibleMainPair(x))continue;
  const id=x.bookId||bookId(x.book); if(!id)continue;
  const key=id+'|'+String(x.line),q=pairQuality(x),cur=perBookLine.get(key);
  if(!cur||q<cur.q-1e-9||(Math.abs(q-cur.q)<1e-9&&Math.abs(x.lo-x.ro)<Math.abs(cur.x.lo-cur.x.ro)))perBookLine.set(key,{x,q});
 }
 const quoted=[...perBookLine.values()].map(z=>z.x);
 // Fail closed on a real favorite-direction conflict for the same absolute AH line.
 if(quoted.some(x=>x.left==='Home')){
  const byAbs=new Map();
  for(const x of quoted){const a=Math.abs(x.line);if(a<1e-9)continue;let z=byAbs.get(a)||{pos:new Set(),neg:new Set()};(x.line>0?z.pos:z.neg).add(x.bookId||bookId(x.book));byAbs.set(a,z)}
  for(const z of byAbs.values())if(z.pos.size>=2&&z.neg.size>=2)return null;
 }
 let best=null;
 for(const line of new Set(quoted.map(x=>x.line))){
  const byBook=new Map();
  for(const x of quoted)if(x.line===line)byBook.set(x.bookId||bookId(x.book),x);
  const g=[...byBook.values()]; if(g.length<2)continue;
  const medBal=median(g.map(x=>pairMetrics(x).balance));
  const medQ=median(g.map(pairQuality));
  const leftOdd=g.reduce((s,x)=>s+x.lo,0)/g.length,rightOdd=g.reduce((s,x)=>s+x.ro,0)/g.length;
  const il=1/leftOdd,ir=1/rightOdd,aggBal=Math.abs(il/(il+ir)-.5);
  // R12: MAIN LINE = the real quoted line whose two prices are most balanced.
  // Book count is only a confidence/tie-breaker after >=2 independent books; it must never
  // overpower a clearly more balanced line. This matches Asian-board practice and prevents
  // stale/secondary lines with more rows from being selected as the main line.
  const cand={g,line,spread:0,balance:aggBal,medianBalance:medBal,quality:medQ,leftOdd,rightOdd};
  if(!best){best=cand;continue}
  const db=cand.balance-best.balance;
  if(db<-0.006)best=cand;
  else if(Math.abs(db)<=0.006){
    if(cand.g.length>best.g.length)best=cand;
    else if(cand.g.length===best.g.length&&cand.medianBalance<best.medianBalance-1e-9)best=cand;
    else if(cand.g.length===best.g.length&&Math.abs(cand.medianBalance-best.medianBalance)<1e-9&&cand.quality<best.quality)best=cand;
  }
 }
 return best;
}
export function rowHasBoth(r){return !!bestCluster(marketPairs(r,'AH'))&&!!bestCluster(marketPairs(r,'OU'))}
export function gradeAsian(score,line){
 const lines=Math.abs(line*2-Math.round(line*2))>1e-8?[Math.floor(line*2)/2,Math.ceil(line*2)/2]:[line];
 return lines.reduce((s,l)=>s+Math.sign(score+l),0)/lines.length;
}
