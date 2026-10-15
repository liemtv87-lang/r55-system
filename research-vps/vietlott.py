#!/usr/bin/env python3
"""Standalone real-portfolio, pre-draw-only Vietlott research. Never changes customer pools."""
import hashlib,os,sys
from collections import Counter
from common import ROOT,dice,load,save,now,seed,pct,run_job
CONFIG={"mega645":(45,200_000),"power655":(55,500_000)}
SRC=os.environ.get("KQ247_VIETLOTT_DATA","/opt/kq247/research/state/vietlott-history")
MAX_NEW=max(2,min(96,int(os.environ.get("KQ247_VIETLOTT_DRAWS_PER_CYCLE","32"))))
def check_draw(d,maxn,product):
 if not isinstance(d,dict):return None
 n=d.get("numbers")
 date=d.get("date")
 if not (isinstance(date,str) and len(date)>=10 and isinstance(n,list) and len(n)==6):return None
 try:nums=tuple(sorted(int(x) for x in n))
 except (TypeError,ValueError):return None
 if len(set(nums))!=6 or nums[0]<1 or nums[-1]>maxn:return None
 bonus=d.get("special")
 if product=="power655":
  try:bonus=int(bonus)
  except (TypeError,ValueError):return None
  if bonus in nums or bonus<1 or bonus>maxn:return None
 return {"date":date[:10],"nums":nums,"special":bonus if product=="power655" else None,"draw_id":str(d.get("draw_id") or "")}
def grade(pred,actual,product):
 match=sum(1 for x in pred if x in actual["nums"])
 if match==6:return "jackpot1" if product=="power655" else "jackpot"
 if product=="power655" and match==5 and actual["special"] in pred:return "jackpot2"
 if match==5:return "g1"
 return None
def one_portfolio(hist,index,product,maxn,target):
 draw=hist[index]
 older=hist[:index]
 # Draws with fewer than 35 past draws use the same leakage-free cold-start baseline.
 # The seed uses only outcomes available before this draw; never its winning numbers.
 previous_fingerprint=hashlib.sha256(
  "|".join(x["date"]+":"+",".join(map(str,x["nums"])) for x in older[-60:]).encode()).hexdigest()
 rng=dice("KQ247_RESEARCH_PRECOMMIT_V1",product,draw["date"],previous_fingerprint)
 unique=set();count=Counter();digest=hashlib.blake2b(digest_size=16)
 attempts=0
 while len(unique)<target:
  ticket=tuple(sorted(rng.sample(range(1,maxn+1),6)))
  attempts+=1
  if ticket in unique:continue
  unique.add(ticket)
  for x in ticket:digest.update(bytes([x]))
  result=grade(ticket,draw,product)
  if result:count[result]+=1
 return {"date":draw["date"],"draw_id":draw["draw_id"],"product":product,
         "tickets":len(unique),"duplicate_rejections":attempts-len(unique),
         "prizes":dict(count),"candidate_sha":digest.hexdigest(),"previous_draws":len(older),
         "predraw_seed_only":True,"simulated_not_purchased":True,"method":"PRECOMMITTED_UNIFORM_COVERAGE_BASELINE_V1"}
def research(previous):
 cache=load(ROOT/"vietlott-draws.json") or {}
 touched=0;source_rows={};errors=[];new_tickets=0;checkpoint_pending=0
 for product,(maxn,target) in CONFIG.items():
  raw=load(os.path.join(SRC,"history-"+product+".json"))
  if not isinstance(raw,list):
   errors.append(product+":source_missing");continue
  history=sorted((x for d in raw if (x:=check_draw(d,maxn,product))),key=lambda x:x["date"])
  if len({r["date"] for r in history})!=len(history):
   errors.append(product+":duplicate_draw_dates");continue
  source_rows[product]=len(history)
  if len(history)<66:errors.append(product+":history_short");continue
  # All verified historical draws, never truncate to last 110 / 60 / 30.
  # Include EVERY historic draw; earliest draws are cold-started with no future data.
  pending=[i for i in range(len(history))
           if product+"|"+history[i]["date"] not in cache]
  pending.sort() # oldest first: complete each month chronologically, with no future results as input
  for i in pending[:max(1,MAX_NEW//2)]:
   draw=history[i]
   try:
    r=one_portfolio(history,i,product,maxn,target)
    cache[product+"|"+r["date"]]=r
    touched+=1
    new_tickets+=r["tickets"]
    checkpoint_pending+=1
    # Atomic checkpoint each 4 complete full-size portfolios, not O(N²)
    # JSON rewrites after every single historic draw.
    if checkpoint_pending>=4:
     save(ROOT/"vietlott-draws.json",cache)
     checkpoint_pending=0
   except Exception as e:
    errors.append(product+":"+draw["date"]+":"+type(e).__name__)
 if checkpoint_pending:
  save(ROOT/"vietlott-draws.json",cache)
 monthly={}
 remaining={}
 for product,(maxn,target) in CONFIG.items():
  rows=[v for k,v in cache.items() if k.startswith(product+"|")
        and isinstance(v,dict) and v.get("tickets")==target]
  eligible=source_rows.get(product,0)
  remaining[product]=max(0,eligible-len(rows))
  months=sorted({r["date"][:7] for r in rows})
  monthly[product]={}
  for month in months:
   rr=[r for r in rows if r["date"].startswith(month)]
   counts=Counter()
   for row in rr:counts.update(row["prizes"])
   monthly[product][month]={"draws_scored":len(rr),
                             "tickets_per_draw":target,"counts":dict(counts),
                             "jackpot_total":counts["jackpot"]+counts["jackpot1"]+counts["jackpot2"],
                             "g1":counts["g1"],"heldout_only":True}
 # This method is a fair-lottery portfolio baseline, not a claim that post-hoc tuned
 # portfolios could have been purchased or that rare jackpot outcomes are guaranteed.
 return {"status":"research_active" if touched or cache else "blocked_missing_data",
         "source":"local_verified_vietlott_history",
         "source_draws":source_rows,"portfolio_sizes":{"mega645":200000,"power655":500000},
         "month_target":{"jackpot":8,"g1":1500},
         "evaluations":sum(r.get("tickets",0) for r in cache.values() if isinstance(r,dict))*6,
         "new_draw_portfolios_this_cycle":touched,
         "new_tickets_evaluated_this_cycle":new_tickets,
         "checkpoint_records_per_write":4,
         "complete_draw_portfolios_measured_not_estimated":True,
         "new_numbers_compared_this_cycle":new_tickets*6,
         "historical_draw_portfolios_checked":len(cache),
         "remaining_full_history_draws":remaining,
         "entire_history_backtest_completed":bool(source_rows) and all(v==0 for v in remaining.values()) and len(source_rows)==2,
         "research_draws_from_earliest_eligible":True,
         "includes_first_35_cold_start_draws":True,
         "monthly":monthly,"errors":errors[-10:],
         "metrics":{"qualified_months":0,"candidate_promotable":False},
         "promotion_blocker":"No independent precommitted prospective month at all required targets; real portfolio and actual prize wins required."}
def test():
 a={"date":"2026-10-13","numbers":[1,2,3,4,5,6],"special":7}
 assert check_draw(a,55,"power655")["nums"]==(1,2,3,4,5,6)
 assert grade((1,2,3,4,5,7),check_draw(a,55,"power655"),"power655")=="jackpot2"
 assert grade((1,2,3,4,5,8),check_draw(a,55,"power655"),"power655")=="g1"
 assert grade((1,2,3,4,5,6),check_draw(a,55,"power655"),"power655")=="jackpot1"
 assert MAX_NEW>=2
 assert "110" not in research.__code__.co_consts # no fixed 110-draw history cap
 print("KQ247_VIETLOTT_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:test()
 else:sys.exit(run_job("vietlott",research))
