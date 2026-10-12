import {bookId,marketPairs,eligibleMainPair,bestCluster,gradeAsian} from "lib/legacyR55Market.js";
import {powerProbability,challengerProbabilities,eligibleMethod} from "lib/legacyR55Research.js";
export const access="admin";export const methods=["GET"];
export default async function(req,res){
 const row={od:[{bookmakers:["A","B"].map(name=>({name,bets:[{name:"Asian Handicap",values:[{value:"Home -0.75",odd:"1.91"},{value:"Away +0.75",odd:"1.93"}]},{name:"Goals Over/Under",values:[{value:"Over 2.5",odd:"1.89"},{value:"Under 2.5",odd:"1.95"}]}]}))}]};
 const ah=bestCluster(marketPairs(row,"AH")),ou=bestCluster(marketPairs(row,"OU"));
 const early={power_consensus:{events:Array.from({length:59},()=>({profit:1,baselineProfit:0,g:1,baselineGrade:0}))}};
 const mature={power_consensus:{events:Array.from({length:60},()=>({profit:1,baselineProfit:0,g:1,baselineGrade:0}))}};
 const checks={
  importedMainAsianLine:ah?.line===-0.75&&ah?.g?.length===2,
  importedMainGoalLine:ou?.line===2.5&&ou?.g?.length===2,
  originalQuarterSettlement:gradeAsian(1,-0.75)===0.5,
  originalPowerProbability:Number.isFinite(powerProbability(1.91,1.93)),
  notLearnWithTooFewMatches:eligibleMethod("power_consensus",early)===false,
  eligibleAfterRealEvidence:eligibleMethod("power_consensus",mature)===true,
  challengerProbability:Math.abs(challengerProbabilities([{lo:2,ro:2}]).power_consensus-0.5)<.0001
 };
 const ok=Object.values(checks).every(Boolean);
 return res.status(ok?200:422).json({ok,checks,source:"original GitHub R55 archive Sept 2026",syntheticInputsOnly:true,productionPredictionUntouched:true});
}