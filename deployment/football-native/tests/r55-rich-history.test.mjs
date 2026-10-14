import test from "node:test";
import assert from "node:assert/strict";
import {extractRichBongdaluHistory} from "../lib/r55RichHistory.js";
import {collectBongdaluPageBookmakers} from "../lib/r55BookmakerPage.js";
import {releaseDecision} from "../../football-original/lib/r55ReleaseGate.js";

const rows = n=>Array.from({length:n},(_,i)=>[101,300+i,i%4,i%2]);
const tr = (table,n)=>Array.from({length:n},(_,i)=>
 '<tr id="tr'+table+'_'+(i+1)+'" index="'+(50000+i)+'" info="2,1,101">'+
 '<td>16/10/2026</td><td class="fscore_'+table+' red2">2-1</td></tr>').join("");
function example(){
 return '<script>var h2h_home = 101; var h2h_away = 202;'+
 'var h_data = '+JSON.stringify(rows(20))+';'+
 'var a_data = '+JSON.stringify(Array.from({length:20},(_,i)=>[202,600+i,i%3,i%2]))+';'+
 'var Vs_hOdds = '+JSON.stringify([[50000,8,0,-.5,0,0,-.5,0,2.5,2.75],[50000,31,0,-.5,0,0,-.25,0,2.5,2.5]])+';</script>'+
 '<table id="table_v1">'+tr(1,10)+'</table>'+
 '<table id="table_v2">'+tr(2,10)+'</table>'+
 '<table id="table_v3">'+tr(3,10)+'</table>';
}
test("reads all 20 embedded matches, not only 10 displayed",()=>{
 const h=extractRichBongdaluHistory(example());
 assert.equal(h.homeRows.length,20);
 assert.equal(h.awayRows.length,20);
 assert.equal(h.sourceCoverage.requestedPerTeam,20);
 assert.equal(h.sourceCoverage.homeMatches,20);
 assert.equal(h.homeSummary.n,20);
});
test("retains AH/OU price history by bookmaker from real source variables",()=>{
 const h=extractRichBongdaluHistory(example());
 assert.equal(h.sourceCoverage.bookmakerCount,2);
 assert.equal(h.homeRows[0].quotes.length,2);
 assert.equal(h.homeRows[0].quotes[1].ahClosing,-.25);
 assert.equal(h.homeRows[0].quotes[0].ouOpening,2.5);
});
test("does not create played results when source lacks score rows",()=>{
 const h=extractRichBongdaluHistory("<html>"+'x'.repeat(150)+"</html>");
 assert.equal(h.homeRows.length,0);
 assert.equal(h.awayRows.length,0);
 assert.equal(h.sourceCoverage.historicalPriceRows,0);
});

test("odds comparison captures all genuine company rows and ignores malformed prices",()=>{
 const row=(id,price)=>'<tr id="tr_o_2_'+id+'"><td>Book '+id+'</td><td>Live</td>'+
 '<td>'+price+'</td><td>0/0.5</td><td>0.91</td><td>0.90</td>'+
 '<td>2.5</td><td>0.92</td></tr>';
 const parsed=collectBongdaluPageBookmakers(row("31","0.90")+row("8","0.95")+row("999","bad"));
 assert.equal(parsed.length,2);
 assert.equal(parsed[0].homeLine,-0.25);
 assert.equal(parsed[1].bookmaker,"8");
});
test("R55 ensemble v4 research-only can never pass historical release gate",()=>{
 const m={priority:300,kickoff:new Date(Date.now()+3600000).toISOString(),
  market:{type:"AH",method:"r55_ensemble_v4_ah",modelVersion:"ensemble_poisson_three_scenarios_v4_native_agreement",
   researchOnly:true,expectedEV:.12,worstEV:.05,modelSpread:.11,modelAgreement:3,
   bookmakers:5,odds:1.91,evidence:99}};
 const methods=[{method:"r55_ensemble_v4_ah",type:"AH",eligible:true,n:100,days:10,units:4,wilsonLower:.55}];
 assert.equal(releaseDecision(m,methods,true).ok,false);
});
