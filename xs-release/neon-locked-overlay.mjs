// Replace forecast content of original Neon markup, never the layout/CSS.
// Only immutable same-station, one-previous-draw PostgreSQL snapshots are accepted.
import {readFile} from 'node:fs/promises';
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const dl=x=>String(x).split('-').reverse().join('/');
function activeDay(){
 const t=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',
 year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
 .formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const d=t.year+'-'+t.month+'-'+t.day;
 return t.hour+':'+t.minute>='19:30'?new Date(Date.parse(d+'T12:00:00Z')+86400000).toISOString().slice(0,10):d;
}
function check(r,region,day){
 const p=r?.payload,num=region==='mb'?27:18,pos=region==='mb'?107:82;
 // A prediction may only use the latest completed draw of its own station.
 // MB's source must be the previous calendar day; provincial draws follow
 // station-specific schedules, so their preceding draw can be up to 7 days old.
 const gap=(Date.parse(day+'T12:00:00Z')-Date.parse(r?.sourceDate+'T12:00:00Z'))/86400000;
 if(!Number.isInteger(gap)||(region==='mb'?gap!==1:gap<1||gap>7))
  throw Error('SOURCE_DRAW_DATE_MISMATCH_'+r?.station);
 if(r?.sourceKind==='XSMB_FULL27_IMMUTABLE_DB'){
  const q=r?.original;
  if(region!=='mb'||r.station!=='XSMB'||r.predictionDate!==day||
   r.sourceDate>=day||!q||q.predictionDate!==day||q.sourceDate!==r.sourceDate||
   q.region!=='mb'||q.station!=='XSMB'||q.sourceDraws!==500||
   q.previousForecastsUsed!==false||q.publication!=='STAGING_UNPUBLISHED'||
   q.lottoAudit?.coveredPositions!==107||q.lottoAudit?.supportedRules<1000||
   !/^[a-f0-9]{64}$/.test(q.lottoAudit?.inputHash||'')||
   q.de?.method_counts?.de_single_pick!==1000||
   q.de?.method_counts?.remove_head!==1000||
   q.de?.method_counts?.remove_hundred!==1000)
   throw Error('INVALID_MB_FULL27_IMMUTABLE_SOURCE');
  // Do not replace the exact 15/10 picks confirmed in the original pre-draw lock.
  if(day==='2026-10-15'&&p.lotto3?.join(',')!=='51,52,91')
   throw Error('MB_20261015_CONFIRMED_LOCK_DISAGREES');
  if(!p||p.sourcePrizes!==27||p.digitPositions!==107)
   throw Error('MB_FULL27_POSITION_COVERAGE_MISSING');
 }else if(!p||r.region!==region||r.station!==p.station||p.region!==region||r.predictionDate!==day||
 p.predictionDate!==day||p.sourceDate!==r.sourceDate||r.sourceDate>=day||
 p.sourcePrizes!==num||p.digitPositions!==pos||p.allPrizesUsed!==true||p.allPositionsUsed!==true||
 p.exclusionsValidated!==true||p.previousForecastsUsed!==false||p.audit?.bridgeSourceDrawCount!==1||
 p.audit?.bridgeSourceStation!==r.station||p.audit?.coveredPositions!==pos||
 !/^[a-f0-9]{64}$/.test(p.sourceSHA256||''))throw Error('INVALID_SOURCE_PROVENANCE_'+r?.station);
 for(const [key,n,width] of [['lotto3',3,2],['doubles',2,2],['dan50',50,2],['dan60',60,2],['dan75',75,2],['three_digit',500,3]]){
  const a=p[key];
  if(!Array.isArray(a)||a.length!==n||new Set(a).size!==n||a.some(x=>typeof x!=='string'||x.length!==width||!/^[0-9]+$/.test(x)))
   throw Error('INVALID_LOCKED_POOL_'+key+'_'+r.station);
 }
 if(!p.dan50.every(x=>p.dan60.includes(x))||!p.dan60.every(x=>p.dan75.includes(x))||
 p.three_digit.some(x=>!p.dan75.includes(x.slice(-2))||x[0]===p.hardExcludedHundred)||
 p.dan75.some(x=>x[0]===p.hardExcludedHead)||
 [...p.lotto3,...p.doubles].some(x=>(p.audit?.excludedNumbers||[]).includes(x)))
 throw Error('INVALID_HARD_EXCLUSION_'+r.station);
 return p;
}
const group=(title,key,values,tiny='')=>'<section class="group"><div class="head"><h3>'+esc(title)+'</h3>'+
 '<button type="button" class="copy" data-copy="'+key+'">COPY</button></div>'+
 '<div class="nums '+tiny+'">'+values.map(x=>'<span class="num">'+x+'</span>').join('')+
 '</div><p class="count">'+values.length+' số</p></section>';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
export async function applyLockedOverlay(html,region,requestedStation){
 const day=activeDay();
 const src=JSON.parse(await readFile('/app/locked/station-locked-index.json','utf8'));
 if(src.type!=='READ_ONLY_LOCKED_STATION_PREDICTIONS'||!Array.isArray(src.records)||src.records.length<36)
  throw Error('LOCKED_SOURCE_NOT_READY');
 const reg={xsmb:'mb',xsmt:'mt',xsmn:'mn'}[region];
 if(!reg)throw Error('INVALID_REGION');
 // For MB, use the ORIGINAL independently locked 27-prize PostgreSQL snapshot.
 // The newer 36-station index has different MB picks and must never overwrite it.
 // MT and MN continue using their own station-specific locked index records.
 let records;
 if(reg==='mb'){
  const file=JSON.parse(await readFile('/app/locked/xsmb-'+day+'.json','utf8'));
  const q=file?.prediction,d=q?.de;
  if(!q||!d||file.sourceDate!==q.sourceDate)throw Error('MB_DATABASE_LOCK_MISSING');
  const p={region:'mb',station:q.station,sourceDate:q.sourceDate,sourcePrizes:27,
   digitPositions:q.lottoAudit?.coveredPositions,
   lotto3:q.lotto3,doubles:q.doubles,dan50:d.dan50,dan60:d.dan60,
   dan75:d.dan75,three_digit:d.three_digit,
   hardExcludedHead:d.hard_excluded_head,
   hardExcludedHundred:d.three_digit_hard_excluded_hundred};
  records=[{region:'mb',station:'XSMB',predictionDate:q.predictionDate,
   sourceDate:q.sourceDate,lockedAt:file.lockedAt,
   sourceKind:'XSMB_FULL27_IMMUTABLE_DB',original:q,payload:p}];
 }else{
  records=src.records.filter(r=>r.region===reg&&r.predictionDate===day)
   .sort((a,b)=>a.station.localeCompare(b.station,'vi'));
 }
 if(!records.length||records.length>(reg==='mb'?1:4))throw Error('MISSING_TODAY_STATIONS_'+region+'_'+day);
 const seen=new Set();
 for(const rec of records){check(rec,reg,day);if(seen.has(rec.station))throw Error('DUPLICATE_STATION');seen.add(rec.station);}
 if(reg==='mb'&&records[0].station!=='XSMB')throw Error('INVALID_MB_STATION');
 const rec=requestedStation?records.find(r=>norm(r.station)===norm(requestedStation)):records[0];
 if(!rec)throw Error('STATION_NOT_DRAWING_TODAY_'+requestedStation);
 const p=check(rec,reg,day);
 const r='xs'+reg;
 const nav='<div class="stations">'+records.map(x=>'<a class="btn '+(x.station===rec.station?'sel':'')+
 '" href="/xoso?region='+r+'&amp;station='+encodeURIComponent(x.station)+'">'+esc(x.station)+'</a>').join('')+'</div>';
 const headline='<div class="headline"><h2>Dự đoán '+dl(day)+'</h2><a class="btn" href="/xoso?region='+r+
 '&amp;station='+encodeURIComponent(rec.station)+'">↻ TẢI LẠI</a></div>';
 const locked=new Date(rec.lockedAt);
 const stamp=Number.isNaN(locked.valueOf())?'đã xác nhận':locked.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour12:false});
 const sourceLabel=reg==='mb'?'Nguồn kết quả mới nhất của XSMB':'Nguồn 1 kỳ quay trước của chính đài';
 const meta=sourceLabel+' • đủ '+p.sourcePrizes+' giải / '+p.digitPositions+
 ' vị trí • Dữ liệu tới '+dl(p.sourceDate)+' • Đã khóa '+stamp;
 const article='<article><h2>'+esc(rec.station)+'</h2><div class="meta">'+esc(meta)+'</div>'+
 group('3 LÔ BẠCH THỦ','lotto3',p.lotto3)+group('2 LÔ KÉP','doubles',p.doubles)+
 group('DÀN ĐẶC BIỆT 50 SỐ','dan50',p.dan50,'tiny')+
 group('DÀN ĐẶC BIỆT 60 SỐ','dan60',p.dan60,'tiny')+
 group('DÀN ĐẶC BIỆT 75 SỐ','dan75',p.dan75,'tiny')+
 '<details open><summary>DÀN 3 CÀNG (500 số)</summary>'+
 group('3 CÀNG','three_digit',p.three_digit,'tiny')+'</details></article>';
 const data=Object.fromEntries(['lotto3','doubles','dan50','dan60','dan75','three_digit'].map(k=>[k,p[k].join(' ')]));
 // Preserve the original allcopy button's payload without changing its DOM or handlers.
 data.all=[
  rec.station+' - '+dl(day),
  '3 LÔ BẠCH THỦ: '+p.lotto3.join(' '),
  '2 LÔ KÉP: '+p.doubles.join(' '),
  'DÀN 50: '+p.dan50.join(' '),
  'DÀN 60: '+p.dan60.join(' '),
  'DÀN 75: '+p.dan75.join(' '),
  '3 CÀNG: '+p.three_digit.join(' ')
 ].join('\n');
 function replace(rx,to,label){let hits=0;html=html.replace(rx,()=>{hits++;return to;});if(hits!==1)throw Error('NEON_LAYOUT_CHANGED_'+label);}
 replace(/<div class="headline">[\s\S]*?<\/div>/,headline,'HEADLINE');
 replace(/<div class="stations">[\s\S]*?<\/div>/,nav,'STATION_NAV');
 replace(/<div id="notice" class="notice">[\s\S]*?<\/div>/,
 '<div id="notice" class="notice">Snapshot đã khóa trên VPS. Đổi đài không tính lại số.</div>','NOTICE');
 replace(/<article>[\s\S]*?<\/article>/,article,'ARTICLE');
 replace(/<script>const d=\{[\s\S]*?\};/,'<script>const d='+JSON.stringify(data)+';','COPY_DATA');
 if(!html.includes('<h1>XỔ SỐ BA MIỀN <span')||!html.includes('BẢN CHÍNH</span>')||!html.includes('data-copy="lotto3"')||
 !html.includes('id="kq247-xs-qc"')||!html.includes('DÀN 3 CÀNG (500 số)'))
 throw Error('NEON_LAYOUT_INCOMPLETE_'+JSON.stringify({title:html.includes('XỔ SỐ BA MIỀN BẢN CHÍNH'),copyall:html.includes('id="copyall"'),qc:html.includes('id="kq247-xs-qc"'),three:html.includes('DÀN 3 CÀNG (500 số)')}));
 return html;
}