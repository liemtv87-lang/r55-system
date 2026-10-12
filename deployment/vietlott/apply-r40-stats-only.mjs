import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync(new URL('./r40-windows-patch.json',import.meta.url),'utf8'));
const file='/app/scripts/merge-backtest-60.mjs';
let src=fs.readFileSync(file,'utf8');
if(!src.includes('const drawWindow=(drawCount,field)=>')){
  if(!src.includes(p.statsAnchor)||!src.includes(p.oldStats))throw Error('unexpected original merger source');
  src=src.replace(p.statsAnchor,p.statsAnchor+'\n'+p.statsFn).replace(p.oldStats,p.newStats);
}
const anchor="await writeFile(new URL('public/backtest-60.json',ROOT),JSON.stringify(out,null,2)+'\\n','utf8');";
if(!src.includes('public/draw-windows.json')){
  if(!src.includes(anchor))throw Error('unexpected merge output anchor');
  src=src.replace(anchor,anchor+'\n'+p.standaloneSummaryCode);
}
for(const n of [30,60,150,1500])if(!src.includes('reduced_stats'+n))throw Error('missing draw period '+n);
if(!src.includes('public/draw-windows.json'))throw Error('missing summary output');
const tmp=file+'.r40tmp';fs.writeFileSync(tmp,src);fs.renameSync(tmp,file);
console.log('R40_STATS_MERGER_UPDATED_NO_RESTART=YES');
