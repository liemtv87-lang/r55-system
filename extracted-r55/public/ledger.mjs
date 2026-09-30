import {cleanLabel} from './text-codec.mjs';
export function ledgerKey(p){const norm=s=>cleanLabel(s).replace(/\(N\)/gi,'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]/gu,'');return p?.home&&p?.away?`${norm(p.home)}|${norm(p.away)}|${Date.parse(p.date)}`:`${p?.id}|${p?.date}`}
export function cleanPrediction(p){return {...p,home:cleanLabel(p.home),away:cleanLabel(p.away),league:cleanLabel(p.league)}}
export function uniqueRecords(rows){const map=new Map();for(const p of rows||[]){if(!p||!Number.isFinite(Date.parse(p.date)))continue;const k=ledgerKey(p),old=map.get(k);if(!old)map.set(k,cleanPrediction(p));else map.set(k,{...old,obtainedVia:[...new Set([...(old.obtainedVia||[]),...(p.obtainedVia||[])])]})}return [...map.values()]}
export function mergePending(existing,incoming,history=[],origin='legacy',now=Date.now()){
 const settled=new Set(history.map(ledgerKey));
 return uniqueRecords([...existing,...incoming.map(p=>({...p,savedAt:p.savedAt||now,obtainedVia:p.obtainedVia?.length?p.obtainedVia:[origin]}))]).filter(p=>!settled.has(ledgerKey(p)));
}
export function gradeName(g){return new Map([[1,'Thắng'],[.5,'Thắng nửa'],[0,'Hòa'],[-.5,'Thua nửa'],[-1,'Thua']]).get(g)||'Chờ kết quả'}
export function ledgerTotals(history,pending){const h=uniqueRecords(history),p=mergePending(pending,[],h),all=[...h,...p];const market=key=>{const r={total:all.length,win:0,halfWin:0,push:0,halfLoss:0,loss:0,pending:0};for(const row of all){const g=row[key];const bucket=new Map([[1,'win'],[.5,'halfWin'],[0,'push'],[-.5,'halfLoss'],[-1,'loss']]).get(g);r[bucket||'pending']++}return r};return {matches:all.length,manual:all.filter(p=>p.obtainedVia?.includes('manual')).length,background:all.filter(p=>p.obtainedVia?.includes('background')).length,featured:all.filter(p=>p.obtainedVia?.includes('featured')).length,legacy:all.filter(p=>!p.obtainedVia?.length||p.obtainedVia?.includes('legacy')).length,AH:market('ahGrade'),OU:market('ouGrade')}}
