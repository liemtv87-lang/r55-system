// H2H may be audited and shown as supplementary background, but must not
// influence the primary match-model direction or qualification.
// Preserve each team's form, historical AH/OU and all verified current odds.
export function primaryFormEvidence(history){
 if(!history || typeof history!=="object")return history;
 const zeroRate={n:0,win_rate:0.5};
 return {...history,
  h2h:{n:0,edge:0,total:0},
  h2h_asian:{opening:{...zeroRate},closing:{...zeroRate},
    ou_open:{...zeroRate},ou_close:{...zeroRate}}
 };
}
