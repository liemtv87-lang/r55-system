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
test("never attributes H2H bookmaker odds to an embedded score that does not match",()=>{
 const h=extractRichBongdaluHistory(example());
 assert.equal(h.homeRows.length,20);
 assert.equal(h.homeRows[0].matchId,null);
 assert.equal(h.homeRows[0].quotes.length,0);
 // The independently rendered H2H row remains valid and keeps its own prices.
 assert.equal(h.h2hRows[0].quotes.length,2);
 assert.equal(h.sourceCoverage.bookmakerCount,2);
});
test("retains AH/OU bookmaker prices when rendered and embedded score identity agrees",()=>{
 // The first visible row has the same identity, score and team side as h_data[0].
 const html=example().replace('info="2,1,101"','info="0,0,101"').replace('>2-1</td>','>0-0</td>');
 const h=extractRichBongdaluHistory(html);
 assert.equal(h.sourceCoverage.bookmakerCount,2);
 assert.equal(h.homeRows[0].quotes.length,2);
 assert.equal(h.homeRows[0].quotes[1].ahClosing,-.25);
 assert.equal(h.homeRows[0].quotes[0].ouOpening,2.5);
 assert.equal(h.homeRows[1].quotes.length,0);
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

import {BONGDALU_BOOKMAKERS,bookmakerMarketConsensus,bookmakerSideAgreement} from "../lib/r55BookmakerConsensus.js";
test("18 candidate Bongdalu bookmaker source IDs are unique",()=>{
 assert.equal(BONGDALU_BOOKMAKERS.length,18);
 assert.equal(new Set(BONGDALU_BOOKMAKERS.map(x=>x[1])).size,18);
 assert.equal(bookmakerMarketConsensus([]).AH.availableBookmakers,0);
});
test("counts line agreement only for identical published AH/OU quotes",()=>{
 const q=[
 {bookmaker:"A",bookmakerId:"8",homeLine:-.5,ouLine:2.5,homePrice:1.80,awayPrice:2.02,overPrice:1.9,underPrice:1.97},
 {bookmaker:"B",bookmakerId:"31",homeLine:-.5,ouLine:2.5,homePrice:1.82,awayPrice:2.01,overPrice:1.91,underPrice:1.99},
 {bookmaker:"C",bookmakerId:"24",homeLine:-.5,ouLine:2.75,homePrice:1.81,awayPrice:2.00,overPrice:1.95,underPrice:1.94},
 {bookmaker:"D",bookmakerId:"3",homeLine:-.25,ouLine:2.75,homePrice:1.72,awayPrice:2.1,overPrice:1.96,underPrice:1.93}
 ];
 const c=bookmakerMarketConsensus(q);
 assert.equal(c.AH.availableBookmakers,4);assert.equal(c.AH.consensusLine,-.5);
 assert.equal(c.AH.lineVotes,3);assert.equal(c.AH.lineShare,.75);
 const ah=bookmakerSideAgreement(q,{type:"AH",pick:"HOME",line:-.5});
 assert.equal(ah.sameLineBookmakers,3);assert.equal(ah.priceLeanForPick,3);
 const ou=bookmakerSideAgreement(q,{type:"OU",pick:"UNDER",line:2.75});
 assert.equal(ou.sameLineBookmakers,2);assert.equal(ou.priceLeanForPick,1);assert.equal(ou.neutralPriceVotes,1);
 assert.equal(bookmakerSideAgreement(q,{type:"AH",pick:"HOME",line:-1}).sameLineBookmakers,0);
});

test("bookmaker consensus counts real decimal prices, not Hong Kong raw quotes",()=>{
 const q=[
  {bookmaker:"Bet365",bookmakerId:"8",homeLine:-0.5,ouLine:2.5,homePrice:1.91,awayPrice:1.94,overPrice:1.92,underPrice:1.90},
  {bookmaker:"Sbobet",bookmakerId:"31",homeLine:-0.5,ouLine:2.5,homePrice:1.90,awayPrice:1.95,overPrice:1.88,underPrice:1.96}
 ];
 const c=bookmakerMarketConsensus(q);
 assert.equal(c.AH.availableBookmakers,2);
 assert.equal(c.AH.lineVotes,2);
 assert.equal(c.OU.availableBookmakers,2);
 assert.equal(c.OU.lineVotes,2);
});
