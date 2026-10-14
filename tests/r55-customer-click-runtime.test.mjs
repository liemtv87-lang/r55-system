import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
const html=readFileSync(new URL('../deployment/football-original/public/client.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const code=scripts.at(-1)?.[2];
assert.ok(code?.includes('async function fetchMode'));

const makePage=()=>{
 const requested=[],copied=[],store=new Map(),elements=new Map();
 const get=id=>{
  if(!elements.has(id)){
   const values=new Set();
   elements.set(id,{id,value:'',textContent:'',innerHTML:'',style:{},disabled:false,
    classList:{add:v=>values.add(v),contains:v=>values.has(v),
      toggle:(v,state)=>{if(state??!values.has(v))values.add(v);else values.delete(v)}},
    addEventListener(){}});
  }
  return elements.get(id);
 };
 const now=Date.now(),operational=new Date(now+7*3600000-(12*60+5)*60000).toISOString().slice(0,10);
 const all=[
  {id:'BDL_1111111',home:'Major Home',away:'Major Away',league:'UEFA Champions League',country:'Europe',
   ts:now+3600000,top:true,ah:{pick:'CHỦ',line:-.5,price:1.91},ah_release:true,bookmaker_count:4,learning_methods:['r55']},
  {id:'BDL_2222222',home:'Small Home',away:'Small Away',league:'Local Division',country:'Vietnam',
   ts:now+7200000,top:false,ou:{pick:'TÀI',line:2.5,price:2.19},ou_release:true,bookmaker_count:1,learning_methods:['r55']},
  {id:'BDL_3333333',home:'Another Home',away:'Another Away',league:'Local Division',country:'Vietnam',
   ts:now+10800000,top:false,ah:{pick:'KHÁCH',line:.25,price:1.82},ah_release:true,bookmaker_count:2,learning_methods:['r55']}
 ];
 const location={href:'https://64-120-92-172.sslip.io/client.html',pathname:'/client.html',search:'',hash:'',
   replace(){throw Error('unexpected_link_redirect')}};
 const fetch=async input=>{
  const value=String(input),url=new URL(value,location.href);
  if(url.hostname.includes('neon.tech')){
   if(url.searchParams.get('action')==='latest-link')
    return {ok:true,status:200,json:async()=>({ok:false})};
   return {ok:true,status:200,json:async()=>({ok:false,reason:'invalid_code'})};
  }
  assert.equal(url.pathname,'/api/main-football');
  assert.equal(url.searchParams.get('data'),'1','customer must share MAIN source');
  const mode=url.searchParams.get('mode'),limit=Number(url.searchParams.get('limit'));
  const selected=(mode==='featured'?all.filter(x=>x.top):all).slice(0,limit);
  requested.push({mode,limit,raw:value,count:selected.length});
  return {ok:true,status:200,headers:{get:()=> 'application/json'},
   json:async()=>({ok:true,found:true,locked:true,provisional:false,date:operational,model:'R55 main locked',
    updated_at:new Date().toISOString(),predictions:selected,total:selected.length,
    daily_stats:[],method_performance:[]})};
 };
 const document={getElementById:get,body:{appendChild(){}},visibilityState:'hidden',addEventListener(){},
  createElement(){return {value:'',select(){},remove(){}}},execCommand(){return true}};
 const navigator={userAgent:'R55 test browser',language:'vi-VN',clipboard:{writeText:async value=>copied.push(value)}};
 const context=createContext({document,navigator,screen:{width:360,height:800},fetch,location,history:{replaceState(){}},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},crypto:{randomUUID,subtle:{
    digest:async(algorithm,data)=>createHash('sha256').update(data).digest()}},
  TextEncoder,TextDecoder,Uint8Array,AbortController,AbortSignal,setTimeout,clearTimeout,setInterval:()=>0,
  window:{},atob,btoa,URL,Date,Intl,Math,Number,String,JSON,console});
 runInContext(code,context);
 return {ctx:context,get,requested,copied,store,all};
};

test('client 20, 30, all and big-match controls read exactly same main endpoint',async()=>{
 const x=makePage();
 for(const [call,limit,mode,count] of [['load(20)',20,'all',3],['load(30)',30,'all',3],
  ['load(5000)',5000,'all',3],['loadFeatured()',5000,'featured',1]]){
  await runInContext(call,x.ctx);
  assert.equal(x.requested.at(-1).limit,limit);
  assert.equal(x.requested.at(-1).mode,mode);
  assert.ok(x.get('summary').innerHTML.includes(count+' trận'));
  assert.equal((x.get('list').innerHTML.match(/class="fixture"/g)||[]).length,count);
 }
 await runInContext('refreshCurrent()',x.ctx);
 assert.equal(x.requested.at(-1).mode,'featured','refresh must preserve current filter');
 x.get('q').value='Major Home';runInContext('render()',x.ctx);
 assert.equal((x.get('list').innerHTML.match(/class="fixture"/g)||[]).length,1);
});
test('client COPY 20/30/all/major, single match and collapse controls work without credentials',async()=>{
 const x=makePage();
 for(const [mode,cap,count] of [['all',20,3],['all',30,3],['all',5000,3],['featured',5000,1]]){
  await runInContext(`copyMode(${cap},'${mode}','COPY')`,x.ctx);
  const pasted=x.copied.at(-1);
  assert.equal((pasted.match(/KÈO SÁNG NHẤT:/g)||[]).length,count);
  assert.ok(x.get('summary').textContent.startsWith('✅'));
 }
 await runInContext('load(20)',x.ctx);
 await runInContext('copyMatch(1)',x.ctx);
 assert.ok(x.copied.at(-1).includes('Small Home - Small Away'));
 assert.ok(x.get('summary').textContent.includes('Đã copy trận Small Home'));
 runInContext('toggleCollapse()',x.ctx);
 assert.ok(x.get('app').classList.contains('collapsed'));
 runInContext('toggleCollapse()',x.ctx);
 assert.ok(!x.get('app').classList.contains('collapsed'));
 await runInContext('copyBuy()',x.ctx);
 assert.ok(x.copied.at(-1).startsWith('https://t.me/muatool_du_doan_bot'));
});
test('customer activation button preserves stored device code on rejected activation',async()=>{
 const x=makePage();x.get('code').value='INVALID';
 x.store.set('kq247_football_code','PREVIOUS_ACTIVE_CODE_HASH');
 await runInContext('activate()',x.ctx);
 assert.equal(x.store.get('kq247_football_code'),'PREVIOUS_ACTIVE_CODE_HASH');
 assert.equal(x.get('activateButton').disabled,false);
 assert.equal(x.get('activateButton').textContent,'KÍCH HOẠT');
 assert.ok(x.get('msg').textContent.includes('Mã không hợp lệ'));
});
