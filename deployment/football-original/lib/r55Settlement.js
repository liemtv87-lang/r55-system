// Full-time (90-minute) football AH/OU grading. The immutable pre-match snapshot is never rewritten.
function one(m,home,away,handicap){
 const value=m.type==="OU"?(m.pick==="OVER"?home+away-handicap:handicap-home-away):
 m.pick==="HOME"?home-away+handicap:away-home+handicap;
 return value>1e-7?1:value<(-1e-7)?-1:0;
}
export function settle(m,home,away){
 const odds=Number(m?.odds),line=Number(m?.line);
 if(!m||!["AH","OU"].includes(m.type)||!["HOME","AWAY","OVER","UNDER"].includes(m.pick)
 ||(m.type==="AH"&&!["HOME","AWAY"].includes(m.pick))
 ||(m.type==="OU"&&!["OVER","UNDER"].includes(m.pick))
 ||!Number.isInteger(home)||!Number.isInteger(away)||home<0||away<0
 ||!Number.isFinite(line)||Math.abs(line*4-Math.round(line*4))>1e-7
 ||!Number.isFinite(odds)||odds<1.01||odds>20)return null;
 const split=Math.abs(line*4)%2===1?[line-0.25,line+0.25]:[line];
 const units=split.map(x=>one(m,home,away,x));
 const payout=units.map(x=>x===1?odds-1:x===-1?-1:0).reduce((a,b)=>a+b,0)/units.length;
 const unit=units.reduce((a,b)=>a+b,0)/units.length;
 return {unit,result:unit===1?"win":unit===0.5?"half_win":unit===0?"push":unit===-0.5?"half_loss":"loss",profitUnits:Math.round(payout*10000)/10000};
}