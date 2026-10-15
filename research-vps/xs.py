#!/usr/bin/env python3
"""Three-lo, de 50/60/75 and 3-cang walk-forward research per genuine station."""
import collections,hashlib,os,pathlib,sys
from common import ROOT,load,save,seed,pct,run_job
PATH=os.environ.get("KQ247_XS_HISTORY","/opt/kq247/lottery-daily-staging/xsmb-505-actual-through-20261014.json")
TRIALS=max(8,min(2000,int(os.environ.get("KQ247_XS_TRIALS","256"))))
TARGETS={"lo3":75.0,"de50":75.0,"de60":75.0,"de75":90.0,"three_cang":90.0}
def unwrap(data):
 if isinstance(data,list):return data
 if not isinstance(data,dict):return []
 for k in ("draws","records","history","actual_draws","data","items"):
  if isinstance(data.get(k),list):return data[k]
 return []
def flatten_prizes(v):
 if isinstance(v,list):
  out=[]
  for z in v:
   if isinstance(z,(list,dict)):out+=flatten_prizes(z)
   elif isinstance(z,(str,int)) and str(z).strip().isdigit():out.append(str(z).strip())
  return out
 if isinstance(v,dict):
  out=[]
  # Prefer prize order where encoded keys are available.
  for val in v.values():out+=flatten_prizes(val)
  return out
 return []
def normalize(d):
 if not isinstance(d,dict):return None
 date=d.get("draw_date") or d.get("date") or d.get("drawDate") or d.get("ngay")
 if not isinstance(date,str) or len(date)<10:return None
 station=str(d.get("station") or d.get("province") or d.get("dai") or "xsmb").lower()
 raw=None
 for k in ("full_results","all_prizes","prizes","prize_results","all27","results"):
  if isinstance(d.get(k),(list,dict)):
   v=flatten_prizes(d[k])
   if len(v)==27:raw=v;break
 if raw is None:return None
 if any(len(x)<2 or len(x)>6 for x in raw):return None
 special=str(d.get("special") or d.get("giai_db") or d.get("db") or raw[0])
 if not special.isdigit() or len(special)<3:return None
 # True winning values come from this observed full draw, never from predictions.
 return {"date":date[:10],"station":station,"full_results":raw,
         "endings":set(x[-2:].zfill(2) for x in raw),"special":special}
def nums_from_prev(p):
 digits=[int(z) for x in p["full_results"] for z in x]
 if len(digits)<70:raise ValueError("incomplete all-position source")
 return digits
def forecast(history,i,method,full=False):
 prev=history[i-1]
 digits=nums_from_prev(prev);size=len(digits)
 a,b,c,d=[(method*mul+shift)%size for mul,shift in ((7,3),(17,5),(29,11),(41,19))]
 target=history[i]["date"]
 # All selected input positions are from the exact previous draw.
 scores=[]
 for n in range(100):
  u,v=divmod(n,10)
  z=(digits[(a+n)%size]*11+digits[(b+3*n)%size]*7+
     digits[(c+n//3)%size]*5+digits[(d+u+v)%size]*3+
     ((u+digits[a])%10)*17+((v+digits[b])%10)*13+
     ((u*v+method)%10)*19+
     ((method*31+n*17)%97))
  scores.append((z,n))
 scores.sort(reverse=True)
 excluded=set()
 if i>=3:excluded=history[i-1]["endings"] & history[i-2]["endings"]
 recent=set().union(*(x["endings"] for x in history[max(0,i-10):i]))
 # Exclude >=10-draw gan and consecutive two-draw numbers for lo, including double lotto.
 lo=[n for _,n in scores if str(n).zfill(2) in recent and str(n).zfill(2) not in excluded][:3]
 if len(lo)<3:return None
 banned_head=(method+digits[c]+digits[d])%10
 de=[n for _,n in scores if n//10!=banned_head][:75]
 if len(de)<75:return None
 result={"lo3":set(lo),"de50":set(de[:50]),"de60":set(de[:60]),"de75":set(de)}
 if full:
  # Three-digit candidates must ALL end in a member of the 75-ending list.
  triples=[]
  for n in de:
   for hundred in range(10):
    candidate=100*hundred+n
    z=(scores[n][0] if n<len(scores) else n)+digits[(hundred*7+n+method)%size]*11+((hundred+method)%10)*17
    triples.append((z,candidate))
  triples.sort(reverse=True)
  result["three_cang"]=set(n for _,n in triples[:500])
 return result
def hit(p,actual):
 return {"lo3":bool(p["lo3"] & {int(x) for x in actual["endings"]}),
         "de50":int(actual["special"][-2:]) in p["de50"],
         "de60":int(actual["special"][-2:]) in p["de60"],
         "de75":int(actual["special"][-2:]) in p["de75"],
         "three_cang":int(actual["special"][-3:]) in p["three_cang"]}
def study(history,previous):
 n=len(history)
 if n<110:return {"status":"blocked_insufficient_full_prizes","source_valid_draws":n,
                    "evaluations":0,"metrics":{},"promotion_blocker":"At least 110 complete station draws required"}
 # No model selection uses outcomes in the final 60-draw holdout.
 cut=n-60
 iteration=int(previous.get("iteration",0))
 winner=None
 total_eval=0
 for method in range(iteration*TRIALS,(iteration+1)*TRIALS):
  count=0;trials=0
  for i in range(11,cut):
   p=forecast(history,i,method)
   total_eval+=100
   if p:
    count+=bool(p["lo3"] & {int(x) for x in history[i]["endings"]})
    trials+=1
  if trials>=60:
   score=count/trials
   if winner is None or score>winner[0]:winner=(score,method,trials)
 if winner is None:return {"status":"blocked_train","evaluations":total_eval,"metrics":{}}
 method=winner[1]
 rows=[]
 for i in range(cut,n):
  p=forecast(history,i,method,full=True)
  if not p:continue
  rows.append({"date":history[i]["date"],"hits":hit(p,history[i])})
  total_eval+=850
 monthly={}
 for month in sorted(set(x["date"][:7] for x in rows)):
  selected=[x for x in rows if x["date"].startswith(month)]
  counts={k:sum(bool(x["hits"][k]) for x in selected) for k in TARGETS}
  monthly[month]={"days":len(selected),"wins":counts,"rates":{k:pct(v,len(selected)) for k,v in counts.items()},
                  "gates":{k:len(selected)>=26 and pct(v,len(selected))>=TARGETS[k] for k,v in counts.items()}}
 complete=[x for x in monthly.values() if x["days"]>=26]
 met=bool(complete and all(all(x["gates"].values()) for x in complete))
 return {"status":"research_active","iteration":iteration+1,"source_valid_draws":n,
         "source_first_date":history[0]["date"],"source_last_date":history[-1]["date"],
         "evaluations":total_eval,"method_trials_this_cycle":TRIALS,
         "training_days":cut,"heldout_days":len(rows),
         "train_selected_method":method,"train_lo3_rate":round(winner[0]*100,2),
         "targets":TARGETS,"monthly":monthly,
         "metrics":{"all_complete_heldout_months_pass":met,"promotable":False},
         "promotion_blocker":"Require independent prospective month(s) from prelocked daily snapshots; reselecting training models cannot count as future-month success."}
def research(previous):
 raw=load(PATH)
 rows=unwrap(raw)
 hist=[x for d in rows if (x:=normalize(d))]
 grouped=collections.defaultdict(list)
 for x in hist:grouped[x["station"]].append(x)
 findings={}
 for station,items in grouped.items():
  if station not in ("xsmb","mb","mienbac","mien-bac"):continue
  ordered=sorted({x["date"]:x for x in items}.values(),key=lambda x:x["date"])
  findings[station]=study(ordered,previous)
 total=sum(x.get("evaluations",0) for x in findings.values())
 return {"status":"research_active" if findings else "blocked_missing_genuine_full27_history",
         "source":PATH,"stations_detected":{k:len(v) for k,v in grouped.items()},
         "station_results":findings,"evaluations":total,
         "iteration":int(previous.get("iteration",0))+1,
         "metrics":{"complete_months_passed":0,"promotable":False},
         "promotion_blocker":"No complete independent prospective month and validated all-station 27/18-prize history; production XS unchanged."}
def test():
 ds=[{"date":"2026-09-"+str(i).zfill(2),"full_results":[str(j+1000) for j in range(27)],"special":"12345"} for i in range(1,4)]
 assert normalize(ds[0]) is not None
 assert normalize({"date":"2026-01-01","full_results":["12"],"special":"123"}) is None
 assert len(normalize(ds[0])["endings"])<=27
 print("KQ247_XS_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:test()
 else:sys.exit(run_job("xs",research))
