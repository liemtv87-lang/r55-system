// R55 form-first evidence adapter.
// H2H remains available in the original history record for optional research
// display, but it must not affect the native model's scoring direction,
// confidence, or eligibility (first-time World Cup/UEFA fixtures are normal).
export function primaryFormAndOddsHistory(h){
 if(!h||typeof h!=="object")return h;
 return {...h,h2h:{n:0,edge:0,total:0},h2h_asian:null,
  // Keep both teams' actual pre-match form and Asian/O-U history unchanged.
  home:h.home,away:h.away,home_asian:h.home_asian,away_asian:h.away_asian};
}
