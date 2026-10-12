import {matchMessage,researchMessage,validFootballMessage,boldTelegram,QC_TEXT} from "lib/r55TelegramFormat.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const sample={id:"BDL_3000001",home:"FC Juarez",away:"Club Tijuana",country:"Mexico",league:"Primera Division Liga MX",
 kickoff:"2026-10-11T06:00:00Z",market:{type:"AH",pick:"AWAY",line:0,odds:1.78},score:86,confidence_score:86};
 const message=matchMessage(sample),research=researchMessage(sample),withOld=boldTelegram("⚽ KQ247 • 1 KÈO BÓNG ĐÁ\nBongdalu • tin cậy tham khảo 86/100\nĐộ tin cậy 86/100");
 const checks={
   bold:message.startsWith("<b>")&&message.endsWith("</b>"),
   fullQc:QC_TEXT.split("\n").every(s=>message.includes(s)),
   hasSalesBot:message.includes("muatool_du_doan_bot"),
   noConfidence:!/(tin cậy|độ tin cậy|86\/100|Điểm R55)/i.test(message),
   legacyConfidenceStripped:!/(tin cậy|độ tin cậy|86\/100)/i.test(withOld),
   messageValid:validFootballMessage(message),
   researchValid:research!==message&&research.includes('⚠️ DỰ ĐOÁN THAM KHẢO — CHƯA QUA KIỂM ĐỊNH HIỆU SUẤT')&&validFootballMessage(research),
   exactHeading:message.includes("⚽ KQ247 • KÈO CHÂU Á"),
   properClock:message.includes("⏰ 13:00 11-10"),
   noExtraneousLines:!/(snapshot|chưa qua kiểm định|chỉ tham khảo|1 kèo sáng nhất)/i.test(message)
 };
 const ok=Object.values(checks).every(Boolean);
 return res.status(ok?200:422).json({ok,checks,telegramHtml:message,deliveryAttempted:false});
}