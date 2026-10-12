import {chooseR55Ensemble,expectedReturn} from "lib/r55EnsembleV3.js";
import {releaseDecision} from "lib/r55ReleaseGate.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 const m={id:"BDL_999991",priority:280,home:"Example Home",away:"Example Away",
  kickoff:"2026-10-20T12:00:00.000Z",market:{homeLine:-.25,awayLine:.25,
   ouLine:2.75,homePrice:1.95,awayPrice:1.90,overPrice:1.95,underPrice:1.90,
   bookmakerCount:4,ahLineSpread:0,ouLineSpread:0,bookmakerNames:["Bet365","12Bet","Crown","Sbobet"]}};
 const h={home:{n:20,gf:2.2,ga:.9},away:{n:20,gf:.85,ga:1.9},h2h:{n:10,edge:.2,total:2.8}};
 const native={model:{xg_home:2.4,xg_away:.75},market_risk:{bookmaker_disagreement:false},
   ah:{pick:m.home,signal_score:75},ou:{pick:"Over",signal_score:65}};
 const best=chooseR55Ensemble(m,h,native);
 const unstable=chooseR55Ensemble({...m,market:{...m.market,bookmakerCount:1}},h,native);
 const frozenCandidate={...m,method:best?.method,market:best?{...best,bookmakers:4,
  expectedEV:best.ev,worstEV:best.worstEV,modelAgreement:best.agree,evidence:best.evidence}:null};
 const noHistoryRank=releaseDecision(frozenCandidate,[],true);
 const ahHome=expectedReturn("AH","HOME",-.25,1.95,2.4,.8);
 const ahAway=expectedReturn("AH","AWAY",.25,1.9,2.4,.8);
 const tests={
  deterministicCandidate:!!best&&["AH","OU"].includes(best.type)&&
    ["HOME","AWAY","OVER","UNDER"].includes(best.pick),
  rejectsOneBook:!unstable||unstable.researchOnly===true,
  noUnverifiedMethodRelease:noHistoryRank.ok===false,
  respectsAsianSigns:ahHome>ahAway,
  finiteExpectedReturn:[ahHome,ahAway].every(Number.isFinite),
  modelHasThreeVotes:best?.agree>=0&&best.agree<=3
 };
 return res.status(Object.values(tests).every(Boolean)?200:422).json({ok:Object.values(tests).every(Boolean),
  tests,best:best?{type:best.type,pick:best.pick,line:best.line,ev:best.ev,
    worstEV:best.worstEV,researchOnly:best.researchOnly,reason:best.reason}:null,
  noHistoryRank:noHistoryRank.reason,scores:{homeAH:Number(ahHome.toFixed(4)),awayAH:Number(ahAway.toFixed(4))}});
}