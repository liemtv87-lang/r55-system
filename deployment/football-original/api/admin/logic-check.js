import {rankFromOdds} from "lib/r55Consensus.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const pair=(line,bks=["Alpha","Beta"])=>bks.flatMap((name,i)=>[
  {type:"OU",pick:"OVER",line,odds:i?1.72:1.70,bookmaker:name},
  {type:"OU",pick:"UNDER",line,odds:i?2.13:2.15,bookmaker:name}
 ]);
 const good=rankFromOdds({markets:pair(2.5)});
 const oneBook=rankFromOdds({markets:pair(2.5,["Alpha"])});
 const warning175=rankFromOdds({markets:pair(1.75)});
 const noOpposite=rankFromOdds({markets:pair(2.5).filter(m=>m.pick==="OVER")});
 const checks={
  selectsOneAHorOU:!!good&&["AH","OU"].includes(good.type),
  prefersMarketSupportedSide:good?.pick==="OVER"&&good?.line===2.5,
  requiresTwoBookmakers:!oneBook,
  avoidsUnsupported175Over:!warning175||warning175.pick!=="OVER",
  rejectsMissingOppositeOdds:!noOpposite,
  probabilityIsOnlyImplied:good?.confidence<1
 };
 const passed=Object.values(checks).every(Boolean);
 res.status(passed?200:422).json({ok:passed,checks,selected:good?{type:good.type,pick:good.pick,line:good.line,bookmakers:good.bookmakers,method:"implied_market_consensus"}:null,disclaimer:"Synthetic unit inputs only, not real predictions and not stored as snapshots"});
}