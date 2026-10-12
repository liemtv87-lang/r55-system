import {extractMarkets} from "lib/apiFootball.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const test=[
  ["asian_separate_handicap",[ {name:"Asian Handicap",values:[{value:"Home",handicap:"-0.75",odd:"1.93"},{value:"Away",handicap:"+0.75",odd:"1.95"}]} ],2],
  ["asian_inline_handicap",[ {name:"Asian Handicap",values:[{value:"Home -0.5",odd:"1.91"},{value:"Away +0.5",odd:"1.96"}]} ],2],
  ["totals_inline",[ {name:"Goals Over/Under",values:[{value:"Over 2.5",odd:"1.91"},{value:"Under 2.5",odd:"1.96"}]} ],2],
  ["totals_handicap_property",[ {name:"Goals Over/Under",values:[{value:"Over",handicap:"2.25",odd:"1.87"},{value:"Under",handicap:"2.25",odd:"1.99"}]} ],2],
  ["missing_handicap",[ {name:"Asian Handicap",values:[{value:"Home",odd:"1.91"}]} ],0],
  ["suspended_excluded",[ {name:"Goals Over/Under",values:[{value:"Over 2.5",odd:"1.99",suspended:true}]} ],0],
  ["other_half_markets_excluded",[ {name:"Asian Handicap (1st Half)",values:[{value:"Home",handicap:"-0.25",odd:"1.85"}]} ],0],
  ["contradictory_line_excluded",[ {name:"Asian Handicap",values:[{value:"Home -0.5",handicap:"-0.75",odd:"1.85"}]} ],0]
 ];
 const checks=Object.fromEntries(test.map(([k,bets,count])=>[k,extractMarkets(bets,"TestBook").length===count]));
 const passed=Object.values(checks).every(Boolean);
 return res.status(passed?200:422).json({ok:passed,checks,syntheticTestsOnly:true,sourceHits:0});
}