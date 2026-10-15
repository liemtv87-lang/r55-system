#!/usr/bin/env python3
"""R55 football: settled real AH/OU outcomes + independent grounded xG/odds model search.
H2H is optional context, NEVER a gate. Raw settlement is not xG.
"""
import collections,datetime as dt,math,os,random,sys
from common import ROOT,VN,load,save,now,seed,pct,run_job
GRADE_FILE=os.environ.get("KQ247_R55_GRADES","/opt/kq247/research/inputs/football-grades.json")
FEATURE_FILE=os.environ.get("KQ247_R55_PREMATCH","/opt/kq247/research/inputs/verified-prematch.json")
BOOTSTRAP=int(os.environ.get("KQ247_FOOTBALL_BOOTSTRAP","2000000"))
BACKTEST_DAYS=500
def settled_rows(data):
 records=data.get("records",[]) if isinstance(data,dict) else data if isinstance(data,list) else []
 rows=[]
 for rec in records:
  p=rec.get("payload",rec) if isinstance(rec,dict) else {}
  date=p.get("day")
  for detail in p.get("detail",[]) or []:
   v=detail.get("result")
   if not (isinstance(date,str) and v in ("win","loss","push","half_win","half_loss")):continue
   if detail.get("type") not in ("AH","OU"):continue
   rows.append({"day":date,"fixture":detail.get("id"),"type":detail.get("type"),"result":v,
                "value":1 if v=="win" else 0.5 if v=="half_win" else 0})
 return rows
def poisson_cdf(k,lam):
 t=math.exp(-lam);s=t
 for i in range(1,max(0,k)+1):t*=lam/i;s+=t
 return min(1,max(0,s))
def prematch_feature_rows(v):
 if not isinstance(v,list):return []
 out=[]
 for x in v:
  if not isinstance(x,dict):continue
  # From Bongdalu prekickoff: form GF/GA, AH/OU and bookmaker odds.
  req=("kickoff","home_gf20","home_ga20","away_gf20","away_ga20",
       "ou_line","ah_line","ou_over_odds","ou_under_odds","home_ah_odds",
       "away_ah_odds","actual_home_goals","actual_away_goals")
  if not all(k in x for k in req):continue
  if not x.get("feature_cutoff_before_kickoff") or x.get("h2h_as_primary"):continue
  try:
   t={k:float(x[k]) for k in req[1:]}
   if any(not math.isfinite(v) for v in t.values()):continue
   if any(t[k]<1.001 for k in ("ou_over_odds","ou_under_odds","home_ah_odds","away_ah_odds")):continue
   if any(t[k]<0 for k in ("actual_home_goals","actual_away_goals")):continue
  except (ValueError,TypeError):continue
  out.append({**t,"kickoff":str(x["kickoff"]),
              "xg_home":float(x["xg_home"]) if x.get("verified_xg_source") and x.get("xg_home") is not None else None,
              "xg_away":float(x["xg_away"]) if x.get("verified_xg_source") and x.get("xg_away") is not None else None})
 return sorted(out,key=lambda x:x["kickoff"])
def predict_market(row,goal_w,def_w,xg_w,home_bias,ou_threshold):
 # xG only if both independently VERIFIED, not inferred from goals or H2H.
 ah=row["home_gf20"]*goal_w+row["away_ga20"]*def_w
 aa=row["away_gf20"]*goal_w+row["home_ga20"]*def_w
 if row["xg_home"] is not None and row["xg_away"] is not None:
  ah=(1-xg_w)*ah+xg_w*row["xg_home"]
  aa=(1-xg_w)*aa+xg_w*row["xg_away"]
 ah=max(.10,min(5.5,ah+home_bias));aa=max(.10,min(5.5,aa))
 halfgoal=row["ou_line"]
 p_over=1-poisson_cdf(int(math.floor(halfgoal)),ah+aa)
 value_over=p_over*row["ou_over_odds"]-1
 value_under=(1-p_over)*row["ou_under_odds"]-1
 # A calibrated OU line is directly scoreable; AH is studied separately with
 # asian quarter settlement and bookmaker prices, not a fabricated binary label.
 typ="over" if value_over>=value_under else "under"
 strength=max(value_over,value_under)
 if strength<ou_threshold:return None
 actual=row["actual_home_goals"]+row["actual_away_goals"]
 correct=(actual>halfgoal if typ=="over" else actual<halfgoal)
 draw=actual==halfgoal
 return {"correct":correct,"push":draw,"selected":typ,"expected_value":strength}
def model_grid(rows,seed_offset=0):
 if len(rows)<100:return {"status":"missing_verified_prematch_rows","rows":len(rows),"models_tested":0}
 train=rows[:-max(35,len(rows)//4)]
 hold=rows[len(train):]
 # Parameter selection only on earlier matches. The newest matches NEVER rank models.
 best=None;trials=0
 for goal_w in (.35,.45,.55,.65):
  for xg_w in (0,.25,.50,.75):
   for bias in (.05,.15,.25):
    for threshold in (.015,.03,.06):
     pars=(goal_w,1-goal_w,xg_w,bias,threshold)
     wins=n=0
     for row in train:
      p=predict_market(row,*pars)
      if p and not p["push"]:
       n+=1;wins+=int(p["correct"])
     trials+=1
     score=wins/n if n else 0
     if n>=60 and (best is None or score>best["train_rate"]):
      best={"train_rate":score,"train_sample":n,"params":pars}
 if not best:return {"status":"insufficient_nonpush_train","models_tested":trials}
 matches=[predict_market(x,*best["params"]) for x in hold]
 nonpush=[x for x in matches if x and not x["push"]]
 wins=sum(x["correct"] for x in nonpush)
 return {"status":"model_research","models_tested":trials,"prematch_rows":len(rows),
         "verified_xg_both_count":sum(x["xg_home"] is not None and x["xg_away"] is not None for x in rows),
         "train_sample":best["train_sample"],"holdout_sample":len(nonpush),
         "holdout_rate":pct(wins,len(nonpush)),"holdout_coverage":pct(len(nonpush),len(hold)),
         "param_choice_train_only":best["params"],
         "market":"OU_verified_only_until_AH_quarter_settlement_validated"}
def research(previous):
 d=load(GRADE_FILE)
 rows=settled_rows(d) if d else []
 # Exactly 500 calendar days, not 500 random bootstrap observations.
 asof=dt.datetime.now(VN).date()
 first=asof-dt.timedelta(days=BACKTEST_DAYS-1)
 all_dates=[first+dt.timedelta(days=i) for i in range(BACKTEST_DAYS)]
 grouped=collections.defaultdict(list)
 for x in rows:
  try:date=dt.date.fromisoformat(x["day"][:10])
  except (ValueError,TypeError):continue
  if first<=date<=asof:grouped[date.isoformat()].append(x)
 covered=set(grouped)
 missing=[x.isoformat() for x in all_dates if x.isoformat() not in covered]
 valid=[x for date,rs in grouped.items() for x in rs if x["result"]!="push"]
 rates={}
 for day in sorted({x["day"] for x in valid}):
  v=[x for x in valid if x["day"]==day]
  rates[day]={"matches_settled":len(v),"full_win":sum(x["value"]==1 for x in v),
              "weighted_win_rate":pct(sum(x["value"] for x in v),len(v))}
 # Monte Carlo uncertainty check on genuine graded results; each resample
 # is one computation, NOT a new independently settled match.
 sample=[x["value"] for x in valid]
 rng=random.Random(seed("FOOTBALL_RESEARCH_BOOTSTRAP",previous.get("iteration",0)))
 total=0
 if sample:
  for _ in range(BOOTSTRAP):total+=sample[rng.randrange(len(sample))]
 baseline=pct(total,BOOTSTRAP) if sample else None
 feature_rows=prematch_feature_rows(load(FEATURE_FILE))
 study=model_grid(feature_rows)
 return {"status":"research_active" if len(covered)==BACKTEST_DAYS and study.get("status")=="model_research" else "blocked_incomplete_500_day_backtest",
         "source":"verified R55 graded fixtures; prematch xG only when independently sourced",
         "backtest_window":{"days_required":BACKTEST_DAYS,"first_day":first.isoformat(),
                             "last_day":asof.isoformat(),"days_with_real_settled_fixtures":len(covered),
                             "days_missing_count":len(missing),"missing_days_sample":missing[:14],
                             "full_window_verified":len(covered)==BACKTEST_DAYS},
         "settlement_days":len(rates),"settled_fixtures":len(valid),
         "baseline":rates,"bootstrap_uncertainty_estimate":baseline,
         "bootstrap_repetitions_not_independent_games":BOOTSTRAP if sample else 0,
         "model_search":study,"evaluations":BOOTSTRAP if sample else 0,
         "iteration":int(previous.get("iteration",0))+1,
         "metrics":{"month_70_percent_verified":False,"promotable":False,
                    "500_calendar_day_input_ready":len(covered)==BACKTEST_DAYS,
                    "verified_prematch_rows":len(feature_rows)},
         "target":{"win_rate":70,"market_coverage_minimum":80,
                   "xg_verified_when_available":True,"h2h_primary":False},
         "promotion_blocker":f"Needs {len(missing)} additional calendar dates of authentic Bongdalu settled matches plus timestamped prekickoff full features. H2H optional. Monte Carlo repeats are not historical dates."
def test():
 a=[{"payload":{"day":"2026-10-10","detail":[{"id":"x","type":"AH","result":"win"},{"id":"y","type":"OU","result":"push"}]}}]
 assert len(settled_rows({"records":a}))==2
 assert abs(poisson_cdf(0,1)-math.exp(-1))<1e-8
 assert prematch_feature_rows([{"kickoff":"x","home_gf20":1}])==[]
 assert BACKTEST_DAYS==500 and len([dt.date(2026,10,15)-dt.timedelta(days=x) for x in range(BACKTEST_DAYS)])==500
 print("KQ247_FOOTBALL_SELFTEST=PASS")
if __name__=="__main__":
 if "--self-test" in sys.argv:test()
 else:sys.exit(run_job("football",research))
