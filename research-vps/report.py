#!/usr/bin/env python3
"""Hourly local research rollups; 4-hour public report cadence. Never spam Telegram."""
import datetime as dt,json,os,pathlib,sys
from common import ROOT,load,save,now
DOMAINS=("football","xs","vietlott")
def compile_report():
 jobs={}
 for domain in DOMAINS:
  p=ROOT/(domain+".json")
  data=load(p) or {}
  timestamp=data.get("finished_at_utc")
  try:age=int((dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(timestamp)).total_seconds()/60)
  except (TypeError,ValueError):age=None
  jobs[domain]={"status":data.get("status","not_started"),"last_finish_utc":timestamp,
                 "age_minutes":age,"healthy":age is not None and age<=25 and data.get("status")!="error",
                 "evaluations_reported":data.get("evaluations",0),
                 "current_iteration":data.get("iteration"),
                 "metrics":data.get("metrics",{}),
                 "promotion_blocker":data.get("promotion_blocker"),
                 "error":(load(ROOT/(domain+".error.json")) or {}).get("error")}
 report={"updated_at_utc":now(),"report_interval":"hourly_local_report",
         "notification_interval":"four_hours_only","no_guaranteed_accuracy":True,
         "domains":jobs,"all_three_healthy":all(j["healthy"] for j in jobs.values()),
         "auto_install_eligible":False,
         "targets":{"football_win_rate":70,"xs_3lo_monthly":75,"xs_de50_monthly":75,
                    "xs_de60_monthly":75,"xs_de75_monthly":90,"xs_3c_monthly":90,
                    "mega_pool":200000,"power_pool":500000,"vietlott_monthly_jp":8,
                    "vietlott_monthly_g1":1500},
         "promotion_policy":"Require complete verified prospective pre-locked holdout + production parity + reversible approved adapter. No promoting on backtest-only or bootstraps."}
 save(ROOT/"hourly.json",report)
 return report
if __name__=="__main__":
 r=compile_report()
 if "--four-hour" in sys.argv:
  r["report_interval"]="four_hour_user_report"
  save(ROOT/"four_hour_latest.json",r)
  with (ROOT/"four_hour_history.jsonl").open("a",encoding="utf-8") as f:f.write(json.dumps(r,ensure_ascii=False)+"\n")
 print("KQ247_RESEARCH_ROLLUP="+json.dumps(r,ensure_ascii=False),flush=True)
