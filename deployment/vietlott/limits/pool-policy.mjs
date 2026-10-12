// KQ247: portfolio size limits apply ONLY to final reduced combinations.
// Hard-filtered candidate universe may be larger internally, but must never be
// reported as achieved jackpot/G1 performance at the ticket investment budget.
export const PORTFOLIO_POLICY=Object.freeze({
  mega645:Object.freeze({target:200_000,max:220_000,label:'Mega 6/45'}),
  power655:Object.freeze({target:600_000,max:650_000,label:'Power 6/55'})
});
export function portfolioPolicy(product){
  const p=PORTFOLIO_POLICY[product];
  if(!p)throw new Error('Unknown Vietlott product: '+String(product));
  return p;
}
export function assertPortfolioSize(product,count,{allowUnderTarget=false}={}){
  const p=portfolioPolicy(product);
  if(!Number.isSafeInteger(count)||count<0||count>p.max)
    throw new Error('PORTFOLIO_LIMIT_EXCEEDED '+product+' '+count+' > '+p.max);
  if(!allowUnderTarget&&count!==p.target)
    throw new Error('PORTFOLIO_WRONG_SIZE '+product+' '+count+' != '+p.target);
  return count;
}
