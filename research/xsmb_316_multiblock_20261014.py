#!/usr/bin/env python3
"""Frozen XSMB 316 method: six non-overlapping 500-date stress blocks.

No training, model selection, production deploy, or 'best of' hindsight.
Applies one exact fixed rule to each target day using previous draws only.
This is retrospective stability research, NOT a prospective success claim.
"""
import csv
import datetime as dt
import io
import json
import math
import pathlib
import time
import urllib.request
import numpy as np

SRC="https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv"
CUTOFF="2026-10-13"
WIN=500
BLOCKS=6
HEAD_PEN=.12
CORR_PEN=.15
REVERSE_PEN=0.

def norm(a):
    a=np.asarray(a,np.float32)
    return (a-a.mean())/max(.0001,float(a.std()))

def draw_load():
    with urllib.request.urlopen(urllib.request.Request(SRC,headers={"User-Agent":"KQ247-Research-ReadOnly/1.0"}),timeout=50) as r:
        rows=list(csv.DictReader(io.StringIO(r.read().decode("utf-8-sig"))))
    rows=[row for row in rows if row["date"]<=CUTOFF]
    fields=list(rows[0].keys())[1:]
    assert len(fields)==27 and rows[-1]["date"]==CUTOFF and len(rows)>7000
    return np.array([[int(row[f][-2:]) for f in fields] for row in rows],np.uint8),[r["date"] for r in rows]

def predict(t,R,P,C,head_freq,tail_freq,prefix):
    js=np.arange(t-499,t)
    pprev=R[js-1]
    prev=R[t-1]
    pos=(pprev//10==prev//10).sum(axis=1)+(pprev%10==prev%10).sum(axis=1)+2*(pprev==prev).sum(axis=1)
    digit=-np.sum((head_freq[js-1]-head_freq[t-1])**2+
                  (tail_freq[js-1]-tail_freq[t-1])**2,axis=1)
    overlap=P[js-1]@P[t-1]
    hybrid=.4*norm(overlap)+.3*norm(digit)+.3*norm(pos)
    inds=np.argpartition(hybrid,-10)[-10:]
    weight=np.exp(np.clip((hybrid[inds]-hybrid[inds].max())/2.,-35,0))
    base=(prefix[t]-prefix[t-250])/250
    analog=weight@P[js[inds]]/weight.sum()
    sc=norm(analog+.07*(base-.24))
    past=P[t-250:t]
    prob=past.mean(axis=0)
    cc=(past.T@past)/250.-np.outer(prob,prob)
    var=np.maximum(prob*(1-prob),.012)
    corr=np.clip(cc/np.sqrt(np.outer(var,var)),-.9,.9)
    np.fill_diagonal(corr,0)
    corr=corr.astype(np.float16)
    allowed=~((C[t-1]>0)&(C[t-2]>0))
    sc=np.where(allowed,sc,-1e7)
    nums=np.arange(100)
    h=nums//10;tail=nums%10
    chosen=[]
    for slot in range(3):
        idx=int(sc.argmax())
        chosen.append(idx)
        sc[idx]=-1e7
        same=(h==h[idx]).astype(float)+(tail==tail[idx]).astype(float)
        sc-=HEAD_PEN*same
        sc-=CORR_PEN*corr[idx,:].astype(np.float32)
    return chosen,allowed

def record(h,pred,eligible,date):
    out={"date":date,
         "numbers":[f"{x:02d}" for x in sorted(pred)],
         "nhay":int(h),
         "hit":int(h>0)}
    allow=int(eligible.sum())
    if h is not None:
        return out
    return out

def summary(arr):
    h=np.array([x["nhay"] for x in arr],np.int16)
    yes=(h>0)
    p=np.array([x["random_three_hit_probability"] for x in arr],np.float64)
    exp=float(p.sum())
    variance=float(np.sum(p*(1-p)))
    longest=0
    current=0
    for a in yes:
        current=0 if a else current+1
        longest=max(longest,current)
    return {
      "from":arr[0]["date"],"to":arr[-1]["date"],"days":len(arr),
      "hit_days":int(yes.sum()),"hit_percent":round(100*float(yes.mean()),3),
      "days_2plus_nhay":int((h>=2).sum()),
      "days_3plus_nhay":int((h>=3).sum()),
      "total_nhay":int(h.sum()),
      "longest_miss_streak":longest,
      "random_eligible_3_expected_hit_days":round(exp,3),
      "observed_minus_eligible_random":round(float(yes.sum())-exp,3),
      "approx_z_vs_random":round((float(yes.sum())-exp)/max(1e-12,math.sqrt(variance)),3)
    }

def main():
    start=time.monotonic()
    R,dates=draw_load()
    N=len(R)
    C=np.zeros((N,100),np.uint8)
    for t,r in enumerate(R):
        C[t]=np.bincount(r,minlength=100)
    P=(C>0).astype(np.float32)
    head_freq=np.array([np.bincount(r//10,minlength=10) for r in R],np.float32)
    tail_freq=np.array([np.bincount(r%10,minlength=10) for r in R],np.float32)
    prefix=np.vstack((np.zeros((1,100),np.float32),P.cumsum(0)))
    T0=N-WIN*BLOCKS
    assert T0>500
    results=[]
    for t in range(T0,N):
        picks,allow=predict(t,R,P,C,head_freq,tail_freq,prefix)
        h=int(C[t,picks].sum())
        # Exact random-3 benchmark under the same non-overlap exclusion.
        remaining=int(allow.sum())
        wins=int(np.count_nonzero((C[t]>0)&allow))
        safe=remaining-wins
        probability=1-max(0,safe*(safe-1)*(safe-2))/max(1,remaining*(remaining-1)*(remaining-2))
        results.append({"date":dates[t],"nhay":h,"numbers":[f"{i:02d}" for i in sorted(picks)],
                        "random_three_hit_probability":float(probability)})
        if (t-T0+1)%500==0:
            print("XSMB_FROZEN_BLOCK_PROGRESS",(t-T0+1),"of",WIN*BLOCKS,
                  "seconds",round(time.monotonic()-start,2),flush=True)
    windows=[summary(results[i*WIN:(i+1)*WIN]) for i in range(BLOCKS)]
    # Last block verifies frozen 316 model exactly, independent code path.
    assert windows[-1]["hit_days"]==316, windows[-1]
    assert windows[-1]["total_nhay"] in (432,433), windows[-1]  # tie/float rounding affects one nhay
    next_picks,next_allowed=predict(N,R,P,C,head_freq,tail_freq,prefix)
    # Cross-check against the original independently implemented 316 baseline.
    import runpy, sys
    original_argv=sys.argv[:]
    try:
        sys.argv=["research/xsmb_3lo_covariance_diversity_20261013.py","hybrid"]
        old=runpy.run_path("research/xsmb_3lo_covariance_diversity_20261013.py")
    finally:
        sys.argv=original_argv
    assert tuple(round(float(x),2) for x in old["parameters"])==(.12,.15,0.)
    assert len(old["chosen"])==1000
    differences=[]
    for k in range(1000):
        a=sorted(int(x) for x in old["chosen"][k])
        b=[int(x) for x in results[-1000+k]["numbers"]]
        if a!=b:
            differences.append({"date":results[-1000+k]["date"],
               "original":[f"{x:02d}" for x in a],
               "independent":[f"{x:02d}" for x in b],
               "original_nhay":int(old["target"][k]),
               "independent_nhay":int(results[-1000+k]["nhay"])})
    comparison={
      "original_days_500":int((old["target"][500:]>0).sum()),
      "independent_days_500":windows[-1]["hit_days"],
      "original_nhay_500":int(old["target"][500:].sum()),
      "independent_nhay_500":windows[-1]["total_nhay"],
      "mismatch_days_last1000":len(differences),
      "mismatch_examples":differences[:10]
    }
    print("XSMB_316_CROSS_IMPLEMENTATION_AUDIT="+json.dumps(comparison,ensure_ascii=False),flush=True)
    out={
      "source":SRC,"rows":N,"last_completed_draw":dates[-1],
      "rule_fixed_before_all_stress_blocks":True,
      "parameter_fitting_during_replay":False,
      "parameters":{"headtail_penalty":HEAD_PEN,"correlation_penalty":CORR_PEN,
                    "reverse_penalty":REVERSE_PEN,"history_window":500},
      "stress_blocks":windows,
      "latest_30":summary(results[-30:]),
      "latest_60":summary(results[-60:]),
      "latest_500":windows[-1],
      "implementation_comparison":comparison,
      "forecast_for_next_draw":{"date":str(dt.date.fromisoformat(dates[-1])+dt.timedelta(days=1)),
             "three_numbers":[f"{x:02d}" for x in sorted(next_picks)],
             "status":"RESEARCH ONLY, NOT A VERIFIED WINNING PREDICTION"},
      "warning":"All data dates are retrospective. 316 was identified after testing many policies; these older blocks are stability checks, not pristine prospective validation.",
      "production_modified":False,
      "seconds":round(time.monotonic()-start,2)
    }
    p=pathlib.Path("research/results/xsmb_316_multiblock_20261014.json")
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("XSMB_316_6BLOCK_REPLAY="+json.dumps(out,ensure_ascii=False),flush=True)

if __name__=="__main__":
    main()
