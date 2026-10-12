import {db} from 'hatchable';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolveBongdaluBase,getBongdaluText,verifiedBongdaluInternals as V} from 'lib/bongdaluR55.js';

function splitRow(src){
  const out=[];let cur='',quote=null,escaped=false;
  for(const ch of src){
    if(quote){
      if(escaped){cur+=ch;escaped=false}
      else if(ch==='\\')escaped=true;
      else if(ch===quote)quote=null;
      else cur+=ch;
    }else if(ch==='"'||ch==="'")quote=ch;
    else if(ch===','){out.push(cur.trim());cur=''}
    else cur+=ch;
  }
  out.push(cur.trim());return out;
}
function marketTypeCount(js,xmls,records){
 const identified=new Map();
 const add=(id,key)=>{
  if(!/^\d{5,12}$/.test(String(id)))return;
  const z=identified.get(String(id))||{ah:false,ou:false};
  z[key]=true;identified.set(String(id),z);
 };
 const num=s=>String(s??'').trim()!==''&&Number.isFinite(Number(s));
 for(const m of js.matchAll(/A\[\d+\]\s*=\s*\[([^\r\n]*?)\];/g)){
  const f=splitRow(m[1]),id=f[0];
  if(num(f[21]))add(id,'ah');
  if(num(f[25])&&Number(f[25])>0)add(id,'ou');
 }
 for(const z of xmls)for(const m of z.text.matchAll(/<m>([^<]+)<\/m>/g)){
  const p=m[1].split(','),id=p[0];
  if(num(p[2]))add(id,'ah');
  if(num(p[10])&&Number(p[10])>0)add(id,'ou');
 }
 for(const r of records)if(r.market){
  if(num(r.market.homeLine))add(r.bongdaluId,'ah');
  if(num(r.market.ouLine))add(r.bongdaluId,'ou');
 }
 return identified;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stamp=()=>new Date().toISOString();
async function retrieve(base,id){
 let lastError='unknown';
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const html=await getBongdaluText(base,'match/h2h-'+id,'text/html',20000);
   const parsed=V.parseHistoryHtml(html);
   if(!parsed)throw Error('missing_expected_h2h_tables');
   if(!Number(parsed.home?.n)&&!Number(parsed.away?.n))throw Error('no_parseable_recent_matches');
   return {html,parsed,tries:attempt,error:null};
  }catch(e){lastError=String(e.message||e).slice(0,140);if(attempt<3)await sleep(400*attempt);}
 }
 return {html:null,parsed:null,tries:3,error:lastError};
}
async function writeArchive(day,id,html){
 const folder='/data/history/'+day;
 await mkdir(folder,{recursive:true});
 const raw=Buffer.from(html,'utf8');
 const name=folder+'/'+id+'.html.gz';
 const data=gzipSync(raw,{level:6});
 // Write gzip archive once, then only refresh if source content changes.
 await writeFile(name+'.tmp',data,{mode:0o600});
 await rename(name+'.tmp',name);
 return {path:name,bytes:raw.length,compressedBytes:data.length,sha256:createHash('sha256').update(raw).digest('hex')};
}
async function saveFixture(day,m,markets,history,archive){
 const payload={
  fixtureId:m.id,bongdaluId:m.bongdaluId,home:m.home,away:m.away,league:m.league,country:m.country,
  kickoff:m.kickoff,markets,source:'Bongdalu',extractedAt:stamp(),attempts:history.tries,
  parsed:history.parsed,error:history.error,archive
 };
 const status=!history.parsed?'missing':
   Number(history.parsed.home?.n)>=20&&Number(history.parsed.away?.n)>=20?'full_20_20':
   Number(history.parsed.home?.n)>0&&Number(history.parsed.away?.n)>0?'partial':'incomplete';
 await db.query(
  "INSERT INTO r55_fixture_history(day,fixture_id,status,home_games,away_games,h2h_games,payload,updated_at) VALUES($1::date,$2,$3,$4,$5,$6,$7::jsonb,now()) ON CONFLICT(day,fixture_id) DO UPDATE SET status=EXCLUDED.status,home_games=EXCLUDED.home_games,away_games=EXCLUDED.away_games,h2h_games=EXCLUDED.h2h_games,payload=EXCLUDED.payload,updated_at=now()",
  [day,m.id,status,history.parsed?.home?.n||0,history.parsed?.away?.n||0,history.parsed?.h2h?.n||0,JSON.stringify(payload)]
 );
 return status;
}
export async function auditAllMarketHistories(){
 const source=await resolveBongdaluBase(), day=V.vnDay(),started=stamp();
 const xmls=await Promise.all(V.BOOKS.map(async([name,id])=>({
  name,text:await getBongdaluText(source.base,'gf/data/odds/en/goal'+id+'.xml','text/xml',12000).catch(()=>'')
 })));
 const odds=V.parseOdds(xmls),feed=V.parseFeed(source.js,odds);
 const markets=marketTypeCount(source.js,xmls,feed);
 const feedById=new Map(feed.map(m=>[m.bongdaluId,m]));
 // The bookmaker XML can contain a priced fixture that the current live A[] feed
 // has dropped. Fetch its real H2H page too; never fabricate team metadata.
 const withoutFeed=[...markets.keys()].filter(id=>!feedById.has(id));
 const chosen=[...markets.keys()].sort().map(id=>feedById.get(id)||{
   id:'BDL_'+id,bongdaluId:id,home:null,away:null,league:null,country:null,
   kickoff:null,market:null
 });
 let checked=0,ready=0,full20=0,partial=0,missing=0,h2h=0,archived=0,errors=[];
 const startedAt=Date.now(),concurrency=6;
 console.log('R55_ALL_AH_OU_START',JSON.stringify({day,fixtureCount:feed.length,marketIds:markets.size,fixturesToAudit:chosen.length,unmatchedMarkets:withoutFeed.length,source:source.base}));
 const idsSeen=new Set();
 for(let i=0;i<chosen.length;i+=concurrency){
  const results=await Promise.all(chosen.slice(i,i+concurrency).map(async m=>{
   try{
    const history=await retrieve(source.base,m.bongdaluId);
    const archive=history.html?await writeArchive(day,m.bongdaluId,history.html):null;
    const status=await saveFixture(day,m,markets.get(m.bongdaluId),history,archive);
    return {m,status,history,archive,error:null};
   }catch(e){return {m,status:'error',error:String(e.message||e).slice(0,180)}}
  }));
  for(const r of results){
   checked++;idsSeen.add(r.m.id);
   if(r.history?.parsed){
    ready++;
    if(r.status==='full_20_20')full20++;
    else partial++;
    if((r.history.parsed.h2h?.n||0)>0)h2h++;
   }else missing++;
   if(r.archive)archived++;
   if(r.error||r.history?.error)errors.push({id:r.m.id,reason:r.error||r.history.error});
  }
  console.log('R55_ALL_AH_OU_PROGRESS',JSON.stringify({checked,total:chosen.length,ready,full20,partial,missing,archived,h2h,elapsedSeconds:Math.round((Date.now()-startedAt)/1000)}));
 }
 const report={
  day,started,finishedAt:stamp(),source:source.base,feedFixtures:feed.length,
  marketIds:markets.size,matchingFixtures:chosen.length,unmatchedMarketIdCount:withoutFeed.length,
  unmatchedMarketIds:withoutFeed.slice(0,30),
  historyAttempted:checked,historyAvailable:ready,full20Both:full20,partialOrLess20:partial,
  unavailable:missing,h2hAvailable:h2h,rawHtmlArchived:archived,
  uniqueChecked:idsSeen.size,errors:errors.slice(0,60),
  complete:checked===chosen.length&&chosen.length>0&&errors.length===0&&withoutFeed.length===0
 };
 await db.query(
  "INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",
  ['r55_market_history_full_'+day,JSON.stringify(report)]
 );
 await mkdir('/data/history/'+day,{recursive:true});
 await writeFile('/data/history/'+day+'/audit.json',JSON.stringify(report,null,2));
 console.log('R55_ALL_AH_OU_AUDIT',JSON.stringify(report));
 if(checked!==chosen.length||idsSeen.size!==chosen.length)throw Error('all_market_history_audit_incomplete');
 return report;
}
