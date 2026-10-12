import {settle} from "lib/r55Settlement.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const tests=[
  ["under175_two_goals",{type:"OU",pick:"UNDER",line:1.75,odds:1.9},1,1,"half_loss"],
  ["over175_two_goals",{type:"OU",pick:"OVER",line:1.75,odds:1.9},1,1,"half_win"],
  ["over175_one_goal",{type:"OU",pick:"OVER",line:1.75,odds:1.9},1,0,"loss"],
  ["home_minus075_one_goal",{type:"AH",pick:"HOME",line:-0.75,odds:1.8},2,1,"half_win"],
  ["away_plus025_draw",{type:"AH",pick:"AWAY",line:0.25,odds:1.9},0,0,"half_win"],
  ["over2_exact_two_goals",{type:"OU",pick:"OVER",line:2,odds:1.9},1,1,"push"],
  ["under25_two_goals",{type:"OU",pick:"UNDER",line:2.5,odds:1.9},2,0,"win"]
 ];
 const checks=Object.fromEntries(tests.map(([name,market,h,a,expected])=>[name,settle(market,h,a)?.result===expected]));
 const passed=Object.values(checks).every(Boolean);
 return res.status(passed?200:422).json({ok:passed,checks,syntheticTestsOnly:true,realMatchResultsWritten:false});
}