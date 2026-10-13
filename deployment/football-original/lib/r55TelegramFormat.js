// One approved Telegram footer, reused by match alerts and FT roundups.
// Never include a direct customer-site URL in group posts.
const e=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
export const QC_TEXT=[
"━━━━━━━━━━━━━━",
"📢 Bán tool Phân tích dự đoán XSMB, MT , MN",
"📢 tool Phân tích, dự đoán kèo bóng đá, chọn xiên 6,8,10 trận.",
"📢 Tool Vietlott 6x45 6x55",
"📱 Sử dụng link trên ĐT dễ dàng - nhanh chóng - hiệu quả",
"⚽ Vào nhóm kèo bóng : https://t.me/keochuyengia79",
"🎯 hoặc nhóm Xổ Số : https://t.me/xsbm999",
"🎁 Tool có mã sử dụng Free 10 ngày tại: @muatool_du_doan_bot",
"Để nhận dự đoán sớm nhất !"
].join("\n\n");
// Always render the entire announcement and full approved advertisement bold.
// Strip legacy public confidence/rating claims; they are not part of Telegram messages.
const withoutRating=s=>String(s||"").split("\n").filter(line=>!/(?:độ\s+tin\s+cậy|tin\s+cậy\s+tham\s+khảo|điểm\s+(?:r55|chọn\s+kèo)|confidence\s*\d*\s*\/\s*100)/i.test(line)).join("\n");
export const boldTelegram=(body,withQc=true)=>"<b>"+e(withoutRating(body)+(withQc?"\n\n"+QC_TEXT:""))+"</b>";
export const validFootballMessage=msg=>typeof msg==="string"&&msg.startsWith("<b>")&&msg.includes("Tool Vietlott 6x45 6x55")&&msg.includes("muatool_du_doan_bot")&&!/(?:độ\s+tin\s+cậy|tin\s+cậy\s+tham\s+khảo|điểm\s+(?:r55|chọn\s+kèo)|\b\d{1,3}\/100\b)/i.test(msg);
export const researchMessage=(m)=>matchMessage(m).replace(/^<b>/,"<b>⚠️ DỰ ĐOÁN THAM KHẢO — CHƯA QUA KIỂM ĐỊNH HIỆU SUẤT\n");
export const matchMessage=(m)=>{
 const clean=s=>String(s||"").replace(/[<>]/g,"").slice(0,110);
 const kickoff=Date.parse(m.kickoff),market=m.market||{};
 const timeParts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hourCycle:"h23",day:"2-digit",month:"2-digit"}).formatToParts(new Date(kickoff));
 const part=type=>timeParts.find(p=>p.type===type)?.value||"";
 const vn=part("hour")+":"+part("minute")+" "+part("day")+"-"+part("month");
 const pick=market.type==="AH"?(market.pick==="HOME"?m.home:m.away):(market.pick==="OVER"?"TÀI":"XỈU");
 const line=Number(market.line),signed=market.type==="AH"?(line>=0?"+":"")+line:String(line);
 const isAsian=market.type==="AH";
 // Comfortable Telegram mobile spacing: keep original headings and exact markets.
 const body=[
  "⚽ KQ247 • KÈO "+(isAsian?"CHÂU Á":"TÀI/XỈU"),
  "━━━━━━━━━━━━━━",
  "",
  "🏟 "+clean(m.home)+" - "+clean(m.away),
  "",
  "🌍 "+clean(m.country)+" • "+clean(m.league),
  "",
  "⏰ "+vn,
  "",
  "🎯 "+(isAsian?"CHÂU Á":"TÀI/XỈU")+": "+clean(pick)+" "+signed,
  "",
  "📊 TỶ LỆ ĂN: "+Number(market.odds||0).toFixed(2)
 ].join("\n");
 return boldTelegram(body);
};