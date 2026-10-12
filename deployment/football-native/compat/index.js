import pg from 'pg';
const {Pool}=pg;
let pool;
function connection(){
  if(!pool){
    if(!process.env.DATABASE_URL)throw Error('R55_DATABASE_URL_MISSING');
    pool=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
  }
  return pool;
}
export const db={query:(statement,params=[])=>connection().query(statement,params)};
export const config={get:async(name)=>process.env[name]||null};
export const scheduler={
  // Native worker drives chunks synchronously and retries from committed cursors.
  at:async(when,path,details)=>({id:'in_process_chunk_recovery',at:new Date(when).toISOString(),path})
};
export async function closePool(){if(pool)await pool.end();}
