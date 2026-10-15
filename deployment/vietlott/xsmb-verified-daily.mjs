// Source-verified, full-27 XSMB results only. Never infer winning digits.
const specifications=[
  [/G\.?\s*(?:ĐB|Đặc\s*Biệt)|Giải\s*(?:ĐB|Đặc\s*Biệt)/i,1,5],
  [/G\.?\s*1\b|Giải\s*nhất/i,1,5],
  [/G\.?\s*2\b|Giải\s*nhì/i,2,5],
  [/G\.?\s*3\b|Giải\s*ba/i,6,5],
  [/G\.?\s*4\b|Giải\s*tư/i,4,4],
  [/G\.?\s*5\b|Giải\s*năm/i,6,4],
  [/G\.?\s*6\b|Giải\s*sáu/i,3,3],
  [/G\.?\s*7\b|Giải\s*bảy/i,4,2]
];
function plain(html){
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
}
function parseDatePage(html,date){
 const text=plain(html),dmy=date.split('-').reverse().join('/'),dash=dmy.replaceAll('/','-');
 const headings=/(?:XSMB|XSTD|Miền Bắc|miền bắc|Thủ đô)/gi;
 for(const m of text.matchAll(headings)){
  const near=text.slice(m.index,m.index+140);
  if(!near.includes(dmy)&&!near.includes(dash))continue;
  const section=text.slice(m.index,m.index+3100),values=[];
  let valid=true;
  for(let i=0;i<specifications.length;i++){
   const [pattern,count,width]=specifications[i];
   const match=pattern.exec(section);
   if(!match){valid=false;break}
   const start=match.index+match[0].length;
   let end=section.length;
   if(i+1<specifications.length){
    const next=specifications[i+1][0].exec(section.slice(start));
    if(next)end=start+next.index;
   }
   const nums=section.slice(start,end).match(new RegExp('(?<!\\d)\\d{'+width+'}(?!\\d)','g'))||[];
   if(nums.length<count){valid=false;break}
   values.push(...nums.slice(0,count));
  }
  if(valid&&values.length===27)return values;
 }
 return null;
}
function siteUrls(date){
 const dmy=date.split('-').reverse().join('-');
 return [
  ['xosodaiphat','https://xosodaiphat.com/xsmb-'+dmy+'.html'],
  ['minhngoc','https://www.minhngoc.net/ket-qua-xo-so/mien-bac/'+dmy+'.html'],
  ['ketqua','https://ketqua.vn/xsmb/'+dmy]
 ];
}
export async function fetchValidatedXsmbDay(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z')))throw Error('bad_date');
 const result=await Promise.all(siteUrls(date).map(async ([source,url])=>{
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{'user-agent':'Mozilla/5.0','accept-language':'vi-VN,vi;q=0.9'}});
   if(!r.ok)throw Error('HTTP_'+r.status);
   const text=await r.text();
   if(text.length<400||text.length>2000000)throw Error('unexpected_HTML_length');
   const full=parseDatePage(text,date);
   return {source,full,error:full?null:'no_full27_result'};
  }catch(e){return {source,full:null,error:String(e.message||e).slice(0,100)}}
 }));
 const agrees=new Map();
 for(const r of result.filter(x=>x.full)){
  const key=r.full.join('|'),data=agrees.get(key)||{full:r.full,sources:[]};
  data.sources.push(r.source);agrees.set(key,data);
 }
 const best=[...agrees.values()].sort((a,b)=>b.sources.length-a.sources.length)[0];
 const summary=result.map(x=>({source:x.source,ok:!!x.full,error:x.error}));
 if(!best||best.sources.length<2)return {ok:false,date,reason:'requires_two_independently_identical_full27_draws',source_health:summary};
 return {ok:true,date,full:best.full,last2:best.full.map(v=>Number(v.slice(-2))),sources:best.sources,
         source_health:summary,source:'two_independent_dated_public_sources'};
}
export function selfTest(){
 const sample='XSMB 15/10/2026 G.ĐB 62066 G.1 87176 G.2 93642 37409 G.3 28087 24887 58423 25269 33005 45004 G.4 5904 5771 6928 7981 G.5 0866 7772 6093 9746 0853 3967 G.6 287 162 312 G.7 96 27 58 91';
 const r=parseDatePage(sample,'2026-10-15');
 if(!r||r.length!==27||r[0]!=='62066'||r[14]!=='0866'||r.at(-1)!=='91'||parseDatePage(sample,'2026-10-14'))throw Error('parser_self_test_failed');
 return true;
}
if(process.argv[1]?.endsWith('xsmb-verified-daily.mjs')){
 selfTest();
 if(process.argv[2]){
  const row=await fetchValidatedXsmbDay(process.argv[2]);
  console.log('KQ247_DAILY_XSMB_SOURCE_PROOF='+JSON.stringify({ok:row.ok,date:row.date,sources:row.sources,reason:row.reason,full_count:row.full?.length||0,first:row.full?.[0],last:row.full?.at(-1),source_health:row.source_health}));
  if(!row.ok)process.exitCode=2;
 }else console.log('KQ247_XSMB_PARSER_SELFTEST=PASS');
}
