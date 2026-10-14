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
 if(typeof html!=="string")return [];
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
