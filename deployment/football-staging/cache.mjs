// Deliberately retired: the former service polled Neon every five minutes.
// No network access, live prediction fallback, or customer data access is permitted.
// Keep this small tombstone only so accidentally started historical containers fail closed.
import http from 'node:http';
http.createServer((req,res)=>{
  res.writeHead(410,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify({ok:false,retired:true,error:'legacy_football_cache_retired'}));
}).listen(3000,'0.0.0.0');
