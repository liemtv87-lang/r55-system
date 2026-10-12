import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync(new URL('./r40-windows-patch.json',import.meta.url),'utf8'));
const [mergeFile,serverFile]=process.argv.slice(2);
if(!mergeFile||!serverFile)throw Error('pass merge and server paths');
let merge=fs.readFileSync(mergeFile,'utf8');
let server=fs.readFileSync(serverFile,'utf8');
if(!merge.includes('const drawWindow=(drawCount,field)=>')){
  if(!merge.includes(p.statsAnchor)||!merge.includes(p.oldStats))throw Error('unrecognized merger code, patch cancelled');
  merge=merge.replace(p.statsAnchor,p.statsAnchor+'\n'+p.statsFn).replace(p.oldStats,p.newStats);
}
if(!merge.includes('reduced_stats1500:drawWindow(1500'))throw Error('all four windows not found');
const match=server.match(/const INDEX_HTML=("(?:\\.|[^"\\])*");/);
if(!match)throw Error('embedded HTML was not found');
let html=JSON.parse(match[1]);
function replaceOptional(before,after){if(html.includes(before))html=html.replace(before,after)}
replaceOptional(p.headingOld,p.headingNew);
replaceOptional(p.schemaOld,p.schemaNew);
replaceOptional('Thống kê 60 ngày gần nhất','Thống kê 60 kỳ gần nhất');
replaceOptional('Thống kê 60 ngày — đang tính lại','Thống kê 60 kỳ — đang tính lại');
replaceOptional('Cửa sổ đúng 60 ngày:','Cửa sổ 60 kỳ quay:');
replaceOptional("renderStatsBox(p,s60,'stats','60 ngày',b.reduced_stats60||null)","renderStatsBox(p,s60,'stats','60 kỳ',b.reduced_stats60||null)");
replaceOptional('ĐANG HỒI KIỂM 50 KỲ / 150 KỲ / TOÀN LỊCH SỬ','ĐANG HỒI KIỂM 30 / 60 / 150 / 1.500 KỲ');
const start=html.indexOf('function renderBacktestSummary(p,b){');
const end=html.indexOf('\nfunction jackpotTickets(',start);
if(start>=0&&end>start)html=html.slice(0,start)+p.uiRenderer+html.slice(end);
else{
 if(!html.includes('id="kq247-draw-windows"')){
  if(!html.includes('</body>'))throw Error('HTML closing body missing');
  html=html.replace('</body>',p.uiAddon+'\n</body>');
 }
}
if(!html.includes('[30,60,150,1500].map(row)')&&!html.includes('kq247DrawStatsLoad()'))throw Error('UI addition failed');
server=server.replace(match[0],`const INDEX_HTML=${JSON.stringify(html)};`);
const routeAnchor="if(req.method==='GET'&&url.pathname==='/status')return send(res,200,current);";
if(!server.includes("/api/draw-window-stats")){
 if(!server.includes(routeAnchor))throw Error('HTTP route anchor missing');
 server=server.replace(routeAnchor,p.apiRoute+'\n  '+routeAnchor);
}
if(server.includes(p.serverRuntimeOld))server=server.replace(p.serverRuntimeOld,p.serverRuntimeNew);
if(!server.includes(p.serverRuntimeNew))throw Error('unknown server runtime, patch refused');
for(const [file,data] of [[mergeFile,merge],[serverFile,server]]){const temp=file+'.r40tmp';fs.writeFileSync(temp,data);fs.renameSync(temp,file)}
console.log('VIETLOTT_R40_FOUR_DRAW_WINDOWS_PATCHED=YES');
