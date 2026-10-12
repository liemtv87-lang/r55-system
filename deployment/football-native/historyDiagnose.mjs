import {getBongdaluText,resolveBongdaluBase,verifiedBongdaluInternals as V} from 'lib/bongdaluR55.js';
import {db,closePool} from 'hatchable';

const base=await resolveBongdaluBase();
const bad=await db.query("SELECT fixture_id,status,home_games,away_games,h2h_games,payload->>'home' AS home,payload->>'away' AS away FROM r55_fixture_history WHERE day='2026-10-12'::date AND status<>'full_20_20' ORDER BY status,home_games+away_games LIMIT 8");
console.log('DIAG_SOURCE',base.base);
for(const item of bad.rows){
  const id=item.fixture_id.replace('BDL_','');
  try{
    const body=await getBongdaluText(base.base,'match/h2h-'+id,'text/html',15000);
    const parsed=V.parseHistoryHtml(body);
    const n=(regex)=>[...body.matchAll(regex)].length;
    const info={
      id,status:item.status,home:item.home,away:item.away,bytes:body.length,homeN:parsed?.home?.n,
      awayN:parsed?.away?.n,h2hN:parsed?.h2h?.n,title:(body.match(/<title[^>]*>([^<]{1,180})<\/title>/i)||[])[1]||'',
      tables:['table_v1','table_v2','table_v3'].map(t=>[t,body.includes(t)]),
      tr1:n(/<tr[^>]*id=["']tr1_/gi),tr2:n(/<tr[^>]*id=["']tr2_/gi),tr3:n(/<tr[^>]*id=["']tr3_/gi),
      score:n(/fscore_[123]/gi),vars:[...new Set([...body.matchAll(/var\s+([a-zA-Z_][\w]{2,40})\s*=/g)].map(x=>x[1]))].filter(s=>/team|data|h2h|list|form|history/i.test(s)).slice(0,50),
      statusNote:body.slice(0,300).replace(/\s+/g,' ')
    };
    console.log('HISTORY_DIAG',JSON.stringify(info));
  }catch(e){console.log('HISTORY_DIAG_ERROR',id,String(e.message||e));}
}
await closePool();
