// All prices below must originate from Bongdalu's actual company-specific XML.
export const BONGDALU_BOOKMAKERS=[
 ["Bet365","8"],["Sbobet","31"],["12Bet","24"],["Crown","3"],["Easybets","12"],
 ["Macauslot","1"],["Ladbrokes","4"],["SNAI","7"],["William Hill","9"],
 ["Vcbet","14"],["Mansion88","17"],["Interwetten","19"],["10BET","22"],
 ["Wewbet","35"],["18bet","42"],["HK Jockey Club","48"],["Bwin","49"],["1xbet","50"]
];
const finite=x=>x!==null&&x!==undefined&&String(x).trim()!==""&&Number.isFinite(Number(x));
const quarter=x=>finite(x)&&Math.abs(Number(x)*4-Math.round(Number(x)*4))<.01;
function usable(quotes,type){
 const line=type==="AH"?"homeLine":"ouLine",prices=type==="AH"?["homePrice","awayPrice"]:["overPrice","underPrice"];
 const unique=new Map();
 for(const q of Array.isArray(quotes)?quotes:[]){
  if(!q||!quarter(q[line])||prices.some(k=>!finite(q[k])||Number(q[k])<=1.05||Number(q[k])>4))continue;
  if(type==="OU"&&(Number(q.ouLine)<.5||Number(q.ouLine)>8))continue;
  const name=String(q.bookmaker||"").trim();if(name)unique.set(String(q.bookmakerId||name),q);
 }
 return [...unique.values()];
}
function modeLine(quotes,field){
 const m=new Map();for(const q of quotes){const n=Number(q[field]);const k=n.toFixed(2);m.set(k,(m.get(k)||0)+1);}
 const ranks=[...m].sort((a,b)=>b[1]-a[1]||Math.abs(Number(a[0]))-Math.abs(Number(b[0]))||Number(a[0])-Number(b[0]));
 return ranks.length?{line:Number(ranks[0][0]),votes:ranks[0][1],share:+(ranks[0][1]/quotes.length).toFixed(4),distribution:ranks.map(([l,v])=>({line:Number(l),votes:v}))}:null;
}
// Bookmaker quote-price lean is NOT a recommendation or a calibrated probability.
export function bookmakerMarketConsensus(quotes){
 const result={};
 for(const type of ["AH","OU"]){
  const rows=usable(quotes,type),field=type==="AH"?"homeLine":"ouLine",mode=modeLine(rows,field);
  const same=mode?rows.filter(q=>Math.abs(Number(q[field])-mode.line)<.001):[];
  const a=type==="AH"?"homePrice":"overPrice",b=type==="AH"?"awayPrice":"underPrice";
  const leanA=same.filter(q=>Number(q[a])+.025<Number(q[b])).length;
  const leanB=same.filter(q=>Number(q[b])+.025<Number(q[a])).length;
  result[type]={availableBookmakers:rows.length,consensusLine:mode?.line??null,lineVotes:mode?.votes||0,
   lineShare:mode?.share??null,lineDistribution:mode?.distribution||[],
   priceLeanFirst:leanA,priceLeanSecond:leanB,neutral:same.length-leanA-leanB,
   priceLeanMajority:leanA>leanB?(type==="AH"?"HOME":"OVER"):
    leanB>leanA?(type==="AH"?"AWAY":"UNDER"):"NONE"};
 }
 return result;
}
export function bookmakerSideAgreement(quotes,option){
 const type=String(option?.type||"");if(!["AH","OU"].includes(type))return {availableBookmakers:0,reason:"unknown_market"};
 const rows=usable(quotes,type),field=type==="AH"?"homeLine":"ouLine";
 const target=type==="AH"&&option.pick==="AWAY"?-Number(option.line):Number(option.line);
 const same=quarter(target)?rows.filter(q=>Math.abs(Number(q[field])-target)<.001):[];
 const first=option.pick===(type==="AH"?"HOME":"OVER");
 const a=type==="AH"?"homePrice":"overPrice",b=type==="AH"?"awayPrice":"underPrice";
 let yes=0,no=0,neutral=0;
 for(const q of same){const own=Number(q[first?a:b]),other=Number(q[first?b:a]);
  if(own+.025<other)yes++;else if(other+.025<own)no++;else neutral++;}
 const decisive=yes+no,mode=modeLine(rows,field);
 return {availableBookmakers:rows.length,sameLineBookmakers:same.length,
  lineCoverage:rows.length?+(same.length/rows.length).toFixed(4):0,consensusLine:mode?.line??null,
  consensusLineVotes:mode?.votes||0,priceLeanForPick:yes,priceLeanAgainstPick:no,
  neutralPriceVotes:neutral,priceLeanSupportShare:decisive?+(yes/decisive).toFixed(4):null,
  strongOpposition:decisive>=4&&no/decisive>=.75};
}
