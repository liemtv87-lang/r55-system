import {settle} from "lib/r55Settlement.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const t=[
  {name:"AH_home_minus_half_win",m:{type:"AH",pick:"HOME",line:-.5,odds:1.85},h:2,a:1,want:"win"},
  {name:"AH_home_minus_half_loss",m:{type:"AH",pick:"HOME",line:-.5,odds:1.85},h:1,a:1,want:"loss"},
  {name:"AH_away_plus_quarter_draw",m:{type:"AH",pick:"AWAY",line:.25,odds:1.85},h:1,a:1,want:"half_win"},
  {name:"AH_home_minus_quarter_draw",m:{type:"AH",pick:"HOME",line:-.25,odds:1.85},h:1,a:1,want:"half_loss"},
  {name:"OU_over_175_two_goals",m:{type:"OU",pick:"OVER",line:1.75,odds:1.85},h:1,a:1,want:"half_win"},
  {name:"OU_under_175_two_goals",m:{type:"OU",pick:"UNDER",line:1.75,odds:1.85},h:1,a:1,want:"half_loss"},
  {name:"OU_under_225_two_goals",m:{type:"OU",pick:"UNDER",line:2.25,odds:1.85},h:1,a:1,want:"half_win"},
  {name:"OU_over_225_two_goals",m:{type:"OU",pick:"OVER",line:2.25,odds:1.85},h:1,a:1,want:"half_loss"},
  {name:"OU_over_300_three_goals",m:{type:"OU",pick:"OVER",line:3,odds:1.85},h:2,a:1,want:"push"},
  {name:"OU_under_275_three_goals",m:{type:"OU",pick:"UNDER",line:2.75,odds:1.85},h:2,a:1,want:"half_loss"},
  {name:"OU_over_275_three_goals",m:{type:"OU",pick:"OVER",line:2.75,odds:1.85},h:2,a:1,want:"half_win"}
 ];
 const results=t.map(x=>{const g=settle(x.m,x.h,x.a);return{name:x.name,expected:x.want,actual:g?.result,profitUnits:g?.profitUnits,ok:g?.result===x.want}});
 const passed=results.filter(x=>x.ok).length;
 return res.status(passed===t.length?200:422).json({ok:passed===t.length,passed,total:t.length,results});
}