const XOSO_BRIDGE='https://wbegdefpdwctolawluzo.supabase.co/functions/v1/svg-test';

const CFG = {
  mega645: {
    label: 'Mega 6/45', max: 45, code: '645',
    seed: 'https://raw.githubusercontent.com/NhanAZ-Data/vietlott-data-research/main/datasets/draws/mega645/all.csv',
    official: 'https://vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong/645',
    secondary: [
      ['xoso_com_vn', 'https://xoso.com.vn/xo-so-tu-chon-mega-645.html'],
      ['minhngoc', 'https://xosominhngoc.net.vn/mega']
    ],
    jsDow: new Set([0,3,5]) // Sun/Wed/Fri
  },
  power655: {
    label: 'Power 6/55', max: 55, code: '655',
    seed: 'https://raw.githubusercontent.com/NhanAZ-Data/vietlott-data-research/main/datasets/draws/power655/all.csv',
    official: 'https://vietlott.vn/vi/trung-thuong/ket-qua-trung-thuong/655',
    secondary: [
      ['xoso_com_vn', 'https://xoso.com.vn/xo-so-power-655.html'],
      ['minhngoc', 'https://xosominhngoc.net.vn/power']
    ],
    jsDow: new Set([2,4,6]) // Tue/Thu/Sat
  }
};

const HARD_RULES = [
  '1. Chia 3: mỗi nhóm chia hết / dư 1 / dư 2 tối đa 3 số.',
  '2. Cùng tổng 2 chữ số tối đa 2 số.',
  '3. Cùng hiệu tuyệt đối 2 chữ số tối đa 2 số.',
  '4. Cùng nhóm 12 con giáp tối đa 3 số.',
  '5. Can–Chi: cùng Can tối đa 2 số và cùng Chi tối đa 2 số.',
  '6. Kép bằng tối đa 2 số.',
  '7. Kép lệch tối đa 2 số.',
  '8. Dạng chẵn–chẵn tối đa 3 số.',
  '9. Dạng lẻ–lẻ tối đa 3 số.',
  '10. Chẵn/lẻ của đầu: Mega 6/45 mỗi phía tối đa 4 số; Power 6/55 mỗi phía tối đa 5 số.',
  '11. Chẵn/lẻ của đuôi: mỗi phía tối đa 4 số.',
  '12. Cùng đầu (hàng chục) tối đa 4 số.',
  '13. Cùng đuôi (hàng đơn vị) tối đa 4 số.',
  '14. Với mọi kỳ Vietlott lịch sử: chỉ được trùng tối đa 4/6 số; bộ đã từng nổ 6/6 bị loại tuyệt đối.',
  '15. Có từ 1 đến 4 số thuộc tập 2 số cuối của toàn bộ XSMB + XSMT + XSMN đúng ngày phân tích 19h.',
  '16. Loại bộ chứa đủ một nhóm tứ hành xung.',
  '17. Bắt buộc có ít nhất 1 số thuộc tập 2 số cuối giải ĐB XSMB của 200 ngày gần nhất trước kỳ mục tiêu.',
  '18. Mỗi bộ phải phủ ít nhất 3 đầu khác nhau.',
  '19. Có ít nhất 2 số thuộc đầu 2 hoặc đầu 3.',
  '20. Mega: có ít nhất 3 số thuộc đầu 2/3/4. Power: có ít nhất 3 số thuộc đầu 2/3/4/5.',
  '21. Mega: đầu 3 và đầu 4 tối đa 3 số mỗi đầu, không được đồng thời cùng có 3 số. Power: đầu 4 và đầu 5 tối đa 3 số mỗi đầu, không được đồng thời cùng có 3 số.',
  '22. Tổng số thuộc đầu 3+4 tối đa 4 số cho cả Mega 6/45 và Power 6/55.',
  '23. Power: đầu 3+4 tối đa 4 số; đầu 4+5 tối đa 4 số.',
  '24. Tổng 6 số: Mega 6/45 không quá 160; Power 6/55 không quá 200.',
  '25. Cùng đầu tối đa 4 số và cùng đuôi tối đa 4 số.',
  '26. Kép âm tối đa 3 số trong một bộ.',
  '27. Tổng số thuộc kép lệch hoặc kép âm tối đa 4 số trong một bộ.',
  '28. Mỗi cặp lớp chia 3: dư 0+1, dư 1+2, dư 2+0 tối đa 5 số.',
  '29. Mỗi cặp đuôi 0/5, 1/6, 2/7, 3/8, 4/9 tối đa 4 số.',
  '30. Mỗi cặp đầu 0/5, 1/2, 2/3, 3/4, 4/5 tối đa 5 số.',
  '31. Dạng chẵn–chẵn + lẻ–lẻ: Mega tối đa 4 số, Power tối đa 5 số; dạng chẵn–lẻ + lẻ–chẵn: Mega tối đa 4 số, Power tối đa 5 số.',
  '32. Mỗi bộ phải có ít nhất 4 chạm khác nhau và không quá 8 chạm khác nhau.',
  '33. Mỗi nhóm đầu liên tiếp 0+1+2, 1+2+3, 2+3+4: tối đa 5 trong 6 số.',
  '34. Tổng 3 số lớn nhất trong bộ 6 số (3 số cuối khi sắp tăng) không quá 110.'
];

const SYSTEM_FILTER_RULES = [];

const USER_METHOD_RULES = [
  'Tần suất / xu hướng',
  'Tam giác cộng dồn',
  'Cầu vị trí',
  'Ghép vị trí',
  'Nhịp / gap',
  'Thứ trong tuần',
  'Tín hiệu ngày / lịch',
  'Can–Chi',
  '12 con giáp',
  'Lộn',
  'Chạm',
  'Tổng',
  'Hiệu',
  'Cầu loại số',
  'Cầu chuyển tiếp bộ 2 số',
  'Cầu chuyển tiếp bộ 3 số',
  'Cầu chuyển tiếp bộ 4 số',
  'Cầu kèo / cặp số'
];

// Chỉ chứa các PP người dùng đã yêu cầu/chốt. Không thêm PP assistant.
const METHOD_NAMES = [
  'frequency','trend','triangle','position','position_pair','rhythm',
  'weekday','day_signal','canchi','zodiac','reverse','touch','total','difference',
  'elimination','transition2','transition3','transition4','pair_keo'
];


function json(data, status=200) {
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ').trim();
}

async function fetchText(url, tries=2) {
  let err='';
  for (let i=0;i<tries;i++) {
    try {
      const r = await fetch(url, {signal:AbortSignal.timeout(20000),headers:{'user-agent':'Mozilla/5.0 Vietlott-AutoHoc/2.0','accept-language':'vi-VN,vi;q=0.9'}});
      if (r.ok) {
        const t = await r.text();
        if (t.length > 100) return t;
        err = 'empty';
      } else err = `HTTP ${r.status}`;
    } catch(e) { err = String(e); }
    await new Promise(res=>setTimeout(res, 350*(i+1)));
  }
  throw new Error(`${url}: ${err}`);
}

function parseDmy(s) {
  const m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}
function isoDate(d) { return d.toISOString().slice(0,10); }
function dateObj(s) { return new Date(`${s}T00:00:00Z`); }
function addDays(sOrDate, n) {
  const d = typeof sOrDate==='string' ? dateObj(sOrDate) : new Date(sOrDate.getTime());
  d.setUTCDate(d.getUTCDate()+n); return d;
}
function vnNow() { return new Date(Date.now()+7*3600*1000); }
function vnToday() { return isoDate(vnNow()); }

function parseSeedCsv(text, product) {
  const out=[];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(product+',')) continue;
    const m = line.match(/^([^,]+),([^,]+),([^,]+),confirmed,"((?:""|[^"])*)"/);
    if (!m) continue;
    try {
      const result = JSON.parse(m[4].replace(/""/g,'"'));
      const nums = (result.numbers||[]).map(Number).sort((a,b)=>a-b);
      if (nums.length!==6 || new Set(nums).size!==6 || nums.some(n=>n<1||n>CFG[product].max)) continue;
      const sp=(result.special_numbers||[]).map(Number);
      out.push({draw_id:String(m[2]).padStart(5,'0'), date:m[3], numbers:nums, special:sp.length?sp[0]:null, sources:['canonical_seed']});
    } catch {}
  }
  out.sort((a,b)=>a.date.localeCompare(b.date));
  return out;
}

function parseOfficial(product, html, source='vietlott') {
  const t=htmlToText(html), cfg=CFG[product], out=[];
  const re=/Kỳ quay thưởng\s*#?0*(\d{1,6})\s*ngày\s*(\d{1,2}[\/-]\d{1,2}[\/-]20\d{2})/gi;
  let m;
  while ((m=re.exec(t))) {
    const tail=t.slice(m.index+m[0].length, m.index+m[0].length+220);
    let nums=[], special=null;
    if (product==='power655') {
      const pm=tail.match(/((?:\b\d{2}\b\s+){5}\b\d{2}\b)\s*\|\s*(\d{2})/);
      if (!pm) continue;
      nums=pm[1].match(/\d{2}/g).map(Number); special=Number(pm[2]);
    } else {
      const mm=tail.match(/((?:\b\d{2}\b\s+){5}\b\d{2}\b)/);
      if (!mm) continue;
      nums=mm[1].match(/\d{2}/g).map(Number);
    }
    if (nums.length!==6 || new Set(nums).size!==6 || nums.some(x=>x<1||x>cfg.max)) continue;
    if (special!=null && (special<1||special>55||nums.includes(special))) continue;
    out.push({draw_id:String(Number(m[1])).padStart(5,'0'), date:parseDmy(m[2]), numbers:nums.sort((a,b)=>a-b), special, source});
  }
  return out;
}

function parseSecondary(product, html, source) {
  const t=htmlToText(html),cfg=CFG[product],out=[];
  const patterns=[
    /(\d{1,2}[\/-]\d{1,2}[\/-]20\d{2})\s*Kỳ quay thưởng\s*:\s*#(\d{1,6})\s+((?:\d{2}\s+){5}\d{2})(?:\s+(\d{2})\b)?/gi,
    /Kỳ (?:vé|QSMT)\s*:\s*#(\d{1,6})[^#]{0,65}?(\d{1,2}[\/-]\d{1,2}[\/-]20\d{2})\s+((?:\d{2}\s+){5}\d{2})(?:\s+(\d{2})\b)?/gi
  ];
  for(let i=0;i<patterns.length;i++)for(const m of t.matchAll(patterns[i])){
    const date=parseDmy(m[i===0?1:2]),draw_id=String(Number(m[i===0?2:1])).padStart(5,'0');
    const numbers=m[3].match(/\d{2}/g).map(Number).sort((a,b)=>a-b),special=product==='power655'?Number(m[4]):null;
    if(!date||new Set(numbers).size!==6||numbers.some(n=>n<1||n>cfg.max)||!cfg.jsDow.has(dateObj(date).getUTCDay()))continue;
    if(product==='power655'&&(!special||special>55||numbers.includes(special)))continue;
    if(!out.some(r=>r.date===date))out.push({draw_id,date,numbers,special,source});
  }
  return out;
}

function moneyNumber(s){
  const n=Number(String(s||'').replace(/[^\d]/g,''));
  return Number.isFinite(n)&&n>0?n:null;
}

function parsePrizeMeta(product,html){
  const t=htmlToText(html);
  if(product==='mega645'){
    const m=t.match(/Jackpot\s+(?:Mega\s*)?6\/45(?:\s+ước tính)?[^\d]{0,140}([\d.]{7,})\s*(?:đồng|VNĐ|đ)?/i)
      || t.match(/Giá trị\s+Jackpot[^\d]{0,80}([\d.]{7,})\s*(?:đồng|VNĐ|đ)?/i);
    const jackpot=m?moneyNumber(m[1]):null;
    return jackpot?{product,jackpot}:null;
  }
  const m1=t.match(/Jackpot\s*1(?:\s+Power\s*6\/55)?(?:\s+ước tính)?[^\d]{0,140}([\d.]{7,})\s*(?:đồng|VNĐ|đ)?/i)
    || t.match(/Giá trị\s+Jackpot\s*1[^\d]{0,80}([\d.]{7,})\s*(?:đồng|VNĐ|đ)?/i);
  const m2=t.match(/Jackpot\s*2(?:\s+Power\s*6\/55)?(?:\s+ước tính)?[^\d]{0,140}([\d.]{7,})\s*(?:đồng|VNĐ|đ)?/i)
    || t.match(/Giá trị\s+Jackpot\s*2[^\d]{0,80}([\d.]{7,})\s*(?:đồng|VNĐ|đ)?/i);
  const jackpot1=m1?moneyNumber(m1[1]):null,jackpot2=m2?moneyNumber(m2[1]):null;
  return (jackpot1||jackpot2)?{product,jackpot1,jackpot2}:null;
}

async function fetchPrizeMeta(product){
  const cfg=CFG[product],health=[];
  const candidates=[cfg.official,...cfg.secondary.map(x=>x[1])];
  for(const url of candidates){
    try{
      const html=await fetchText(url,1),meta=parsePrizeMeta(product,html);
      if(meta)return {...meta,source:url,fetched_at:new Date().toISOString()};
      health.push({url,ok:false,error:'prize meta not found'});
    }catch(e){health.push({url,ok:false,error:String(e).slice(0,140)})}
  }
  return {product,source:null,fetched_at:new Date().toISOString(),error:'Không lấy được giá trị Jackpot hiện tại',health};
}

async function catchUpSecondary(product,history,maxFetch=36){
  const cfg=CFG[product],health=[],byDate=new Map(history.map(d=>[d.date,d])),observed=new Map();
  async function read(name,url,expected=null){
    try{
      const rows=parseSecondary(product,await fetchText(url,1),name).filter(r=>!expected||r.date===expected);
      health.push({source:name,url,ok:rows.length>0,records:rows.length});
      for(const r of rows){if(r.date>vnToday())continue;const key=r.date,prior=observed.get(key);
        if(prior&&(prior.numbers.join(',')!==r.numbers.join(',')||prior.special!==r.special||prior.draw_id!==r.draw_id))throw new Error('Conflicting results '+key);
        const old=byDate.get(key);
        if(old&&(old.numbers.join(',')!==r.numbers.join(',')||old.special!==r.special))throw new Error('Cached result conflict '+key);
        observed.set(key,{...r,sources:[...new Set([...(prior?.sources||old?.sources||[]),name])]});
      }
      return rows;
    }catch(e){if(String(e).includes('conflict')||String(e).includes('Conflicting'))throw e;health.push({source:name,url,ok:false,error:String(e).slice(0,180)});return []}
  }
  for(const [name,url] of cfg.secondary)await read(name,url);
  const newest=[...observed.keys()].sort().at(-1);
  if(newest){
    const start=isoDate(addDays(newest,-80));
    let requests=0;
    for(let d=addDays(start,1);isoDate(d)<newest&&requests<maxFetch;d=addDays(d,1)){
      const date=isoDate(d);if(!cfg.jsDow.has(d.getUTCDay())||byDate.has(date)||observed.has(date))continue;
      requests++;await read('minhngoc',`https://xosominhngoc.net.vn/kqxs-${product==='mega645'?'mega-645':'power-655'}-ngay-${date.split('-').reverse().join('-')}`,date);
    }
  }
  for(const [date,r] of observed)byDate.set(date,r);
  return {history:[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)),health,added:[...observed.keys()].filter(d=>!history.some(h=>h.date===d)).length};
}
function expectedDrawDate(product,today){let d=dateObj(today);for(let i=0;i<7;i++,d=addDays(d,-1))if(CFG[product].jsDow.has(d.getUTCDay()))return isoDate(d);}

function dedupeHistory(hist) {
  const map=new Map();
  for (const d of hist||[]) {
    const key=`${d.draw_id}|${d.date}`;
    const old=map.get(key);
    if (!old) map.set(key,{...d,sources:[...(d.sources||[])]});
    else old.sources=[...new Set([...(old.sources||[]),...(d.sources||[])])];
  }
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}

async function bootstrap(env, product) {
  const key=`history:${product}`;
  const saved=await env.DATA.get(key,'json');
  if (Array.isArray(saved)&&saved.length>100) return saved;
  const csv=await fetchText(CFG[product].seed,2);
  const hist=parseSeedCsv(csv,product);
  if (hist.length<100) throw new Error(`bootstrap ${product} quá ít dữ liệu: ${hist.length}`);
  await env.DATA.put(key, JSON.stringify(hist));
  return hist;
}

async function latestOfficial(product) {
  const cfg=CFG[product];
  const html=await fetchText(cfg.official,2);
  const rows=parseOfficial(product,html,'vietlott');
  rows.sort((a,b)=>a.date.localeCompare(b.date)||a.draw_id.localeCompare(b.draw_id));
  return {latest:rows.at(-1)||null, rows};
}

async function catchUpOfficial(product, history, maxFetch=22) {
  const cfg=CFG[product], health=[];
  let latest=null;
  try {
    const got=await latestOfficial(product); latest=got.latest;
    health.push({source:'vietlott',ok:!!latest,records:got.rows.length,url:cfg.official});
  } catch(e) { health.push({source:'vietlott',ok:false,records:0,url:cfg.official,error:String(e).slice(0,160)}); }
  if (!latest) return {history,added:[],health,latest:null};
  let lastId=history.length?Number(history.at(-1).draw_id):0;
  const targetId=Number(latest.draw_id);
  const added=[];
  const end=Math.min(targetId,lastId+maxFetch);
  const map=new Map(history.map(d=>[`${d.draw_id}|${d.date}`,d]));
  for (let id=lastId+1; id<=end; id++) {
    const sid=String(id).padStart(5,'0');
    try {
      const html=await fetchText(`${cfg.official}?id=${sid}&nocatche=1`,2);
      const rows=parseOfficial(product,html,'vietlott').filter(r=>r.draw_id===sid);
      if (!rows.length) { health.push({source:`vietlott#${sid}`,ok:false,records:0}); continue; }
      const r=rows.at(-1); const key=`${r.draw_id}|${r.date}`;
      if (!map.has(key)) { const obj={...r,sources:['vietlott']}; delete obj.source; map.set(key,obj); added.push(obj); }
    } catch(e) { health.push({source:`vietlott#${sid}`,ok:false,records:0,error:String(e).slice(0,120)}); }
  }
  // Add the latest page result even if a gap still remains; dedupe later.
  if (latest) {
    const key=`${latest.draw_id}|${latest.date}`;
    if (!map.has(key) && targetId<=lastId+maxFetch+1) { const obj={...latest,sources:['vietlott']}; delete obj.source; map.set(key,obj); added.push(obj); }
  }
  return {history:dedupeHistory([...map.values()]),added,health,latest};
}

async function crossCheckLatest(product, latest) {
  const cfg=CFG[product], health=[], matches=[];
  for (const [name,url] of cfg.secondary) {
    try {
      const html=await fetchText(url,2);
      const rows=parseSecondary(product,html,name);
      let ok=false;
      if (latest) {
        ok=rows.some(r=>r.date===latest.date && r.numbers.join(',')===latest.numbers.join(','));
      } else ok=rows.length>0;
      if (ok) matches.push(name);
      health.push({source:name,ok,records:rows.length,url});
    } catch(e) { health.push({source:name,ok:false,records:0,url,error:String(e).slice(0,150)}); }
  }
  return {health,matches};
}

function extractPrizeBlock(block) {
  const specs=[
    [/G\.?\s*ĐB|Giải\s*(?:ĐB|Đặc\s*Biệt)|(?:^|\s)ĐB(?=\s)/i,1,5],
    [/G\.?\s*1|Giải\s*(?:nhất|một)|(?:^|\s)Nhất(?=\s)/i,1,5],
    [/G\.?\s*2|Giải\s*(?:nhì|hai)|(?:^|\s)Nhì(?=\s)/i,2,5],
    [/G\.?\s*3|Giải\s*ba|(?:^|\s)Ba(?=\s)/i,6,5],
    [/G\.?\s*4|Giải\s*tư|(?:^|\s)Tư(?=\s)/i,4,4],
    [/G\.?\s*5|Giải\s*năm|(?:^|\s)Năm(?=\s)/i,6,4],
    [/G\.?\s*6|Giải\s*sáu|(?:^|\s)Sáu(?=\s)/i,3,3],
    [/G\.?\s*7|Giải\s*bảy|(?:^|\s)Bảy(?=\s)/i,4,2]
  ];  const vals=[];
  for (let i=0;i<specs.length;i++) {
    const [lab,count,len]=specs[i];
    const lm=lab.exec(block); if (!lm) return null;
    const start=lm.index+lm[0].length;
    let end=block.length;
    if (i+1<specs.length) { const nm=specs[i+1][0].exec(block.slice(start)); if(nm) end=start+nm.index; }
    const seg=block.slice(start,end);
    const nums=(seg.match(new RegExp(`(?<!\\d)\\d{${len}}(?!\\d)`,'g'))||[]).slice(0,count);
    if (nums.length!==count) return null;
    vals.push(...nums);
  }
  return vals;
}

function parseXsmb60(html) {
  const t=htmlToText(html), rows=[], seen=new Set();
  // Current sources may include weekday digits between "XSMB" and the draw date.
  const dateRe=/(?:XSMB|XSTD|Miền Bắc)[\s\S]{0,105}?(\d{1,2}[\/-]\d{1,2}[\/-]20\d{2})/gi;
  const matches=[]; let m;
  while ((m=dateRe.exec(t))) matches.push({idx:m.index,date:parseDmy(m[1])});
  for (let i=0;i<matches.length;i++) {
    const {idx,date}=matches[i]; if(!date||seen.has(date)) continue;
    const end=i+1<matches.length?matches[i+1].idx:Math.min(t.length,idx+2200);
    const block=t.slice(idx,end);
    const vals=extractPrizeBlock(block);
    if (vals&&vals.length===27) { rows.push({date,last2:vals.map(x=>Number(x.slice(-2))),full:vals}); seen.add(date); }
  }
  rows.sort((a,b)=>b.date.localeCompare(a.date));
  return rows.slice(0,205);
}

function previousDateIso(targetDate){return isoDate(addDays(targetDate,-1));}
function parseAllRegionsDaily(html,targetDate){
  const t=htmlToText(html), wanted=targetDate.split('-').reverse().join('/');
  const vals=[], prizeRe=/Giải\s*(?:ĐB|Đặc\s*Biệt|nhất|nhì|ba|tư|năm|sáu|bảy|tám|8)\s+((?:\d{2,6}(?:\s+|$)){1,7})/gi;
  const sectionRe=/KẾT QUẢ XỔ SỐ\s+(?:Miền Nam|Miền Bắc|Miền Trung)[\s\S]*?(?=KẾT QUẢ XỔ SỐ\s+(?:Miền Nam|Miền Bắc|Miền Trung|ĐIỆN TOÁN)|$)/gi;
  const sections=t.match(sectionRe)||[];
  for(let block of sections){
    if(!block.includes(wanted))continue;
    const electronic=block.search(/KẾT QUẢ XỔ SỐ ĐIỆN TOÁN|Kết quả xổ số điện toán/i);if(electronic>=0)block=block.slice(0,electronic);
    let m;prizeRe.lastIndex=0;
    while((m=prizeRe.exec(block))){
      const nums=m[1].match(/\d{2,6}/g)||[];
      for(const raw of nums)vals.push(Number(raw.slice(-2)));
    }
  }
  return [...new Set(vals.filter(n=>n>=0&&n<=99))];
}
async function fetch3RegionSetForDate(date,maxn){
  const health=[];let all=[];
  try{
    const url=XOSO_BRIDGE+'?bridge=day&date='+encodeURIComponent(date);
    const rr=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'user-agent':'Mozilla/5.0 Vietlott-AutoHoc/bridge'}});
    const j=await rr.json().catch(()=>({}));
    const nums=Array.isArray(j?.numbers)?j.numbers.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=maxn):[];
    const complete=rr.ok&&j?.ok===true&&j?.complete===true;
    health.push({source:'central_xoso_bridge',url,ok:complete,count:nums.length,counts:j?.counts||null});
    if(complete&&nums.length>=20)return {date,numbers:[...new Set(nums)].sort((a,b)=>a-b),health,source:'central_xoso_bridge'};
  }catch(e){health.push({source:'central_xoso_bridge',ok:false,error:String(e).slice(0,160)})}

  const dmy=date.split('-').reverse().join('-');
  const urls=[
    ['minhngoc_daily',`https://www.minhngoc.net.vn/ket-qua-xo-so/${dmy}.html`],
    ['minhngoc_mn',`https://www.minhngoc.net.vn/ket-qua-xo-so/mien-nam/${dmy}.html`],
    ['minhngoc_mt',`https://www.minhngoc.net.vn/ket-qua-xo-so/mien-trung/${dmy}.html`],
    ['minhngoc_mb',`https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/${dmy}.html`]
  ];
  for(const [source,url] of urls){
    try{
      const html=await fetchText(url,2),nums=parseAllRegionsDaily(html,date);
      health.push({source,url,ok:nums.length>0,count:nums.length});
      all.push(...nums);
      if(source==='minhngoc_daily'&&nums.length>=20)break;
    }catch(e){health.push({source,url,ok:false,error:String(e).slice(0,160)})}
  }
  const numbers=[...new Set(all)].filter(n=>n>=1&&n<=maxn).sort((a,b)=>a-b);
  return {date,numbers,health,source:'xsmb_xsmt_xsmn_same_day'};
}
async function fetchPrevious3RegionSet(targetDate,maxn){
  return fetch3RegionSetForDate(previousDateIso(targetDate),maxn);
}

function mergeXsmbRows(sourceRows){
  // Gộp 2–3 nguồn theo từng ngày. Nếu nguồn bất đồng, chọn bộ 27 giải được nhiều nguồn xác nhận nhất;
  // nếu hòa thì ưu tiên nguồn đứng trước trong danh sách cấu hình.
  const byDate=new Map();
  for(const item of sourceRows){
    const {source,priority,rows}=item;
    for(const r of rows||[]){
      if(!r?.date||!Array.isArray(r.full)||r.full.length!==27)continue;
      const sig=r.full.join('|');
      if(!byDate.has(r.date))byDate.set(r.date,new Map());
      const m=byDate.get(r.date),old=m.get(sig)||{row:r,count:0,sources:[],priority};
      old.count++;old.priority=Math.min(old.priority,priority);old.sources.push(source);m.set(sig,old);
    }
  }
  const out=[];
  for(const [date,cands] of byDate){
    const best=[...cands.values()].sort((a,b)=>b.count-a.count||a.priority-b.priority)[0];
    if(best)out.push({...best.row,date,sources:[...new Set(best.sources)],confirmations:best.count});
  }
  out.sort((a,b)=>b.date.localeCompare(a.date));
  return out.slice(0,205);
}

async function fetchXsmb60() {
  const health=[], collected=[];
  try{
    const url=XOSO_BRIDGE+'?bridge=xsmb_history&days=205';
    const rr=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'user-agent':'Mozilla/5.0 Vietlott-AutoHoc/bridge'}});
    const j=await rr.json().catch(()=>({}));
    const rows=Array.isArray(j?.rows)?j.rows.filter(r=>r?.date&&Array.isArray(r?.full)&&r.full.length===27).map(r=>({date:String(r.date),full:r.full.map(String),last2:Array.isArray(r.last2)?r.last2.map(x=>Number(x)):r.full.map(x=>Number(String(x).slice(-2)))})):[];
    if(rows.length)collected.push({source:'central_xoso_bridge',priority:-1,rows});
    health.push({source:'central_xoso_bridge',ok:rr.ok&&j?.ok===true&&rows.length>0,records:rows.length,url});
  }catch(e){health.push({source:'central_xoso_bridge',ok:false,records:0,error:String(e).slice(0,140)})}
  const sources=[
    ['xosodaiphat_200','https://xosodaiphat.com/xsmb-200-ngay.html'],
    ['minhngoc','https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/index-1.html'],
    ['ketqua04','https://www.ketqua04.net/so-ket-qua'],
    ['ketqua188_full27','https://ketqua188.net/so-ket-qua'],
    ['xsmb38_full27','https://xsmb38.live/so-ket-qua/']
  ];
  for (let priority=0;priority<sources.length;priority++) {
    const [name,url]=sources[priority];
    try {
      const html=await fetchText(url,2), parsed=parseXsmb60(html);
      if(parsed.length)collected.push({source:name,priority,rows:parsed});
      health.push({source:name,ok:parsed.length>0,records:parsed.length,url});
    } catch(e) { health.push({source:name,ok:false,records:0,url,error:String(e).slice(0,140)}); }
  }
  // Same-day XSMB sometimes appears on the dated results pages before
  // 200-day archives and the central bridge refresh. Require two independent
  // sources to agree on all 27 original prize strings before accepting it.
  const today=vnToday(),vnHour=vnNow().getUTCHours();
  if(vnHour>=19){
    const dmy=today.split('-').reverse().join('-');
    const exactSources=[
      ['xosodaiphat_dated','https://xosodaiphat.com/xsmb-'+dmy+'.html'],
      ['minhngoc_dated','https://www.minhngoc.net/ket-qua-xo-so/mien-bac/'+dmy+'.html'],
      ['ketqua_dated','https://ketqua.vn/xsmb/'+dmy]
    ];
    const settled=await Promise.all(exactSources.map(async ([source,url])=>{
      try {
        const parsed=parseXsmb60(await fetchText(url,1));
        const row=parsed.find(x=>x.date===today&&x.full?.length===27);
        health.push({source,url,ok:!!row,records:row?1:0});
        return row?{source,row}:null;
      }catch(e){health.push({source,url,ok:false,error:String(e).slice(0,140)});return null;}
    }));
    const bySignature=new Map();
    for(const found of settled.filter(Boolean)){
      const sig=found.row.full.join('|');
      const match=bySignature.get(sig)||{row:found.row,sources:new Set()};
      match.sources.add(found.source);bySignature.set(sig,match);
    }
    const exact=[...bySignature.values()].sort((a,b)=>b.sources.size-a.sources.size)[0];
    if(exact?.sources.size>=2){
      collected.push({source:'confirmed_same_day_full27',priority:-2,rows:[exact.row]});
      health.push({source:'confirmed_same_day_full27',ok:true,records:1,confirmations:exact.sources.size,date:today});
    }else if(settled.some(Boolean)){
      health.push({source:'same_day_full27_guard',ok:false,error:'Only one independently matching 27-prize source; refuse unverified release',date:today});
    }
  }
  const rows=mergeXsmbRows(collected);
  return {rows,health};
}

function countBy(arr,fn) { const m=new Map(); for(const x of arr){const k=fn(x);m.set(k,(m.get(k)||0)+1);} return m; }
function maxGroup(nums,fn) { let m=0; for(const v of countBy(nums,fn).values()) m=Math.max(m,v); return m; }
function digits(n){const s=String(n).padStart(2,'0');return [Number(s[0]),Number(s[1])];}
function digitSum(n){const [a,b]=digits(n);return a+b;}
function digitDiff(n){const [a,b]=digits(n);return Math.abs(a-b);}
function zodiac(n){return (n-1)%12;}
function canIndex(n){return (n-1)%10;}
function chiIndex(n){return (n-1)%12;}
function parityPattern(n){const [a,b]=digits(n);return `${a%2?'L':'C'}${b%2?'L':'C'}`;}
const KEP_AM_SET=new Set([7,70,14,41,29,92,36,63,58,85]);
function isKepAm(n){return KEP_AM_SET.has(Number(n));}
function doubleClass(n){const [a,b]=digits(n);if(a===b)return 'kep_bang';if(Math.abs(a-b)===5)return 'kep_lech';return null;}
function comboKey(nums){return [...nums].sort((a,b)=>a-b).join('-');}
function comb5keys(nums){const a=[...nums].sort((x,y)=>x-y), out=[];for(let skip=0;skip<6;skip++)out.push(a.filter((_,i)=>i!==skip).join('-'));return out;}
function fiveSet(history){const s=new Set();for(const d of history)for(const k of comb5keys(d.numbers))s.add(k);return s;}
function exactSet(history){return new Set((history||[]).map(d=>comboKey(d.numbers)));}
function xsmbJackpotSetBefore(rows,targetDate,maxn,limit=200){const s=new Set();for(const r of (rows||[]).filter(r=>r.date<targetDate).slice(0,limit)){const v=r.full?.[0];if(v!=null){const n=Number(String(v).slice(-2));if(n>=1&&n<=maxn)s.add(n);}}return s;}
function overlapCount(nums,setOrArr){const s=setOrArr instanceof Set?setOrArr:new Set(setOrArr||[]);return nums.filter(n=>s.has(n)).length;}
function hasTuHanhXung(nums){const branches=new Set(nums.map(chiIndex)),groups=[[0,6,3,9],[4,10,1,7],[2,8,5,11]];return groups.some(g=>g.every(x=>branches.has(x)));}
function adaptiveReason(nums,a){
  if(!a?.enabled)return null;
  const sorted=[...nums].sort((x,y)=>x-y),sum=sorted.reduce((x,y)=>x+y,0),span=sorted[5]-sorted[0],odd=sorted.filter(n=>n%2).length;let mg=0;for(let i=1;i<6;i++)mg=Math.max(mg,sorted[i]-sorted[i-1]);
  const outside=(rule,v)=>rule?.enabled&&rule.band&&(v<rule.band[0]||v>rule.band[1]);
  if(outside(a.sum,sum))return 'shape_sum';
  if(outside(a.span,span))return 'shape_span';
  if(outside(a.odd,odd))return 'shape_odd';
  if(outside(a.max_gap,mg))return 'shape_gap';
  if(a.consecutive?.enabled&&consecutiveViolation(sorted))return 'consecutive';
  return null;
}
// Pure rule gate shared by all official/guest portfolios and backtest engines.
// '3 số cuối' means the three highest numbers AFTER ascending sort, not last 3 drawn.
function vietlottHeadAndLast3Gate(nums){
  if(!Array.isArray(nums)||nums.length!==6)return 'invalid_six';
  const a=[...nums].sort((x,y)=>x-y);
  if(a[3]+a[4]+a[5]>110)return 'top3_sum_max110';
  const heads=new Uint8Array(6);
  for(const n of a){const h=Math.floor(n/10);if(h>=0&&h<heads.length)heads[h]++;}
  if(heads[0]+heads[1]+heads[2]>5)return 'head012_max5';
  if(heads[1]+heads[2]+heads[3]>5)return 'head123_max5';
  if(heads[2]+heads[3]+heads[4]>5)return 'head234_max5';
  return 'ok';
}
function hardFilter(nums,maxn,five,xsmbSet,exactPast=null,extra={}){
  if(nums.length!==6||new Set(nums).size!==6||Math.min(...nums)<1||Math.max(...nums)>maxn)return [false,'range'];
  const a=[...nums].sort((x,y)=>x-y);
  const newRules=vietlottHeadAndLast3Gate(a);
  if(newRules!=='ok')return [false,newRules];
  if(exactPast&&exactPast.has(comboKey(a)))return [false,'past_exact'];
  const mod3Counts=countBy(a,x=>x%3);for(const v of mod3Counts.values())if(v>3)return [false,'mod3'];
  if((mod3Counts.get(0)||0)+(mod3Counts.get(1)||0)>5||(mod3Counts.get(1)||0)+(mod3Counts.get(2)||0)>5||(mod3Counts.get(2)||0)+(mod3Counts.get(0)||0)>5)return [false,'mod3_pair_max5'];
  if(maxGroup(a,digitSum)>2)return [false,'tong'];
  if(maxGroup(a,digitDiff)>2)return [false,'hieu'];
  if(maxGroup(a,zodiac)>3)return [false,'con_giap'];
  if(maxGroup(a,canIndex)>2)return [false,'can'];
  if(maxGroup(a,chiIndex)>2)return [false,'chi'];
  const kepBang=a.filter(x=>doubleClass(x)==='kep_bang').length;if(kepBang>2)return [false,'kep_bang_max2'];
  const kepLech=a.filter(x=>doubleClass(x)==='kep_lech').length;if(kepLech>2)return [false,'kep_lech_max2'];
  const kepAm=a.filter(isKepAm).length;if(kepAm>3)return [false,'kep_am_max3'];
  if(kepLech+kepAm>4)return [false,'kep_lech_am_max4'];
  const pp=countBy(a,parityPattern);
  if((pp.get('CC')||0)>3)return [false,'chan_chan'];
  if((pp.get('LL')||0)>3)return [false,'le_le'];
  const parityCap=maxn===45?4:5;
  if((pp.get('CC')||0)+(pp.get('LL')||0)>parityCap)return [false,'same_parity_pattern_cap'];
  if((pp.get('CL')||0)+(pp.get('LC')||0)>parityCap)return [false,'mixed_parity_pattern_cap'];

  const tensParity=countBy(a,n=>digits(n)[0]%2),unitParity=countBy(a,n=>digits(n)[1]%2);
  const tensCap=maxn===45?4:5;
  for(const v of tensParity.values())if(v>tensCap)return [false,'chuc_chan_le'];
  for(const v of unitParity.values())if(v>4)return [false,'dv_chan_le'];

  if(maxGroup(a,n=>digits(n)[0])>4)return [false,'same_head_max4'];
  if(maxGroup(a,n=>digits(n)[1])>4)return [false,'same_tail_max4'];
  const tailCounts=countBy(a,n=>digits(n)[1]);
  for(const [u,v] of [[0,5],[1,6],[2,7],[3,8],[4,9]])if((tailCounts.get(u)||0)+(tailCounts.get(v)||0)>4)return [false,'tail_pair_max4'];

  const touches=new Set();
  for(const n of a){const [h,t]=digits(n);touches.add(h);touches.add(t);}
  if(touches.size<4)return [false,'touch_distinct_min4'];
  if(touches.size>8)return [false,'touch_distinct_max8'];

  const total=a.reduce((s,n)=>s+n,0);
  if(total>(maxn===45?160:200))return [false,'ticket_sum_cap'];

  if(hasTuHanhXung(a))return [false,'tu_hanh_xung'];
  for(const k of comb5keys(a))if(five?.has(k))return [false,'past_overlap'];
  if(!xsmbSet?.size)return [false,'prev_3region_missing'];
  const prevLotteryOverlap=overlapCount(a,xsmbSet);
  if(prevLotteryOverlap<1)return [false,'prev_lottery_min1'];
  if(prevLotteryOverlap>4)return [false,'prev_lottery_max4'];

  const headCounts=countBy(a,n=>digits(n)[0]),hd=n=>headCounts.get(n)||0;
  if(headCounts.size<3)return [false,'head_coverage_min3'];
  for(const [u,v] of [[0,5],[1,2],[2,3],[3,4],[4,5]])if(hd(u)+hd(v)>5)return [false,'head_pair_max5'];
  if(hd(2)+hd(3)<2)return [false,'head23_min2'];
  if(hd(2)+hd(3)+hd(4)+(maxn===55?hd(5):0)<3)return [false,'head_required_min3'];
  if(hd(3)+hd(4)>4)return [false,'head34_max4'];
  if(maxn===45){
    if(hd(3)>3||hd(4)>3)return [false,'head34_each_max3'];
    if(hd(3)===3&&hd(4)===3)return [false,'head34_not_both3'];
  }else{
    if(hd(4)>3||hd(5)>3)return [false,'head45_each_max3'];
    if(hd(4)===3&&hd(5)===3)return [false,'head45_not_both3'];
    if(hd(4)+hd(5)>4)return [false,'head45_max4'];
  }

  if(!extra.xsmbJackpotSet?.size)return [false,'xsmb_jackpot_missing'];
  if(overlapCount(a,extra.xsmbJackpotSet)<1)return [false,'xsmb_jackpot200'];
  return [true,'ok'];
}
function normalize(raw,maxn){let lo=Infinity,hi=-Infinity;for(let i=1;i<=maxn;i++){const v=raw[i]||0;lo=Math.min(lo,v);hi=Math.max(hi,v);}const out={};if(!(hi>lo)){for(let i=1;i<=maxn;i++)out[i]=.5;return out;}for(let i=1;i<=maxn;i++)out[i]=((raw[i]||0)-lo)/(hi-lo);return out;}
function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0;}
function median(a){if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2;}
function mode(a,def=3){if(!a.length)return def;const c=countBy(a,x=>x);return [...c.entries()].sort((x,y)=>y[1]-x[1])[0][0];}
function dayOfWeek(s){return dateObj(s).getUTCDay();}
function monthOf(s){return dateObj(s).getUTCMonth()+1;}

function methodScores(history,maxn,targetDate) {
  const H=[...history].sort((a,b)=>a.date.localeCompare(b.date));
  if(!H.length){const z={};for(let i=1;i<=maxn;i++)z[i]=.5;return Object.fromEntries(METHOD_NAMES.map(k=>[k,{...z}]));}
  const recent=H.slice(-Math.min(300,H.length)),lastDraw=[...H.at(-1).numbers].sort((a,b)=>a-b),lastSet=new Set(lastDraw);
  const zero=()=>Array(maxn+1).fill(0);
  const addNums=(arr,draw,w=1)=>{for(const n of draw.numbers)if(n>=1&&n<=maxn)arr[n]+=w;};

  // Tần suất / xu hướng: chỉ dùng các cửa sổ người dùng đã từng yêu cầu (60/120)
  // và kho 300 kỳ của pipeline cũ.
  const f300=zero(),f120=zero(),f60=zero();
  for(const d of recent)addNums(f300,d);
  for(const d of H.slice(-120))addNums(f120,d);
  for(const d of H.slice(-60))addNums(f60,d);
  const out={};
  out.frequency=normalize(f300,maxn);
  const trendRaw=zero();
  for(let n=1;n<=maxn;n++)trendRaw[n]=(f60[n]/Math.max(1,Math.min(60,H.length)))-(f120[n]/Math.max(1,Math.min(120,H.length)));
  out.trend=normalize(trendRaw,maxn);

  // Tam giác cộng dồn: cộng các cặp kề nhau của dãy 6 số từng kỳ, quy về miền 1..maxn.
  // Không có ngưỡng assistant; chỉ tạo tín hiệu xếp hạng.
  const tri=zero();
  for(const d of recent){
    let row=[...d.numbers].sort((a,b)=>a-b);
    while(row.length>1){
      const next=[];
      for(let i=0;i<row.length-1;i++){
        const v=((row[i]+row[i+1]-1)%maxn)+1;
        next.push(v);tri[v]++;
      }
      row=next;
    }
  }
  out.triangle=normalize(tri,maxn);

  // Cầu vị trí + ghép vị trí trên dãy đã sắp tăng.
  const pos=zero(),posPair=zero();
  for(const d of recent){
    const a=[...d.numbers].sort((x,y)=>x-y);
    for(let p=0;p<6;p++)pos[a[p]]++;
    for(let p=0;p<5;p++){
      const v=((a[p]+a[p+1]-1)%maxn)+1;
      posPair[v]++;
    }
  }
  out.position=normalize(pos,maxn);out.position_pair=normalize(posPair,maxn);

  // Nhịp / gap.
  const gaps=Array.from({length:maxn+1},()=>[]),prev=Array(maxn+1).fill(-1),last=Array(maxn+1).fill(-1);
  recent.forEach((d,idx)=>{for(const n of d.numbers){if(prev[n]>=0)gaps[n].push(idx-prev[n]);prev[n]=idx;last[n]=idx;}});
  const rhythm=zero(),cur=recent.length;
  for(let n=1;n<=maxn;n++){const gap=last[n]>=0?cur-last[n]:cur+1,md=median(gaps[n])||gap;rhythm[n]=1/(1+Math.abs(gap-md));}
  out.rhythm=normalize(rhythm,maxn);

  // Thứ trong tuần + tín hiệu ngày/lịch.
  const wd=dayOfWeek(targetDate),dom=Number(targetDate.slice(8,10)),mo=monthOf(targetDate),weekday=zero(),daySig=zero();
  for(const d of H.slice(-Math.min(600,H.length))){
    if(dayOfWeek(d.date)===wd)addNums(weekday,d);
    if(Number(d.date.slice(8,10))===dom||monthOf(d.date)===mo)addNums(daySig,d);
  }
  out.weekday=normalize(weekday,maxn);out.day_signal=normalize(daySig,maxn);

  // Can–Chi / 12 con giáp theo chính các lớp số người dùng đã dùng.
  const canClass=Array(10).fill(0),zClass=Array(12).fill(0);
  for(const d of recent)for(const n of d.numbers){canClass[canIndex(n)]++;zClass[zodiac(n)]++;}
  const canRaw=zero(),zRaw=zero();
  for(let n=1;n<=maxn;n++){canRaw[n]=canClass[canIndex(n)];zRaw[n]=zClass[zodiac(n)];}
  out.canchi=normalize(canRaw,maxn);out.zodiac=normalize(zRaw,maxn);

  // Lộn AB-BA.
  const rev=zero();
  for(const d of recent)for(const n of d.numbers){
    const [a,b]=digits(n),r=b*10+a;
    if(r>=1&&r<=maxn)rev[r]++;
  }
  out.reverse=normalize(rev,maxn);

  // Chạm / tổng / hiệu.
  const touchClass=Array(10).fill(0),sumClass=Array(19).fill(0),diffClass=Array(10).fill(0);
  for(const d of recent)for(const n of d.numbers){
    const [a,b]=digits(n);touchClass[a]++;if(b!==a)touchClass[b]++;
    sumClass[digitSum(n)]++;diffClass[digitDiff(n)]++;
  }
  const touchRaw=zero(),totalRaw=zero(),diffRaw=zero();
  for(let n=1;n<=maxn;n++){
    const [a,b]=digits(n);
    touchRaw[n]=touchClass[a]+(b===a?0:touchClass[b]);
    totalRaw[n]=sumClass[digitSum(n)];
    diffRaw[n]=diffClass[digitDiff(n)];
  }
  out.touch=normalize(touchRaw,maxn);out.total=normalize(totalRaw,maxn);out.difference=normalize(diffRaw,maxn);

  // Cầu loại số: điểm sống sót là nghịch đảo đồng thuận của các nhóm loại
  // mà người dùng đã yêu cầu (chạm/tổng/hiệu/CanChi/con giáp), không thêm nhóm mới.
  const elim=zero();
  for(let n=1;n<=maxn;n++){
    const risk=(out.touch[n]+out.total[n]+out.difference[n]+out.canchi[n]+out.zodiac[n])/5;
    elim[n]=1-risk;
  }
  out.elimination=normalize(elim,maxn);

  // Cầu chuyển tiếp bộ 2/3/4: xem các kỳ quá khứ có mức giao với kỳ gần nhất,
  // rồi cộng tín hiệu cho kỳ kế tiếp.
  for(const k of [2,3,4]){
    const raw=zero();
    for(let i=0;i<H.length-1;i++){
      const overlap=H[i].numbers.filter(n=>lastSet.has(n)).length;
      if(overlap<k)continue;
      for(const n of H[i+1].numbers)raw[n]++;
    }
    out['transition'+k]=normalize(raw,maxn);
  }

  // Cầu kèo / cặp số: đồng xuất hiện cùng các số của kỳ gần nhất.
  const pair=zero();
  for(const d of H.slice(-Math.min(500,H.length))){
    const s=new Set(d.numbers),shared=[...lastSet].filter(n=>s.has(n)).length;
    if(!shared)continue;
    for(const n of d.numbers)pair[n]+=shared;
  }
  out.pair_keo=normalize(pair,maxn);
  return out;
}

const METHOD_SCORE_CACHE=new Map();
function cachedMethodScores(history,maxn,targetDate){
  const last=history.at(-1);
  const key=`${maxn}|${history.length}|${last?.draw_id||''}|${last?.date||''}|${targetDate}`;
  if(METHOD_SCORE_CACHE.has(key))return METHOD_SCORE_CACHE.get(key);
  const value=methodScores(history,maxn,targetDate);
  METHOD_SCORE_CACHE.set(key,value);
  // Backtest windows overlap heavily. Keeping only the latest 240 prefixes
  // preserves exact calculations while preventing unbounded memory growth.
  if(METHOD_SCORE_CACHE.size>240){
    const oldest=METHOD_SCORE_CACHE.keys().next().value;
    METHOD_SCORE_CACHE.delete(oldest);
  }
  return value;
}

function learnWeights(history,maxn,lookback=120){
  const H=[...history].sort((a,b)=>a.date.localeCompare(b.date));
  if(H.length<45)return Object.fromEntries(METHOD_NAMES.map(m=>[m,1/METHOD_NAMES.length]));
  const start=Math.max(35,H.length-lookback),perf=Object.fromEntries(METHOD_NAMES.map(m=>[m,[]])),topk=Math.max(12,Math.round(maxn*.27));
  for(let idx=start;idx<H.length;idx++){
    const train=H.slice(0,idx),actual=new Set(H[idx].numbers),scores=cachedMethodScores(train,maxn,H[idx].date);
    for(const m of METHOD_NAMES){const top=Array.from({length:maxn},(_,i)=>i+1).sort((a,b)=>scores[m][b]-scores[m][a]).slice(0,topk);let hits=0;for(const n of top)if(actual.has(n))hits++;perf[m].push(hits/6);}
  }
  const base=topk/maxn,raw={};let total=0;
  for(const m of METHOD_NAMES){const a=perf[m],avg=mean(a),recent=mean(a.slice(-24)),edge=.58*(avg-base)+.42*(recent-base),v=Math.exp(Math.max(-2,Math.min(2,edge*8)));raw[m]=v;total+=v;}
  for(const m of METHOD_NAMES)raw[m]/=total||1;return raw;
}

function ensemble(history,maxn,targetDate,weights){const ms=methodScores(history,maxn,targetDate),out={};for(let i=1;i<=maxn;i++)out[i]=0;for(const m of METHOD_NAMES){const w=weights[m]||0;for(let i=1;i<=maxn;i++)out[i]+=w*ms[m][i];}return {scores:normalize(out,maxn),methods:ms};}
function std(a){if(!a.length)return 1;const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))||1;}
function shapeStats(history,maxn){const H=history.slice(-300),sums=H.map(d=>d.numbers.reduce((a,b)=>a+b,0)),odds=H.map(d=>d.numbers.filter(n=>n%2).length),half=Math.floor(maxn/2),lows=H.map(d=>d.numbers.filter(n=>n<=half).length);return {sumMean:mean(sums),sumSd:std(sums),oddMode:mode(odds,3),lowMode:mode(lows,3)};}
function pairCounter(history){const c=new Map();for(const d of history.slice(-260)){const a=[...d.numbers].sort((x,y)=>x-y);for(let i=0;i<6;i++)for(let j=i+1;j<6;j++){const k=`${a[i]}-${a[j]}`;c.set(k,(c.get(k)||0)+1);}}return c;}
function comboScore(nums,scores){return nums.reduce((a,n)=>a+Number(scores[n]||0),0);}

function hashSeed(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rngFrom(seed){let x=seed||123456789;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return ((x>>>0)/4294967296);};}
function weightedSample(pool,weights,rng,k=6){const p=[...pool],w=[...weights],out=[];for(let z=0;z<k;z++){let total=w.reduce((a,b)=>a+b,0),r=rng()*total,acc=0,idx=0;for(;idx<w.length;idx++){acc+=w[idx];if(acc>=r)break;}out.push(p.splice(Math.min(idx,p.length-1),1)[0]);w.splice(Math.min(idx,w.length-1),1);}return out.sort((a,b)=>a-b);}

function generateCandidates(history,maxn,targetDate,xsmbSet,nout=200,attempts=12000,weightsOverride=null,salt='live',xsmbRows=[]){
  const H=[...history].sort((a,b)=>a.date.localeCompare(b.date)),weights=weightsOverride||learnWeights(H,maxn),{scores}=ensemble(H,maxn,targetDate,weights),five=fiveSet(H),exact=exactSet(H);
  const extra={xsmbJackpotSet:xsmbJackpotSetBefore(xsmbRows,targetDate,maxn,200)};
  const rankedPool=Array.from({length:maxn},(_,i)=>i+1).sort((a,b)=>scores[b]-scores[a]);
  const pool=rankedPool,wts=pool.map(n=>.025+Math.pow(scores[n],2.05)),rng=rngFrom(hashSeed(`${targetDate}|${maxn}|${salt}|${H.at(-1)?.date||''}`));
  const best=new Map(),rejects={};
  const targetUnique=Math.max(nout*2,nout+80),budget=Math.max(attempts,nout>=200?60000:attempts);
  for(let a=0;a<budget;a++){
    const pick=weightedSample(pool,wts,rng,6),[ok,reason]=hardFilter(pick,maxn,five,xsmbSet,exact,extra);if(!ok){rejects[reason]=(rejects[reason]||0)+1;continue;}const key=pick.join('-'),sc=comboScore(pick,scores);if(sc>(best.get(key)?.score??-Infinity))best.set(key,{numbers:pick,score:sc});if(best.size>=targetUnique&&a>Math.min(10000,budget/3))break;
  }
  // Deterministic fill if the weighted sampler produced fewer than requested.
  if(best.size<nout){
    const top=rankedPool.slice(0,Math.min(maxn,32));let checked=0;
    outer:for(let i=0;i<top.length-5;i++)for(let j=i+1;j<top.length-4;j++)for(let k=j+1;k<top.length-3;k++)for(let l=k+1;l<top.length-2;l++)for(let m=l+1;m<top.length-1;m++)for(let q=m+1;q<top.length;q++){
      const pick=[top[i],top[j],top[k],top[l],top[m],top[q]].sort((x,y)=>x-y);checked++;const [ok]=hardFilter(pick,maxn,five,xsmbSet,exact,extra);if(ok){const key=pick.join('-');if(!best.has(key))best.set(key,{numbers:pick,score:comboScore(pick,scores)});if(best.size>=nout)break outer;}if(checked>700000)break outer;
    }
  }
  const ranked=[...best.values()].sort((a,b)=>b.score-a.score).slice(0,nout),mx=ranked[0]?.score||1;
  return {target_date:targetDate,weights,number_scores:Object.fromEntries(Array.from({length:maxn},(_,i)=>[String(i+1),Number(scores[i+1].toFixed(6))])),candidates:ranked.map(x=>({numbers:x.numbers,score:Number((x.score/mx*100).toFixed(2))})),rejects,hard_context:{xsmb_jackpot_pool:extra.xsmbJackpotSet.size,user_only:true}};
}


function enc5(a,b,c,d,e){return ((((a*64+b)*64+c)*64+d)*64+e);}
function enc6(a,b,c,d,e,f){return (((((a*64+b)*64+c)*64+d)*64+e)*64+f);}
function encodedHistorySets(history){
  const blocked5=new Set(),exact=new Set();
  for(const d of history||[]){const a=[...d.numbers].sort((x,y)=>x-y);if(a.length!==6)continue;exact.add(enc6(...a));for(let skip=0;skip<6;skip++){const b=a.filter((_,i)=>i!==skip);blocked5.add(enc5(...b));}}
  return {blocked5,exact};
}
function hasEncoded5(set,n){
  return set.has(enc5(n[1],n[2],n[3],n[4],n[5]))||set.has(enc5(n[0],n[2],n[3],n[4],n[5]))||set.has(enc5(n[0],n[1],n[3],n[4],n[5]))||set.has(enc5(n[0],n[1],n[2],n[4],n[5]))||set.has(enc5(n[0],n[1],n[2],n[3],n[5]))||set.has(enc5(n[0],n[1],n[2],n[3],n[4]));
}
function prepareFastFilter(history,maxn,targetDate,xsmbSet,xsmbRows){
  const {blocked5,exact}=encodedHistorySets(history),x=Array(maxn+1).fill(false),jp=Array(maxn+1).fill(false),ds=Array(maxn+1),dd=Array(maxn+1),z=Array(maxn+1),ca=Array(maxn+1),ch=Array(maxn+1),pp=Array(maxn+1),dc=Array(maxn+1),ka=Array(maxn+1),head=Array(maxn+1),tail=Array(maxn+1),branchBit=Array(maxn+1);
  for(const n of xsmbSet||[])if(n>=1&&n<=maxn)x[n]=true;
  const jpSet=xsmbJackpotSetBefore(xsmbRows,targetDate,maxn,200);for(const n of jpSet)jp[n]=true;
  for(let n=1;n<=maxn;n++){const [a,b]=digits(n);ds[n]=a+b;dd[n]=Math.abs(a-b);z[n]=(n-1)%12;ca[n]=(n-1)%10;ch[n]=(n-1)%12;pp[n]=(a%2)*2+(b%2);dc[n]=a===b?1:(Math.abs(a-b)===5?2:0);ka[n]=isKepAm(n)?1:0;head[n]=a;tail[n]=b;branchBit[n]=1<<ch[n];}
  return {maxn,blocked5,exact,x,jp,xRequired:!!xsmbSet?.size,jpRequired:jpSet.size>0,ds,dd,z,ca,ch,pp,dc,ka,head,tail,branchBit};
}
function fastFilterReason(n,c){
  const newRules=vietlottHeadAndLast3Gate(n);
  if(newRules!=='ok')return newRules;
  if(c.exact.has(enc6(...n)))return 'past_exact';
  const m3=[0,0,0],sum=Array(19).fill(0),dif=Array(10).fill(0),zo=Array(12).fill(0),can=Array(10).fill(0),chi=Array(12).fill(0),kp=[0,0,0],hd=Array(10).fill(0),tl=Array(10).fill(0),tp=[0,0],up=[0,0],touchSeen=Array(10).fill(false);
  let cc=0,ll=0,cl=0,lc=0,xo=0,jpo=0,mask=0,total=0,kepLech=0,kepAm=0,touchDistinct=0;
  const tensCap=c.maxn===45?4:5,parityCap=c.maxn===45?4:5;
  for(const v of n){
    total+=v;
    if(++m3[v%3]>3)return 'mod3';
    if(++sum[c.ds[v]]>2)return 'tong';
    if(++dif[c.dd[v]]>2)return 'hieu';
    if(++zo[c.z[v]]>3)return 'con_giap';
    if(++can[c.ca[v]]>2)return 'can';
    if(++chi[c.ch[v]]>2)return 'chi';
    if(c.dc[v]===1&&++kp[1]>2)return 'kep_bang_max2';
    if(c.dc[v]===2&&++kepLech>2)return 'kep_lech_max2';
    if(c.ka[v]&&++kepAm>3)return 'kep_am_max3';
    if(kepLech+kepAm>4)return 'kep_lech_am_max4';
    if(c.pp[v]===0&&++cc>3)return 'chan_chan';
    if(c.pp[v]===3&&++ll>3)return 'le_le';
    if(c.pp[v]===1)cl++;else if(c.pp[v]===2)lc++;
    if(cc+ll>parityCap)return 'same_parity_pattern_cap';
    if(cl+lc>parityCap)return 'mixed_parity_pattern_cap';
    if(++tp[c.head[v]%2]>tensCap)return 'chuc_chan_le';
    if(++up[c.tail[v]%2]>4)return 'dv_chan_le';
    if(++hd[c.head[v]]>4)return 'same_head_max4';
    if(++tl[c.tail[v]]>4)return 'same_tail_max4';
    if(!touchSeen[c.head[v]]){touchSeen[c.head[v]]=true;touchDistinct++}
    if(!touchSeen[c.tail[v]]){touchSeen[c.tail[v]]=true;touchDistinct++}
    if(c.x[v])xo++;
    if(c.jp[v])jpo++;
    mask|=c.branchBit[v];
  }
  if(touchDistinct<4)return 'touch_distinct_min4';
  if(touchDistinct>8)return 'touch_distinct_max8';
  if(m3[0]+m3[1]>5||m3[1]+m3[2]>5||m3[2]+m3[0]>5)return 'mod3_pair_max5';
  for(const [u,v] of [[0,5],[1,6],[2,7],[3,8],[4,9]])if((tl[u]||0)+(tl[v]||0)>4)return 'tail_pair_max4';
  for(const [u,v] of [[0,5],[1,2],[2,3],[3,4],[4,5]])if((hd[u]||0)+(hd[v]||0)>5)return 'head_pair_max5';
  if(total>(c.maxn===45?160:200))return 'ticket_sum_cap';
  const g1=(1<<0)|(1<<6)|(1<<3)|(1<<9),g2=(1<<4)|(1<<10)|(1<<1)|(1<<7),g3=(1<<2)|(1<<8)|(1<<5)|(1<<11);
  if((mask&g1)===g1||(mask&g2)===g2||(mask&g3)===g3)return 'tu_hanh_xung';
  if(hasEncoded5(c.blocked5,n))return 'past_overlap';
  if(!c.xRequired)return 'prev_3region_missing';
  if(xo<1)return 'prev_lottery_min1';
  if(xo>4)return 'prev_lottery_max4';
  const headsUsed=hd.reduce((s,v)=>s+(v>0?1:0),0);
  if(headsUsed<3)return 'head_coverage_min3';
  if((hd[2]||0)+(hd[3]||0)<2)return 'head23_min2';
  if((hd[2]||0)+(hd[3]||0)+(hd[4]||0)+(c.maxn===55?(hd[5]||0):0)<3)return 'head_required_min3';
  if((hd[3]||0)+(hd[4]||0)>4)return 'head34_max4';
  if(c.maxn===45){
    if((hd[3]||0)>3||(hd[4]||0)>3)return 'head34_each_max3';
    if((hd[3]||0)===3&&(hd[4]||0)===3)return 'head34_not_both3';
  }else{
    if((hd[4]||0)>3||(hd[5]||0)>3)return 'head45_each_max3';
    if((hd[4]||0)===3&&(hd[5]||0)===3)return 'head45_not_both3';
    if((hd[4]||0)+(hd[5]||0)>4)return 'head45_max4';
  }
  if(!c.jpRequired)return 'xsmb_jackpot_missing';
  if(jpo<1)return 'xsmb_jackpot200';
  return 'ok';
}
function fastPrize(product,n,draw,hit){
  const m=(hit[n[0]]?1:0)+(hit[n[1]]?1:0)+(hit[n[2]]?1:0)+(hit[n[3]]?1:0)+(hit[n[4]]?1:0)+(hit[n[5]]?1:0);
  if(product==='mega645')return ({6:'Jackpot',5:'Giải nhất',4:'Giải nhì',3:'Giải ba'})[m]||null;
  if(m===6)return 'Jackpot 1';
  if(m===5&&draw.special!=null&&n.includes(draw.special))return 'Jackpot 2';
  return ({5:'Giải nhất',4:'Giải nhì',3:'Giải ba'})[m]||null;
}
function summarizeTickets(product,candidates,draw){
  const counts={},wins=[];for(const c of candidates||[]){const p=prizeName(product,c.numbers||c,draw);if(p){counts[p]=(counts[p]||0)+1;wins.push({prize:p,numbers:c.numbers||c});}}
  wins.sort((a,b)=>rankPrize(b.prize)-rankPrize(a.prize));
  const total=(candidates||[]).length,winning=wins.length;
  return {total,winning_tickets:winning,losing_tickets:Math.max(0,total-winning),prize_counts:counts,best_prize:wins[0]?.prize||null,wins};
}
function countFilteredPool(history,maxn,targetDate,xsmbSet,xsmbRows){
  const ctx=prepareFastFilter(history,maxn,targetDate,xsmbSet,xsmbRows),m=maxn;
  let valid=0,scanned=0;
  const check=n=>{scanned++;if(fastFilterReason(n,ctx)==='ok')valid++};
  for(let a=1;a<=m-5;a++)
    for(let b=a+1;b<=m-4;b++)
      for(let c=b+1;c<=m-3;c++)
        for(let d=c+1;d<=m-2;d++)
          for(let e=d+1;e<=m-1;e++)
            for(let f=e+1;f<=m;f++)check([a,b,c,d,e,f]);
  return {
    target_date:targetDate,
    scanned,
    valid_total:valid,
    statistics_scope:{user_rules:'user_only',system_rules:0,mode:'full_filtered_pool'},
    filter_snapshot:{xsmb_date:xsmbBefore(xsmbRows,targetDate)?.date||null,user_rules:'user_only',system_rules:0}
  };
}

function collectFilteredPool(history,maxn,targetDate,xsmbSet,xsmbRows){
  const ctx=prepareFastFilter(history,maxn,targetDate,xsmbSet,xsmbRows),m=maxn,keys=[];let scanned=0;
  const filterOk=makeFastFilter6(ctx);
  for(let a=1;a<=m-5;a++)
    for(let b=a+1;b<=m-4;b++)
      for(let c=b+1;c<=m-3;c++)
        for(let d=c+1;d<=m-2;d++)
          for(let e=d+1;e<=m-1;e++)
            for(let g=e+1;g<=m;g++){
              scanned++;
              if(filterOk(a,b,c,d,e,g))keys.push(enc6(a,b,c,d,e,g));
            }
  return {target_date:targetDate,scanned,valid_total:keys.length,encoding:'base64x6-int',keys};
}

function scanFilteredOutcome(history,product,maxn,targetDate,xsmbSet,xsmbRows,draw,aiCandidates=[]){
  const ctx=prepareFastFilter(history,maxn,targetDate,xsmbSet,xsmbRows),hit=Array(maxn+1).fill(false);
  for(const v of draw.numbers)if(v<=maxn)hit[v]=true;
  const rejects={},prize_counts={},examples={},m=maxn;
  let valid=0,winning=0,scanned=0;
  const check=n=>{
    scanned++;
    const r=fastFilterReason(n,ctx);
    if(r!=='ok'){rejects[r]=(rejects[r]||0)+1;return}
    valid++;
    const p=fastPrize(product,n,draw,hit);
    if(p){
      winning++;
      prize_counts[p]=(prize_counts[p]||0)+1;
      if((examples[p]||[]).length<30)(examples[p]||(examples[p]=[])).push([...n]);
    }
  };
  for(let a=1;a<=m-5;a++)
    for(let b=a+1;b<=m-4;b++)
      for(let c=b+1;c<=m-3;c++)
        for(let d=c+1;d<=m-2;d++)
          for(let e=d+1;e<=m-1;e++)
            for(let f=e+1;f<=m;f++)check([a,b,c,d,e,f]);
  return {
    target_date:targetDate,draw_id:draw.draw_id,result:draw.numbers,special:draw.special||null,scanned,
    ai:summarizeTickets(product,aiCandidates,draw),
    pool:{
      valid_total:valid,
      winning_tickets:winning,
      losing_tickets:Math.max(0,valid-winning),
      prize_counts,
      winning_examples:examples
    },
    statistics_scope:{user_rules:'user_only',system_rules:0,mode:'full_filtered_pool',reduction_applied:false},
    filter_snapshot:{xsmb_date:xsmbBefore(xsmbRows,targetDate)?.date||null,user_rules:'user_only',system_rules:0}
  };
}

function makeFastFilter6(ctx){
  const m3C=new Uint8Array(3),m3S=new Uint32Array(3);
  const sumC=new Uint8Array(19),sumS=new Uint32Array(19);
  const difC=new Uint8Array(10),difS=new Uint32Array(10);
  const zoC=new Uint8Array(12),zoS=new Uint32Array(12);
  const canC=new Uint8Array(10),canS=new Uint32Array(10);
  const chiC=new Uint8Array(12),chiS=new Uint32Array(12);
  const hdC=new Uint8Array(10),hdS=new Uint32Array(10);
  const tlC=new Uint8Array(10),tlS=new Uint32Array(10);
  const touchC=new Uint8Array(10),touchS=new Uint32Array(10);
  const nums=new Int16Array(6);
  let seq=0;
  const count=(C,S,k,id)=>S[k]===id?C[k]:0;
  return function fastFilterOk6(a,b,c,d,e,f){
    const id=++seq;
    nums[0]=a;nums[1]=b;nums[2]=c;nums[3]=d;nums[4]=e;nums[5]=f;
    if(d+e+f>110)return false;
    const h0=ctx.head[a],h1=ctx.head[b],h2=ctx.head[c],h3=ctx.head[d],h4=ctx.head[e],h5=ctx.head[f];
    const inHeads=(lo,hi)=>Number(h0>=lo&&h0<=hi)+Number(h1>=lo&&h1<=hi)+Number(h2>=lo&&h2<=hi)+Number(h3>=lo&&h3<=hi)+Number(h4>=lo&&h4<=hi)+Number(h5>=lo&&h5<=hi);
    if(inHeads(0,2)>5||inHeads(1,3)>5||inHeads(2,4)>5)return false;
    if(ctx.exact.has(enc6(a,b,c,d,e,f)))return false;
    let cc=0,ll=0,cl=0,lc=0,xo=0,jpo=0,mask=0,total=0,kepBang=0,kepLech=0,kepAm=0,headsUsed=0,tp0=0,tp1=0,up0=0,up1=0,touchDistinct=0;
    const tensCap=ctx.maxn===45?4:5, parityCap=ctx.maxn===45?4:5, sumCap=ctx.maxn===45?160:200;
    for(let i=0;i<6;i++){
      const v=nums[i]; total+=v; if(total>sumCap)return false;
      let k=v%3;
      if(m3S[k]!==id){m3S[k]=id;m3C[k]=1}else if(++m3C[k]>3)return false;
      k=ctx.ds[v];
      if(sumS[k]!==id){sumS[k]=id;sumC[k]=1}else if(++sumC[k]>2)return false;
      k=ctx.dd[v];
      if(difS[k]!==id){difS[k]=id;difC[k]=1}else if(++difC[k]>2)return false;
      k=ctx.z[v];
      if(zoS[k]!==id){zoS[k]=id;zoC[k]=1}else if(++zoC[k]>3)return false;
      k=ctx.ca[v];
      if(canS[k]!==id){canS[k]=id;canC[k]=1}else if(++canC[k]>2)return false;
      k=ctx.ch[v];
      if(chiS[k]!==id){chiS[k]=id;chiC[k]=1}else if(++chiC[k]>2)return false;
      if(ctx.dc[v]===1&&++kepBang>2)return false;
      if(ctx.dc[v]===2&&++kepLech>2)return false;
      if(ctx.ka[v]&&++kepAm>3)return false;
      if(kepLech+kepAm>4)return false;
      if(ctx.pp[v]===0&&++cc>3)return false;
      if(ctx.pp[v]===3&&++ll>3)return false;
      if(ctx.pp[v]===1)cl++;else if(ctx.pp[v]===2)lc++;
      if(cc+ll>parityCap||cl+lc>parityCap)return false;
      const h=ctx.head[v],t=ctx.tail[v];
      if((h&1)===0){if(++tp0>tensCap)return false}else if(++tp1>tensCap)return false;
      if((t&1)===0){if(++up0>4)return false}else if(++up1>4)return false;
      if(hdS[h]!==id){hdS[h]=id;hdC[h]=1;headsUsed++}else if(++hdC[h]>4)return false;
      if(tlS[t]!==id){tlS[t]=id;tlC[t]=1}else if(++tlC[t]>4)return false;
      if(touchS[h]!==id){touchS[h]=id;touchC[h]=1;touchDistinct++}
      if(touchS[t]!==id){touchS[t]=id;touchC[t]=1;touchDistinct++}
      if(ctx.x[v]&&++xo>4)return false;
      if(ctx.jp[v])jpo++;
      mask|=ctx.branchBit[v];
    }
    if(touchDistinct<4||touchDistinct>8)return false;
    const m0=count(m3C,m3S,0,id),m1=count(m3C,m3S,1,id),m2=count(m3C,m3S,2,id);
    if(m0+m1>5||m1+m2>5||m2+m0>5)return false;
    const tl=n=>count(tlC,tlS,n,id),hd=n=>count(hdC,hdS,n,id);
    if(tl(0)+tl(5)>4||tl(1)+tl(6)>4||tl(2)+tl(7)>4||tl(3)+tl(8)>4||tl(4)+tl(9)>4)return false;
    if(hd(0)+hd(5)>5||hd(1)+hd(2)>5||hd(2)+hd(3)>5||hd(3)+hd(4)>5||hd(4)+hd(5)>5)return false;
    const g1=(1<<0)|(1<<6)|(1<<3)|(1<<9),g2=(1<<4)|(1<<10)|(1<<1)|(1<<7),g3=(1<<2)|(1<<8)|(1<<5)|(1<<11);
    if((mask&g1)===g1||(mask&g2)===g2||(mask&g3)===g3)return false;
    if(ctx.blocked5.has(enc5(b,c,d,e,f))||ctx.blocked5.has(enc5(a,c,d,e,f))||ctx.blocked5.has(enc5(a,b,d,e,f))||ctx.blocked5.has(enc5(a,b,c,e,f))||ctx.blocked5.has(enc5(a,b,c,d,f))||ctx.blocked5.has(enc5(a,b,c,d,e)))return false;
    if(!ctx.xRequired||xo<1||xo>4)return false;
    if(headsUsed<3)return false;
    if(hd(2)+hd(3)<2)return false;
    if(hd(2)+hd(3)+hd(4)+(ctx.maxn===55?hd(5):0)<3)return false;
    if(hd(3)+hd(4)>4)return false;
    if(ctx.maxn===45){if(hd(3)>3||hd(4)>3||((hd(3)===3)&&(hd(4)===3)))return false;}
    else {if(hd(4)>3||hd(5)>3||((hd(4)===3)&&(hd(5)===3))||hd(4)+hd(5)>4)return false;}
    if(!ctx.jpRequired||jpo<1)return false;
    return true;
  };
}

function scanPoolOutcome(history,product,maxn,targetDate,xsmbSet,xsmbRows,draw,aiCandidates=[],numberScores=null){
  const ctx=prepareFastFilter(history,maxn,targetDate,xsmbSet,xsmbRows),hit=new Uint8Array(maxn+1);for(const v of draw.numbers)if(v<=maxn)hit[v]=1;
  const prize_counts={},examples={},m=maxn;let valid=0,winning=0,scanned=0;
  const filterOk=makeFastFilter6(ctx);

  const reductionTarget=product==='mega645'?200000:600000;
  const e6=(a,b,c,d,e,f)=>(((((a*64+b)*64+c)*64+d)*64+e)*64+f);
  const scoreAt=v=>Number(numberScores?.[v]??numberScores?.[String(v)]??0);
  let candidateCap=Math.max(1024,reductionTarget);
  let candidateKeys=new Float64Array(candidateCap);
  let candidateScores=new Float64Array(candidateCap);
  let candidateSize=0;
  function ensureCandidateCapacity(){
    if(candidateSize<candidateCap)return;
    const next=Math.max(candidateCap*2,candidateCap+65536);
    const keys=new Float64Array(next),scores=new Float64Array(next);
    keys.set(candidateKeys);scores.set(candidateScores);
    candidateKeys=keys;candidateScores=scores;candidateCap=next;
  }
  function storeReduced6(a,b,c,d,e,f){
    ensureCandidateCapacity();
    candidateKeys[candidateSize]=e6(a,b,c,d,e,f);
    candidateScores[candidateSize]=scoreAt(a)+scoreAt(b)+scoreAt(c)+scoreAt(d)+scoreAt(e)+scoreAt(f);
    candidateSize++;
  }
  const swapCandidate=(i,j)=>{const k=candidateKeys[i],s=candidateScores[i];candidateKeys[i]=candidateKeys[j];candidateScores[i]=candidateScores[j];candidateKeys[j]=k;candidateScores[j]=s;};
  const betterPair=(score,key,pivotScore,pivotKey)=>score>pivotScore||(score===pivotScore&&key<pivotKey);
  function partitionCandidates(left,right,pivotIndex){
    swapCandidate(pivotIndex,right);
    const pivotScore=candidateScores[right],pivotKey=candidateKeys[right];
    let store=left;
    for(let i=left;i<right;i++)if(betterPair(candidateScores[i],candidateKeys[i],pivotScore,pivotKey)){swapCandidate(i,store);store++}
    swapCandidate(store,right);
    return store;
  }
  function keepBest(count){
    if(count<=0||candidateSize<=count)return;
    const target=count-1;let left=0,right=candidateSize-1;
    while(left<=right){
      const pivot=partitionCandidates(left,right,(left+right)>>1);
      if(pivot===target)break;
      if(pivot>target)right=pivot-1;else left=pivot+1;
    }
  }
  const prize6=(a,b,c,d,e,f)=>{
    const mh=hit[a]+hit[b]+hit[c]+hit[d]+hit[e]+hit[f];
    if(product==='mega645')return mh===6?'Jackpot':mh===5?'Giải nhất':mh===4?'Giải nhì':mh===3?'Giải ba':null;
    if(mh===6)return 'Jackpot 1';
    if(mh===5&&draw.special!=null&&(a===draw.special||b===draw.special||c===draw.special||d===draw.special||e===draw.special||f===draw.special))return 'Jackpot 2';
    return mh===5?'Giải nhất':mh===4?'Giải nhì':mh===3?'Giải ba':null;
  };
  const check6=(a,b,c,d,e,f)=>{
    scanned++;
    if(!filterOk(a,b,c,d,e,f))return;
    valid++;storeReduced6(a,b,c,d,e,f);
    const p=prize6(a,b,c,d,e,f);
    if(p){winning++;prize_counts[p]=(prize_counts[p]||0)+1;if((examples[p]||[]).length<30)(examples[p]||(examples[p]=[])).push([a,b,c,d,e,f]);}
  };
  for(let a=1;a<=m-5;a++)for(let b=a+1;b<=m-4;b++)for(let c=b+1;c<=m-3;c++)for(let d=c+1;d<=m-2;d++)for(let e=d+1;e<=m-1;e++)for(let f=e+1;f<=m;f++)check6(a,b,c,d,e,f);

  const reducedTotal=Math.min(candidateSize,reductionTarget);keepBest(reducedTotal);
  const reducedCounts={},reducedWins=[];let reducedWinning=0;
  for(let i=0;i<reducedTotal;i++){
    let key=candidateKeys[i];
    const f=key%64;key=Math.floor(key/64);
    const e=key%64;key=Math.floor(key/64);
    const d=key%64;key=Math.floor(key/64);
    const c=key%64;key=Math.floor(key/64);
    const b=key%64;key=Math.floor(key/64);
    const a=key%64;
    const p=prize6(a,b,c,d,e,f);
    if(p){reducedWinning++;reducedCounts[p]=(reducedCounts[p]||0)+1;if(reducedWins.length<500)reducedWins.push({prize:p,numbers:[a,b,c,d,e,f]})}
  }
  reducedWins.sort((a,b)=>rankPrize(b.prize)-rankPrize(a.prize));

  const ai=summarizeTickets(product,aiCandidates,draw),remaining_counts={};for(const [k,v] of Object.entries(prize_counts))remaining_counts[k]=Math.max(0,v-(ai.prize_counts[k]||0));
  const remaining_total=Math.max(0,valid-ai.total),remaining_winning=Object.values(remaining_counts).reduce((a,b)=>a+b,0);
  return {
    target_date:targetDate,draw_id:draw.draw_id,result:draw.numbers,special:draw.special||null,scanned,
    ai,
    pool:{valid_total:valid,winning_tickets:winning,losing_tickets:Math.max(0,valid-winning),prize_counts,winning_examples:examples},
    reduced:{
      target_total:reductionTarget,total:reducedTotal,winning_tickets:reducedWinning,
      losing_tickets:Math.max(0,reducedTotal-reducedWinning),prize_counts:reducedCounts,
      wins:reducedWins,wins_preview_limit:500,
      methods:[...METHOD_NAMES]
    },
    remaining_after_ai:{total:remaining_total,winning_tickets:remaining_winning,losing_tickets:Math.max(0,remaining_total-remaining_winning),prize_counts:remaining_counts},
    filter_snapshot:{xsmb_date:xsmbBefore(xsmbRows,targetDate)?.date||null,user_rules:'user_only',system_rules:0}
  };
}

function prizeName(product,ticket,draw){const main=new Set(draw.numbers),m=ticket.filter(n=>main.has(n)).length;if(product==='mega645')return ({6:'Jackpot',5:'Giải nhất',4:'Giải nhì',3:'Giải ba'})[m]||null;if(m===6)return 'Jackpot 1';if(m===5&&ticket.includes(draw.special))return 'Jackpot 2';return ({5:'Giải nhất',4:'Giải nhì',3:'Giải ba'})[m]||null;}
function rankPrize(p){return ({'Jackpot':60,'Jackpot 1':60,'Jackpot 2':55,'Giải nhất':50,'Giải nhì':40,'Giải ba':30})[p]||0;}
function xsmbBefore(rows,targetDate){return rows.find(r=>r.date<targetDate)||null;}

function backtest60(history,product,maxn,asof,xsmbRows,nout=20){
  const H=[...history].sort((a,b)=>a.date.localeCompare(b.date)),cutoff=isoDate(addDays(asof,-60)),details=[],counts={},draws=H.filter(d=>d.date>=cutoff&&d.date<=asof);
  for(const d of draws){const idx=H.findIndex(x=>x.draw_id===d.draw_id&&x.date===d.date);if(idx<45)continue;const train=H.slice(0,idx),xrow=xsmbBefore(xsmbRows,d.date),xset=xrow?new Set(xrow.last2.filter(n=>n>=1&&n<=maxn)):new Set(),w=learnWeights(train,maxn,72),pred=generateCandidates(train,maxn,d.date,xset,nout,900,w,'bt',xsmbRows);const wins=[];for(const c of pred.candidates){const p=prizeName(product,c.numbers,d);if(p){wins.push({prize:p,numbers:c.numbers});counts[p]=(counts[p]||0)+1;}}if(wins.length){wins.sort((a,b)=>rankPrize(b.prize)-rankPrize(a.prize));details.push({date:d.date,draw_id:d.draw_id,result:d.numbers,special:d.special||null,best_prize:wins[0].prize,wins,xsmb_date:xrow?.date||null});}}
  return {days:60,mode:'walk_forward',draws_tested:draws.length,winning_draws:details.length,prize_counts:counts,details,hard_rules_applied:true,xsmb_coverage:draws.length?Number((draws.filter(d=>!!xsmbBefore(xsmbRows,d.date)).length/draws.length*100).toFixed(1)):0};
}

function nextDrawDate(product,startIso){let d=dateObj(startIso),cfg=CFG[product];for(let i=0;i<10;i++){if(cfg.jsDow.has(d.getUTCDay()))return isoDate(d);d=addDays(d,1);}return isoDate(d);}
function chooseTargetDate(product,today,history){
  const cfg=CFG[product],isDrawToday=cfg.jsDow.has(dateObj(today).getUTCDay()),latest=history.at(-1)?.date||'';
  if(isDrawToday&&latest!==today)return today;
  return nextDrawDate(product,isoDate(addDays(today,1)));
}

async function getPredLog(env,product){return (await env.DATA.get(`predlog:${product}`,'json'))||[];}
async function savePredLog(env,product,log){await env.DATA.put(`predlog:${product}`,JSON.stringify(log.slice(-100)));}
function evaluatePredLog(log,history,product){
  const byDate=new Map(history.map(d=>[d.date,d])),newly=[];
  for(const p of log){
    if(p.evaluated)continue;
    const d=byDate.get(p.target_date);if(!d)continue;
    if(!p.generated_at||Date.parse(p.generated_at)>=Date.parse(p.target_date+'T11:00:00Z')){p.evaluation_error='Prediction not saved before draw cutoff';p.evaluated=false;continue;}
    const summary=summarizeTickets(product,p.candidates||[],d);
    p.evaluated=true;p.evaluated_at=new Date().toISOString();p.draw_id=d.draw_id||null;p.result=d.numbers;p.special=d.special||null;p.wins=summary.wins;p.best_prize=summary.best_prize;p.ai_report=summary;newly.push(p);
  }
  return {log,newly};
}
function actual60(log,asof){const cutoff=isoDate(addDays(asof,-60)),rows=log.filter(x=>x.target_date>=cutoff&&x.target_date<=asof&&x.evaluated),counts={},details=[];for(const r of rows){for(const w of r.wins||[])counts[w.prize]=(counts[w.prize]||0)+1;details.push({date:r.target_date,draw_id:r.draw_id||'',result:r.result,special:r.special,best_prize:r.best_prize,wins:r.wins});}return {days:60,mode:'actual_predictions',draws_tested:rows.length,winning_draws:rows.filter(r=>r.wins?.length).length,prize_counts:counts,details,hard_rules_applied:true};}

async function updateAll(env) {
  const nowVN=vnNow(),today=isoDate(nowVN),previousState=await env.DATA.get('state','json');
  const healthAll={},histories={},changes={};
  for(const product of ['mega645','power655']){
    let hist=await bootstrap(env,product);
    const cu=await catchUpOfficial(product,hist,22);hist=cu.history;
    const cc=await crossCheckLatest(product,cu.latest);healthAll[product]=[...cu.health,...cc.health];
    if(cu.latest){const d=hist.find(x=>x.draw_id===cu.latest.draw_id&&x.date===cu.latest.date);if(d)d.sources=[...new Set([...(d.sources||[]),'vietlott',...cc.matches])];}
    await env.DATA.put(`history:${product}`,JSON.stringify(hist));histories[product]=hist;changes[product]={added:cu.added.length,latest_official:cu.latest?.date||null,secondary_matches:cc.matches};
  }

  const xb=await fetchXsmb60();healthAll.xsmb=xb.health;const xsmbRows=xb.rows;
  if(xsmbRows.length)await env.DATA.put('xsmb:200',JSON.stringify(xsmbRows));
  const storedXsmb=xsmbRows.length?xsmbRows:((await env.DATA.get('xsmb:200','json'))||[]);

  const products={};
  for(const [product,maxn] of [['mega645',45],['power655',55]]){
    const hist=histories[product];
    let log=await getPredLog(env,product);
    const ev=evaluatePredLog(log,hist,product);log=ev.log;

    // Tạo báo cáo cho kỳ gần nhất đã có kết quả nhưng chưa có báo cáo full-pool.
    // Bình thường mỗi cron chỉ phát sinh 1 kỳ mới; nếu từng bị gián đoạn, các cron sau sẽ tự lấp dần báo cáo còn thiếu.
    const pendingReport=log.filter(x=>x.evaluated&&!x.pool_report).sort((a,b)=>a.target_date.localeCompare(b.target_date)).at(-1);
    if(pendingReport){
      const draw=hist.find(d=>d.date===pendingReport.target_date);
      if(draw){
        const train=hist.filter(d=>d.date<pendingReport.target_date);
        const xrowOld=xsmbBefore(storedXsmb,pendingReport.target_date);
        const xsetOld=xrowOld?new Set(xrowOld.last2.filter(n=>n>=1&&n<=maxn)):new Set();
        pendingReport.pool_report=scanPoolOutcome(train,product,maxn,pendingReport.target_date,xsetOld,storedXsmb,draw,pendingReport.candidates||[]);
        pendingReport.report_generated_at=new Date().toISOString();
      }
    }

    // Nếu hôm nay đúng ngày quay mà kết quả chưa được lấy về thì vẫn giữ dự đoán cho hôm nay.
    // Chỉ chuyển sang kỳ kế tiếp sau khi kho đã có kết quả hôm nay.
    const target=chooseTargetDate(product,today,hist);
    const xrow=xsmbBefore(storedXsmb,target);
    const prev3=await fetchPrevious3RegionSet(target,maxn);
    healthAll[`previous3_${product}`]=prev3.health;
    const xset=new Set(prev3.numbers);

    // Tự học/điều chỉnh phương pháp chỉ phục vụ xếp hạng 200 bộ đề xuất.
    const weights=learnWeights(hist,maxn,130);
    const pred=generateCandidates(hist,maxn,target,xset,200,60000,weights,'live',storedXsmb);

    // Mỗi kỳ chỉ giữ một bộ 200 hiện hành; chạy lại sau 20h sẽ thay bản tạm bằng dữ liệu mới hơn.
    const rec={target_date:target,generated_at:new Date().toISOString(),xsmb_date:xrow?.date||null,previous_3region_date:prev3.date,previous_3region_count:prev3.numbers.length,candidates:pred.candidates,weights:pred.weights,hard_context:pred.hard_context,user_rules:'user_only',system_rules:0,evaluated:false};
    const at=log.findIndex(x=>x.target_date===target&&!x.evaluated);
    if(at>=0)log[at]=rec;else log.push(rec);

    await savePredLog(env,product,log);
    const actual=actual60(log,today),bt=previousState?.products?.[product]?.backtest60||backtest60(hist,product,maxn,today,storedXsmb,20);
    const reports=log.filter(x=>x.pool_report).slice(-30).map(x=>x.pool_report);
    products[product]={
      count:hist.length,first_date:hist[0]?.date||null,last_date:hist.at(-1)?.date||null,latest:hist.at(-1)||null,
      prediction:pred,prediction_count:pred.candidates.length,actual60,backtest60:bt,
      daily_report:reports.at(-1)||null,daily_reports:reports
    };
  }

  const state={
    schema_version:'R3_17PLUS6_200_REPORTS',
    generated_at:new Date().toISOString(),
    generated_at_vn:new Date(Date.now()+7*3600*1000).toISOString(),
    automation:{
      mode:'cloud_cron',runs_without_browser:true,
      crons_utc:['15 13 * * *','15 14 * * *','15 15 * * *'],
      crons_vn:['20:15','21:15 retry','22:15 retry'],
      update_after_20h:true,hard_rules_locked:true,user_hard_rule_count:HARD_RULES.length,system_filter_rule_count:0,
      learning_scope:'disabled_user_only_filters'
    },
    note:'Phân tích thống kê/backtest; xổ số là ngẫu nhiên và không có phương pháp nào bảo đảm trúng.',
    products,xsmb_previous:storedXsmb[0]||{date:null,last2:[],full:[]},xsmb200_count:Math.min(200,storedXsmb.length),
    source_health:healthAll,changes,hard_rules:HARD_RULES,system_filter_rules:SYSTEM_FILTER_RULES,method_names:METHOD_NAMES
  };
  await env.DATA.put('state',JSON.stringify(state));return state;
}

export { catchUpSecondary, expectedDrawDate, CFG, HARD_RULES, SYSTEM_FILTER_RULES, USER_METHOD_RULES, METHOD_NAMES, fetchText, dedupeHistory, catchUpOfficial, crossCheckLatest, fetchXsmb60, hardFilter,vietlottHeadAndLast3Gate, fiveSet, exactSet, comboKey, digitSum, digitDiff, zodiac, canIndex, chiIndex, parityPattern, doubleClass, isKepAm, xsmbJackpotSetBefore, parseSeedCsv, parseOfficial, parseSecondary, parsePrizeMeta, fetchPrizeMeta, parseXsmb60, parseAllRegionsDaily, fetch3RegionSetForDate, fetchPrevious3RegionSet, mergeXsmbRows, nextDrawDate, chooseTargetDate, prizeName, generateCandidates, methodScores, learnWeights, prepareFastFilter, fastFilterReason, makeFastFilter6, countFilteredPool, collectFilteredPool, scanFilteredOutcome, scanPoolOutcome, summarizeTickets, evaluatePredLog, actual60, backtest60, xsmbBefore };

export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(url.pathname==='/api/state'){
      const state=await env.DATA.get('state','json');
      if(state?.schema_version==='R3_17PLUS6_200_REPORTS')return json(state);
      return json({ok:false,message:'Dữ liệu R3 cần được tạo/cập nhật một lần.'},503);
    }
    if(url.pathname==='/api/bootstrap'&&request.method==='POST'){
      const state=await env.DATA.get('state','json');
      if(state?.schema_version==='R3_17PLUS6_200_REPORTS')return json(state);
      try{return json(await updateAll(env));}catch(e){return json({ok:false,error:String(e),stack:e?.stack},500);}
    }
    if(url.pathname==='/api/filter-context'){
      const product=url.searchParams.get('product');
      if(!CFG[product])return json({ok:false,error:'bad product'},400);
      const maxn=CFG[product].max;
      const hist=(await env.DATA.get(`history:${product}`,'json'))||[];
      const state=await env.DATA.get('state','json');
      if(!hist.length||!state?.products?.[product])return json({ok:false,error:'state not ready'},503);
      const target=state.products[product].prediction?.target_date||nextDrawDate(product,vnToday());
      const xsmbRows=(await env.DATA.get('xsmb:200','json'))||[];
      const xrow=xsmbBefore(xsmbRows,target);
      return json({ok:true,product,maxn,target_date:target,history:hist.map(d=>d.numbers),xsmb_date:xrow?.date||null,xsmb_numbers:(xrow?.last2||[]).filter(n=>n>=1&&n<=maxn),xsmb_jackpot_200:[...xsmbJackpotSetBefore(xsmbRows,target,maxn,200)],adaptive_rules:{enabled:false,user_only:true},hard_rules:HARD_RULES,system_filter_rules:SYSTEM_FILTER_RULES});
    }
    if(url.pathname==='/api/run'&&request.method==='POST'){
      if(!env.ADMIN_KEY||request.headers.get('x-admin-key')!==env.ADMIN_KEY)return json({ok:false,error:'unauthorized'},401);
      try{return json(await updateAll(env));}catch(e){return json({ok:false,error:String(e),stack:e?.stack},500);}
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(updateAll(env).catch(async e=>{await env.DATA.put('last_error',JSON.stringify({at:new Date().toISOString(),error:String(e),stack:e?.stack}));throw e;}));
  }
};

