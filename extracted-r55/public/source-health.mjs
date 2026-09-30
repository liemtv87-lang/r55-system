// Mutually exclusive source outcomes; HTTP success is not market verification.
export function sourceCategory(x={}) {
 const both=Number(x.both??x.completeCount??x.count??0);
 const rows=Number(x.rows??x.rawCount??0), ah=Number(x.ah??x.ahCount??0), ou=Number(x.ou??x.ouCount??0);
 const reason=String(x.reason||''), status=String(x.status||'');
 if(both>0)return 'healthy';
 if(rows>0||ah>0||ou>0)return 'partial';
 if(reason==='source_request_budget'||status==='budget')return 'budget';
 if(reason==='backend_request_failed')return 'backendFail';
 if(reason==='access_blocked'||reason==='rate_limited'||['blocked','quota'].includes(status))return 'blocked';
 if(reason==='connection_or_timeout'||/timeout/.test(status))return 'timeout';
 if(reason==='no_parsed_markets'||status==='unparsed')return 'noParsed';
 if(status==='cooldown')return 'cooldown';
 if(status==='quarantine')return 'quarantine';
 if(status==='empty')return 'empty';
 return 'other';
}
export function summarizeSources(results=[],total=results.length) {
 const h={total,checked:0,healthy:0,partial:0,bad:0,empty:0,cooldown:0,quarantine:0,timeout:0,blocked:0,noParsed:0,backendFail:0,budget:0,other:0};
 for(const x of results){if(!x||x.status==='not-needed')continue;h.checked++;const k=sourceCategory(x);h[k]++;if(['timeout','blocked','noParsed','backendFail','budget','other'].includes(k))h.bad++;}
 return h;
}
