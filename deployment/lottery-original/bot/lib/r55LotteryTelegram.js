import {boldTelegram} from "lib/r55TelegramFormat.js";
export const NEON_PUBLIC="https://br-divine-resonance-az0qxt8z-kq247web.compute.c-3.ap-southeast-1.aws.neon.tech/";
export const TELEGRAM_XS_GROUP="@xsbm999";
const reDate=/Dự đoán\s+(\d{2})\/(\d{2})\/(\d{4})/i;
const cleanName=x=>String(x||"").replace(/[<>&]/g,"").trim().slice(0,65);
const two=x=>/^\d{2}$/.test(x);
export const vnParts=(at=new Date())=>{
 const arr=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(at);
 const data=Object.fromEntries(arr.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 return {day:data.year+"-"+data.month+"-"+data.day,hour:Number(data.hour),minute:Number(data.minute)};
};
export function getSnapshot(html,day){
 const m=String(html).match(reDate);
 if(!m)return {ok:false,error:"neon_snapshot_date_not_found"};
 const pageDay=m[3]+"-"+m[2]+"-"+m[1];
 if(pageDay!==day)return {ok:false,error:"stale_or_future_snapshot",pageDay,expectedDay:day};
 if(!/Snapshot.*khóa|Đã khóa/i.test(html))return {ok:false,error:"snapshot_not_confirmed_locked",pageDay};
 const data=String(html).match(/const d=(\{[^\n]*?\});/);
 if(!data)return {ok:false,error:"neon_snapshot_data_not_found",pageDay};
 let obj;try{obj=JSON.parse(data[1])}catch{return {ok:false,error:"malformed_neon_snapshot_data"}}
 const parse=s=>String(s||"").trim().split(/\s+/);
 const lotto3=parse(obj.lotto3),doubles=parse(obj.doubles);
 const dan50=parse(obj.dan50),dan60=parse(obj.dan60),dan75=parse(obj.dan75),three_digit=parse(obj.three_digit);
 if(lotto3.length!==3||new Set(lotto3).size!==3||!lotto3.every(two)||doubles.length!==2||!doubles.every(two))return {ok:false,error:"invalid_lotto_from_neon",pageDay};
 for(const [name,nums,len,pattern] of [["dan50",dan50,50,/^\d{2}$/],["dan60",dan60,60,/^\d{2}$/],["dan75",dan75,75,/^\d{2}$/],["three_digit",three_digit,500,/^\d{3}$/]]){
  if(nums.length!==len||new Set(nums).size!==len||!nums.every(x=>pattern.test(x)))return {ok:false,error:"invalid_"+name+"_from_neon",pageDay};
 }
 if(three_digit.some(x=>!dan75.includes(x.slice(-2))))return {ok:false,error:"3c_outside_dan75",pageDay};
 return {ok:true,day:pageDay,lotto3,doubles,dan50,dan60,dan75,three_digit};
}
async function htmlAt(url){
 const response=await fetch(url,{headers:{Accept:"text/html"},signal:AbortSignal.timeout(12500)});
 if(!response.ok)throw Error("neon_http_"+response.status);
 const html=await response.text();
 if(html.length<1000||html.length>250000)throw Error("neon_html_invalid_size");
 return html;
}
export async function getLockedNeonRegion(region,day){
 if(!["xsmb","xsmt","xsmn"].includes(region))throw Error("invalid_region");
 const home=await htmlAt(NEON_PUBLIC+"?region="+region);
 const matches=[...home.matchAll(/href="\/?\?region=xs(?:mb|mt|mn)&amp;station=([^"]+)"/gi)];
 const names=[...new Set(matches.map(m=>decodeURIComponent(m[1].replace(/\+/g," "))))].filter(x=>x.length<90).slice(0,6);
 if(region==="xsmb"&&!names.length)names.push("XSMB");
 if(!names.length)throw Error("no_stations_in_neon");
 const records=await Promise.all(names.map(async station=>{
  try{
   const h=station===names[0]?home:await htmlAt(NEON_PUBLIC+"?region="+region+"&station="+encodeURIComponent(station));
   const x=getSnapshot(h,day);
   return {station:cleanName(station),...x};
  }catch(e){return {station:cleanName(station),ok:false,error:String(e?.message||e).slice(0,100)}}
 }));
 return {region,day,stations:records,valid:records.filter(x=>x.ok).length,missing:records.filter(x=>!x.ok).length};
}
export function previewMessage(region,station,record){
 if(!record?.ok)throw Error("not_verified");
 const regionLabel=region.toUpperCase();
 const day=record.day.split("-").reverse().join("/");
 const body=[
 "🎯 KQ247 • "+regionLabel+" "+day,
 "🏅 ĐÀI: "+cleanName(station),
 "✅ SNAPSHOT NEON ĐÃ KHÓA",
 "🔵 3 LÔ BẠCH THỦ: "+record.lotto3.join(" • "),
 "🔵 LÔ KÉP: "+record.doubles.join(" • "),
 "🔴 DÀN ĐỀ 50 SỐ: "+record.dan50.join(" "),
 "🔴 DÀN ĐỀ 60 SỐ: "+record.dan60.join(" "),
 "🔴 DÀN ĐỀ 75 SỐ: "+record.dan75.join(" "),
 "🔴 DÀN 3 CÀNG (500 BỘ): "+record.three_digit.join(" "),
 "ℹ️ Dự đoán chỉ để tham khảo, không bảo đảm kết quả."
 ].join("\n");
 const html=boldTelegram(body);
 if(/(?:kq247-xoso-khach|onrender\.com|wix-site-host\.com|lovable\.app|client=1|region=xs)/i.test(html))throw Error("customer_link_blocked");
 return html;
}