// Bongdalu may return a 200 HTML security challenge for an odds page.
// It is not source data and must never be counted as a successful scrape.
export function isBongdaluSecurityChallenge(html){
 const s=String(html||"");
 return /<title[^>]*>\s*(?:Security Verification|Just a moment\.{0,3}|Access Denied)\s*<\/title>/i.test(s)||
   /(?:cf-chl-|challenge-platform|verify you are human|security verification)/i.test(s.slice(0,15000))&&
     !/<tr\b[^>]*\bid=["']tr_o_/i.test(s);
}
// A HTTP 200 can be a CDN/bot-protection challenge rather than Bongdalu odds.
// Never report such a response as a successful odds-comparison collection.
export function oddsComparisonPageState(html){
 if(typeof html!=="string"||!html.trim())return "fetch_failed";
 if(/<title[^>]*>\s*Security Verification\s*<\/title>/i.test(html)||
    /(?:cf-chl|captcha|verify you are human|security verification)/i.test(html))return "security_challenge";
 if(!/<tr\b[^>]*\bid=["']tr_o_[12]_\d+["']/i.test(html))return "unrecognized_layout";
 return "genuine_odds_rows";
}
// Supplement the daily XML bookmaker sample with every company rendered by
// Bongdalu's official odds-comparison page. A missing page never creates odds.
const clean=s=>String(s||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
function handicap(s){
 const raw=clean(s).replace(/\s/g,"").replace(/−/g,"-");
 if(/^[-+]?\d+(?:\.\d+)?$/.test(raw))return Number(raw);
 const m=raw.match(/^([-+]?\d+(?:\.\d+)?)\/([-+]?\d+(?:\.\d+)?)$/);
 return m?(Number(m[1])+Number(m[2]))/2:null;
}
export function collectBongdaluPageBookmakers(html){
 if(oddsComparisonPageState(html)!=="genuine_odds_rows")return [];
 const books=new Map();
 for(const match of html.matchAll(/<tr\b[^>]*\bid=["']tr_o_([12])_(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi)){
  const stage=Number(match[1]),id=String(match[2]),row=match[3];
  const cells=[...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>clean(x[1]));
  const k=cells.findIndex(x=>/^(Live|Sớm|Som|Initial|Early|Ban đầu|Ban dau)$/i.test(x));
  if(k<0||cells.length<=k+6)continue;
  const hp=Number(cells[k+1]),ap=Number(cells[k+3]),op=Number(cells[k+4]),up=Number(cells[k+6]);
  const ah=handicap(cells[k+2]),ou=handicap(cells[k+5]);
  if(ah===null||ou===null||![hp,ap,op,up].every(x=>Number.isFinite(x)&&x>.05&&x<=3)||
     Math.abs(ah)>6||ou<1.25||ou>7)continue;
  const name=cells.find((v,i)=>i<k&&v&&v.length<90&&!/^(Live|Sớm|Ban đầu)$/i.test(v))||("Bongdalu #"+id);
  const quote={bookmaker:id,name,homeLine:-ah,ouLine:ou,homePrice:hp,awayPrice:ap,
    overPrice:op,underPrice:up,source:"bongdalu_oddscomp_page"};
  const prior=books.get(id);
  if(!prior||stage>prior.stage)books.set(id,{stage,quote});
 }
 return [...books.values()].map(x=>x.quote);
}
