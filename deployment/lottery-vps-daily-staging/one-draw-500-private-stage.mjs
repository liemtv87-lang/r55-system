// Isolated, read-only-input staging runner. Never modifies any public or licensed snapshot.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {forecastOneDrawAnd500Backtest} from './one-draw-500-method-selector.mjs';
const root=process.env.KQ247_STAGE_ROOT||'/stage';
const history=JSON.parse(await readFile(join(root,'xsmb-history-live.json'),'utf8'));
const rows=history.filter(x=>x.region==='mb'&&x.station==='XSMB')
 .sort((a,b)=>b.draw_date.localeCompare(a.draw_date)).slice(0,500);
if(rows.length!==500||rows.some(x=>!Array.isArray(x.full_results)||x.full_results.length!==27))
 throw Error('MB_NEEDS_EXACT_500_FULL_27_PRIZE_DRAWS');
const newest=rows[0].draw_date;
const target=new Date(Date.parse(newest+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const proposal=forecastOneDrawAnd500Backtest({history:rows,region:'mb',station:'XSMB',predictionDate:target});
if(proposal.sourceDate!==newest||proposal.audit.bridgeSourceDrawCount!==1||
 proposal.audit.backtest500.realCompleteDraws!==500)throw Error('METHOD_GATE_INCORRECT');
const dir=join(root,'single-draw-backtest-private');
await mkdir(dir,{recursive:true});
const file=join(dir,'mb-'+target+'.json'),data=JSON.stringify({type:'STAGING_NOT_PUBLIC',proposal},null,2)+'\n';
try{await writeFile(file,data,{flag:'wx'});}
catch(err){
 if(err.code!=='EEXIST'||await readFile(file,'utf8')!==data)throw Error('PREVIOUS_PRIVATE_STAGING_IMMUTABLE_CONFLICT');
}
console.log('KQ247_MB_PRIVATE_NEW_MODEL_ONE_DRAW_BACKTEST500_READY',target,
 'source',newest,'all27',proposal.sourcePrizes,'positions',proposal.digitPositions,
 'train',proposal.audit.backtest500.trainTransitions,'holdout',proposal.audit.backtest500.heldoutTransitions,
 'PUBLISH_NOT_PERMITTED');
