// Lightweight, read-only Minh Ngoc parser. Fail closed on wrong date or unfinished results.
const ORDER={
  xsmb:["giaidb","giai1","giai2","giai3","giai4","giai5","giai6","giai7"],
  xsmt:["giai8","giai7","giai6","giai5","giai4","giai3","giai2","giai1","giaidb"],
  xsmn:["giai8","giai7","giai6","giai5","giai4","giai3","giai2","giai1","giaidb"]
};
const PATH={xsmb:"mien-bac",xsmt:"mien-trung",xsmn:"mien-nam"};
// Provider writes "TP. HCM", while locked Neon uses "TPHCM".
 // Ignore punctuation and spaces when matching station names.
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().replace(/[^a-z0-9]/g,"");
function cell(table,cls){
  const pattern=new RegExp('<td\\b[^>]*class=["\\\'][^"\\\']*\\b'+cls+'\\b[^"\\\']*["\\\'][^>]*>([\\s\\S]*?)<\\/td>','i');
  const section=table.match(pattern)?.[1]||"";
  return [...section.matchAll(/<div\b[^>]*>\s*(\d{2,6})\s*<\/div>/gi)].map(m=>m[1]);
}
export async function getXsDraws(day,region,stations){
  if(!ORDER[region]||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error("invalid_draw_request");
  const dmy=day.slice(8,10)+"-"+day.slice(5,7)+"-"+day.slice(0,4);
  const readable=day.slice(8,10)+"/"+day.slice(5,7)+"/"+day.slice(0,4);
  const url="https://www.minhngoc.net.vn/ket-qua-xo-so/"+PATH[region]+"/"+dmy+".html";
  const response=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 (KQ247-XS-Reader)","Accept-Language":"vi-VN,vi;q=0.9"},signal:AbortSignal.timeout(17000)});
  if(!response.ok)throw Error("draw_http_"+response.status);
  const html=await response.text();
  if(html.length<10000||html.length>450000)throw Error("draw_html_invalid");
  const title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"";
  if(!title.includes(readable))throw Error("draw_date_mismatch");
  const cls=region==="xsmb"?"bkqtinhmienbac":"rightcl";
  const all=[...html.matchAll(new RegExp('<table\\b[^>]*class=["\\\'][^"\\\']*\\b'+cls+'\\b[^"\\\']*["\\\'][^>]*>[\\s\\S]*?<\\/table>','gi'))];
  // Only use the first draw for this dated page. Older draws appear later.
  const tables=all.slice(0,region==="xsmb"?1:4).map(m=>m[0]);
  if(!tables.length)throw Error("draw_tables_missing");
  const found=new Map();
  for(const table of tables){
    const name=region==="xsmb"?"XSMB":table.match(/<td\b[^>]*class=["']tinh["'][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i)?.[1]?.trim();
    if(!name)continue;
    const nums=ORDER[region].flatMap(cls=>cell(table,cls));
    const special=cell(table,"giaidb")[0]||"";
    const count=region==="xsmb"?27:18;
    if(nums.length!==count||nums.some(n=>!/^\d{2,6}$/.test(n))||special.length!==(region==="xsmb"?5:6))
      throw Error("incomplete_draw_"+normalize(name));
    found.set(normalize(name),{special,all2:nums.map(n=>n.slice(-2)),name});
  }
  const out={};
  for(const station of stations){
    const matched=found.get(normalize(station));
    if(!matched)throw Error("draw_station_not_found_"+normalize(station));
    out[station]=matched;
  }
  return out;
}