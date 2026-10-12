import {db,scheduler} from "hatchable";
export const access="scheduler";
export const schedule="0 */4 * * *";
export default async function(req,res) {
 const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()-(12*3600000+5*60000)));
 const {rows}=await db.query("SELECT source,locked_at FROM football_snapshots WHERE day=$1::date",[day]);
 const locked=rows.some(x=>x.source==="bongdalu-r55");
 const hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
 const missingAfterNoon=!locked&&hour>=14;
 let recovered=false;
 if(missingAfterNoon){
  const scope="r55_missing_lock_"+day;
  await db.query("INSERT INTO football_compact_stats(scope,payload,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(scope) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()",[scope,JSON.stringify({day,checkedAt:new Date().toISOString(),status:"verified_bongdalu_snapshot_missing"})]);
  // Last guarded recovery attempt after failed noon/13:00/14:00 runs.
  if(hour===15){
   try{
    await scheduler.at(new Date(Date.now()+60000),"/api/jobs/noon-lock",{name:"r55-emergency-lock-"+day,payload:{day}});
    recovered=true;
   }catch{}
  }
 }
 return res.status(missingAfterNoon?503:200).json({ok:!missingAfterNoon,date:day,locked,legacySnapshotPresent:rows.some(x=>x.source!=="bongdalu-r55"),missingFeed:!locked,emergencyRetryQueued:recovered,note:"Only genuine locked Bongdalu snapshots are counted; never backfill fabricated matches."});
}