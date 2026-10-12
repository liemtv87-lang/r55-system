import {db} from "hatchable";
import {AutoBrain} from "lib/r55Original/worker.js";
// Runtime adapter only: retain the unchanged AutoBrain prediction algorithms.
// Hatchable rate-limits db.query, so use one read and one atomic write per original operation.
// Original calls within an isolate remain serialized.
let pending=Promise.resolve(),activeSession=null;
async function flush(updates,removals=[]){
 if(!updates.length&&!removals.length)return;
 const data=JSON.stringify(updates.map(([key,payload])=>({key,payload})));
 const removed=removals.filter(k=>!updates.some(x=>x[0]===k));
 await db.query(
  "WITH ins AS (INSERT INTO football_r55_native_state(key,payload) "+
  "SELECT v->>'key',v->'payload' FROM jsonb_array_elements($1::jsonb) v "+
  "ON CONFLICT(key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now() RETURNING key),"+
  "del AS (DELETE FROM football_r55_native_state WHERE key=ANY($2::text[]) RETURNING key) "+
  "SELECT (SELECT count(*) FROM ins)::int written,(SELECT count(*) FROM del)::int deleted",
  [data,removed]
 );
}
export function withOriginalBrain(fn){
 const job=async()=>{
  // One database read, regardless of how many original R55 .get() calls follow.
  const old=await db.query("SELECT key,payload FROM football_r55_native_state");
  const session={base:new Map(old.rows.map(r=>[String(r.key),r.payload])),
   updates:new Map(),removed:new Set()};
  activeSession=session;
  try{
   const result=await fn();
   await flush([...session.updates.entries()],[...session.removed]);
   return result;
  }finally{activeSession=null}
 };
 const current=pending.then(job,job);
 pending=current.then(()=>undefined,()=>undefined);
 return current;
}
async function readOne(key){
 const s=activeSession,k=String(key);
 if(s){
  if(s.removed.has(k))return undefined;
  if(s.updates.has(k))return s.updates.get(k);
  return s.base.get(k);
 }
 const r=await db.query("SELECT payload FROM football_r55_native_state WHERE key=$1",[k]);
 return r.rows.length?r.rows[0].payload:undefined;
}
async function writeSome(items){
 const pairs=Array.isArray(items)?items:[];
 if(activeSession){
  for(const [k,v] of pairs){const key=String(k);activeSession.updates.set(key,v);activeSession.removed.delete(key)}
 }else await flush(pairs);
}
async function deleteSome(keys){
 const items=(Array.isArray(keys)?keys:[keys]).map(String);
 if(activeSession){
  for(const key of items){activeSession.updates.delete(key);activeSession.removed.add(key)}
 }else await flush([],items);
}
const asEntries=(key,value)=>key&&typeof key==="object"&&!Array.isArray(key)
 ?Object.entries(key):[[String(key),value]];
function storage(){
 return {
  get(key){return readOne(key)},
  put(key,value){return writeSome(asEntries(key,value))},
  delete(keys){return deleteSome(keys)},
  async transaction(fn){
   // Stage the callback's changes locally, then merge into the same session.
   const updated=new Map(),removed=new Set();
   const tx={
    async get(key){const k=String(key);return updated.has(k)?updated.get(k):removed.has(k)?undefined:readOne(k)},
    async put(key,value){for(const [k,v] of asEntries(key,value)){const id=String(k);updated.set(id,v);removed.delete(id)}},
    async delete(keys){for(const k of (Array.isArray(keys)?keys:[keys]).map(String)){updated.delete(k);removed.add(k)}}
   };
   const result=await fn(tx);
   await writeSome([...updated.entries()]);
   await deleteSome([...removed]);
   return result;
  },
  setAlarm(ms){return writeSome([["__next_alarm__",Number(ms)]])}
 };
}
export function createOriginalBrain(){
 return new AutoBrain({storage:storage()}, {});
}
export async function getOriginalStateStatus(){
 const r=await db.query("SELECT key,pg_column_size(payload)::int bytes,updated_at FROM football_r55_native_state ORDER BY key");
 return {entries:r.rows.length,keys:r.rows.map(x=>({key:x.key,bytes:x.bytes,updatedAt:x.updated_at}))};
}