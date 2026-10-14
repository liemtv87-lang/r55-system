// R55 release gate: historical evidence is a REQUIREMENT, not a cosmetic bonus.
// The fixed daily snapshot remains an immutable research/audit record.
export function releaseDecision(match, methods, freshness=true){
 const k=match?.market||{},method=String(k.method||match?.method||"");
 const row=(Array.isArray(methods)?methods:[]).find(x=>x.method===method&&x.type===k.type);
 if(freshness!==true) return {ok:false,reason:"performance_audit_stale"};
 if(!row) return {ok:false,reason:"method_not_backtested"};
 if(row.eligible!==true||Number(row.n)<50||Number(row.days)<5||!(Number(row.units)>0)||!(Number(row.wilsonLower)>.47))
  return {ok:false,reason:"method_failed_walk_forward",record:{n:row.n,days:row.days,units:row.units,winRate:row.winRate}};
 // New ensemble signals are expected-return estimates, NOT the old native
 // synthetic confidence score. Never release a shadow/research-only outcome.
 if(["ensemble_poisson_three_scenarios_v3","ensemble_poisson_three_scenarios_v4_native_agreement"].includes(k.modelVersion)){
  if(k.researchOnly!==false||!(Number(k.expectedEV)>.085)||
     !(Number(k.expectedEV)<.24)||!(Number(k.worstEV)>.025)||
     !(Number(k.modelSpread)<.25)||Number(k.modelAgreement)!==3||
     Number(k.bookmakers)<3||Number(k.modelAgreement)!==3)
   return {ok:false,reason:"ensemble_ev_or_agreement_failed"};
 }else if(!["AH","OU"].includes(k.type)||Number(k.evidence)<70)
  return {ok:false,reason:"weak_or_invalid_signal"};
 if(k.researchOnly===true)return {ok:false,reason:"research_only_not_certified"};
 if(!Number.isFinite(Number(k.odds))||Number(k.odds)<=1)
  return {ok:false,reason:"odds_out_of_range"};
 if(!Number.isFinite(Date.parse(String(match.kickoff||""))))
  return {ok:false,reason:"missing_kickoff"};
 return {ok:true,reason:"passed_quality_gate"};
}
export function freshRanking(row,now=Date.now()){
 const updated=Date.parse(String(row?.updatedAt||""));
 return Number.isFinite(updated)&&now-updated>=0&&now-updated<36*3600000;
}