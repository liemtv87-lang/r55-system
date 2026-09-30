import {bookId,rowHasBoth} from './market-core.mjs';
const clean=s=>String(s??'').trim();
const parseTs=s=>Date.parse(s);
function norm(s){return clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\b(fc|cf|sc|afc|club|the)\b/g,' ').replace(/[^a-z0-9]+/g,'')}
function teamMatch(a,b){a=norm(a);b=norm(b);if(!a||!b)return false;if(a===b)return true;return Math.min(a.length,b.length)>=6&&(a.includes(b)||b.includes(a))}
function sameRow(a,b){const ta=parseTs(a?.f?.fixture?.date),tb=parseTs(b?.f?.fixture?.date);return ta&&tb&&Math.abs(ta-tb)<=5*60000&&norm(a.f.teams.home.name)===norm(b.f.teams.home.name)&&norm(a.f.teams.away.name)===norm(b.f.teams.away.name)}
function validRow(r){return !!r?.f?.teams?.home?.name&&!!r?.f?.teams?.away?.name&&r.od?.[0]?.bookmakers?.some(b=>b.bets?.some(z=>['Asian Handicap','Goals Over/Under'].includes(z.name)&&z.values?.length>=2))}
function mergeRows(rows){const out=[];for(const r of rows.flat().filter(validRow)){let hit=out.find(x=>sameRow(x,r));if(!hit){out.push(r);continue}for(const nb of r.od[0].bookmakers){let ob=hit.od[0].bookmakers.find(x=>bookId(x.name)===bookId(nb.name));if(!ob){hit.od[0].bookmakers.push(JSON.parse(JSON.stringify(nb)));continue}for(const z of nb.bets||[]){let oz=ob.bets.find(x=>x.name===z.name);if(!oz){ob.bets.push(JSON.parse(JSON.stringify(z)));continue}for(const v of z.values||[])if(!oz.values.some(x=>x.value===v.value&&Math.abs(Number(x.odd)-Number(v.odd))<1e-8))oz.values.push({...v})}}}return out}
export {mergeRows};
export function nearestRows(rows,from,limit=20,now=from){return mergeRows(structuredClone(rows)).filter(r=>{const t=Date.parse(r.f.fixture.date);return t>=Math.max(from,now)&&t<=from+86400000&&rowHasBoth(r)}).sort((a,b)=>Date.parse(a.f.fixture.date)-Date.parse(b.f.fixture.date)).slice(0,limit)}

export function sourcePlan(ids,audit,now=Date.now()){
 const unique=[...new Set(ids)];if(!audit||now-audit.at>6*3600000||audit.at>now||!Array.isArray(audit.results))return unique;
 const results=new Map(audit.results.map(x=>[x.id,x]));
 const score=id=>{const x=results.get(id);if(!x)return 0;return x.rows>0?100000+Math.min(10000,x.confirmed||0)*10+Math.min(9999,x.rows):x.reason==='access_blocked'||x.reason==='rate_limited'?-2:-1};
 return unique.map((id,i)=>({id,i,score:score(id)})).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.id);
}
