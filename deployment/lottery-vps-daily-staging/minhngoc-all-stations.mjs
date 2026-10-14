// Read-only actual results for each real station on a single official draw date.
const CONFIG={
 mt:{path:'mien-trung',count:18,order:['giai8','giai7','giai6','giai5','giai4','giai3','giai2','giai1','giaidb'],table:'rightcl'},
 mn:{path:'mien-nam',count:18,order:['giai8','giai7','giai6','giai5','giai4','giai3','giai2','giai1','giaidb'],table:'rightcl'},
 mb:{path:'mien-bac',count:27,order:['giaidb','giai1','giai2','giai3','giai4','giai5','giai6','giai7'],table:'bkqtinhmienbac'}
};
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
function cell(t,cls){
 const pattern=new RegExp("<td\\b[^>]*class=[^>]*\\b"+cls+"\\b[^>]*>([\\s\\S]*?)<\\/td>","i");
 const block=t.match(pattern)?.[1]||'';
 return [...block.matchAll(/<div\b[^>]*>\s*(\d{2,6})\s*<\/div>/gi)].map(x=>x[1]);
}
export async function fetchAllOfficialDraws(day,region){
 const conf=CONFIG[region];if(!conf||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('invalid_region_or_day');
 const dmy=day.slice(8,10)+'-'+day.slice(5,7)+'-'+day.slice(0,4);
 const pretty=day.slice(8,10)+'/'+day.slice(5,7)+'/'+day.slice(0,4);
 const url='https://www.minhngoc.net.vn/ket-qua-xo-so/'+conf.path+'/'+dmy+'.html';
 const resp=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (KQ247-XS-LiveResults)','Accept-Language':'vi-VN,vi;q=0.9'},signal:AbortSignal.timeout(15000)});
 if(!resp.ok)throw Error('RESULT_SOURCE_HTTP_'+resp.status);
 const html=await resp.text();
 if(html.length<10000||html.length>450000)throw Error('RESULT_SOURCE_LENGTH_BAD');
 const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'';
 if(!title.includes(pretty))throw Error('RESULT_SOURCE_WRONG_DATE');
 const regex=new RegExp("<table\\b[^>]*class=[^>]*\\b"+conf.table+"\\b[^>]*>[\\s\\S]*?<\\/table>","gi");
 const tables=[...html.matchAll(regex)].slice(0,region==='mb'?1:4).map(m=>m[0]);
 const items=[];
 for(const table of tables){
  const raw=region==='mb'?'XSMB':table.match(/<td\b[^>]*class=["']tinh["'][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i)?.[1]?.trim();
  if(!raw)continue;
  const full_results=conf.order.flatMap(c=>cell(table,c));
  if(full_results.length!==conf.count||full_results.some(n=>!/^\d{2,6}$/.test(n)))throw Error('INCOMPLETE_REAL_PRIZES_'+raw+'_'+day);
  const special=cell(table,'giaidb')[0];
  if(special?.length!==(region==='mb'?5:6))throw Error('MISSING_REAL_SPECIAL_'+raw);
  items.push({region,source_station:raw,source_key:norm(raw),draw_date:day,full_results,
    special,all2:full_results.map(x=>x.slice(-2)),source:'minhngoc.net.vn',source_url:url});
 }
 if(!items.length)throw Error('NO_STATION_ON_RESULT_DATE_'+day+'_'+region);
 return items;
}
