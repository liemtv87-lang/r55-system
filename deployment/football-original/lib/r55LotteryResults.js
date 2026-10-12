// Independent result reader: strict draw-date + full prize-set validation.
// A partially drawn table must never be scored or announced.
export const MINHNGOC_URL="https://www.minhngoc.net/";
const LABEL={xsmn:"Miền Nam",xsmt:"Miền Trung",xsmb:"Miền Bắc"};
const nkeys={xsmn:18,xsmt:18,xsmb:27};
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[Đđ]/g,"D").replace(/[^a-z0-9]/gi,"").toLowerCase();
const pad=s=>String(s).padStart(2,"0");
export const formattedDay=day=>day.slice(8,10)+"/"+day.slice(5,7)+"/"+day.slice(0,4);
const REGEX_PRIZES=/<td\s+class="(?:giai[1-8]|giaidb)"\s*>([\s\S]*?)<\/td>/gi;
const REGEX_NUMBERS=/<div(?:\s[^>]*)?>(\d{2,6})<\/div>/g;
function parsePrizes(s,expected){
 const arr=[];const prizes=[...s.matchAll(REGEX_PRIZES)];
 for(const p of prizes)for(const v of p[1].matchAll(REGEX_NUMBERS))arr.push(v[1]);
 const special=prizes.filter(x=>x[0].includes('class="giaidb"')).flatMap(x=>[...x[1].matchAll(REGEX_NUMBERS)].map(y=>y[1]));
 if(arr.length!==expected||special.length!==1||!/^\\d{5,6}$/.test(special[0]))return null;
 return {actual:arr.map(x=>x.slice(-2)),all:arr,special:special[0],complete:true};
}
export function parseResults(html,region,day){
 if(!LABEL[region]||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error("invalid_region_or_day");
 const date=formattedDay(day);
 const title="KẾT QUẢ XỔ SỐ KIẾN THIẾT "+date;
 const anchor=html.indexOf(title);
 if(anchor<0)throw Error("source_not_on_requested_date");
 const body=html.slice(anchor);
 const headings=Object.fromEntries(Object.entries(LABEL).map(([r,name])=>[r,body.indexOf("KẾT QUẢ XỔ SỐ "+name)]));
 const at=headings[region];if(at<0)throw Error("region_section_not_found");
 const end=Math.min(...Object.values(headings).filter(k=>k>at),body.length);
 const part=body.slice(at,end);
 if(!part.includes(date))throw Error("region_date_not_confirmed");
 if(region==="xsmb"){
  const match=part.match(/<table\b[^>]*class="bkqtinhmienbac"[^>]*>([\s\S]*?)<\/table>/i);
  if(!match)throw Error("xsmb_prize_table_missing");
  const scored=parsePrizes(match[0],27);
  if(!scored)throw Error("xsmb_results_not_fully_drawn");
  return {day,region,results:[{station:"XSMB",...scored}],source:"MinhNgoc"};
 }
 const match=[...part.matchAll(/<table\b[^>]*class="rightcl"[^>]*>([\s\S]*?)<\/table>/gi)];
 if(!match.length)throw Error("station_tables_missing");
 const results=[];
 for(const m of match){
  const station=m[0].match(/<td class="tinh"><a[^>]*>([^<]+)<\/a>/i)?.[1];
  if(!station)continue;
  const values=parsePrizes(m[0],nkeys[region]);
  if(!values)throw Error("station_not_fully_drawn_"+station);
  results.push({station,...values});
 }
 if(!results.length)throw Error("no_complete_station_results");
 return {day,region,results,source:"MinhNgoc"};
}
export async function getVerifiedDraw(region,day,expectedStations=[]){
 const r=await fetch(MINHNGOC_URL,{headers:{Accept:"text/html","User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(13000)});
 if(!r.ok)throw Error("minhngoc_http_"+r.status);
 const html=await r.text();if(html.length<7000||html.length>1200000)throw Error("minhngoc_html_size");
 const result=parseResults(html,region,day);
 const out=[];
 for(const name of expectedStations){
  const found=result.results.find(x=>norm(x.station)===norm(name));
  if(!found)throw Error("draw_not_available_for_"+name);
  out.push({...found,station:name});
 }
 if(!out.length)throw Error("missing_expected_stations");
 return {...result,results:out};
}
export function scoreStation(pick,result){
 if(!pick?.ok||!result?.complete)throw Error("incomplete_station_data");
 const numbers=pick.lotto3.map(n=>({num:n,hits:result.actual.filter(x=>x===n).length}));
 const doubles=pick.doubles.map(n=>({num:n,hits:result.actual.filter(x=>x===n).length}));
 const de=result.special.slice(-2),c3=result.special.slice(-3);
 return {station:pick.station,prize:result.special,de,c3,lotto_scored:numbers,doubles_scored:doubles,
  dan50:{inDan:pick.dan50.includes(de),size:pick.dan50.length},
  dan60:{inDan:pick.dan60.includes(de),size:pick.dan60.length},
  dan75:{inDan:pick.dan75.includes(de),size:pick.dan75.length},
  three_digit:{inDan:pick.three_digit.includes(c3),size:pick.three_digit.length}
 };
}