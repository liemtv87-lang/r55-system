#!/usr/bin/env python3
"""Research only: mass parallel walk-forward XSMB three-lotto candidate search.

Never writes production, customers or Telegram snapshots.
Historical parameters picked on 500 training draws, latest 500 untouched.
Every target day's inputs end at t-1; one immutable three-number prediction/day.
"""
import argparse
import csv
import datetime as dt
import io
import json
import pathlib
import time
import urllib.request
import numpy as np

SRC = "https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv"
CUTOFF = "2026-10-13"
FAMILIES = ["head_prev1_tail_prev2", "head_prev2_tail_prev1",
            "sum_prev1_prev2", "diff_prev1_prev2", "triangle_3days"]
WINDOWS = [60, 120, 250]
TOPKS = [10, 30, 80]
F = len(FAMILIES) * len(WINDOWS) * len(TOPKS) + 25
HORIZON = 1000
TRAIN = 500

def load():
    req = urllib.request.Request(SRC, headers={"User-Agent": "KQ247-XSMB-Research/1.0"})
    with urllib.request.urlopen(req, timeout=75) as r:
        rows = list(csv.DictReader(io.StringIO(r.read().decode("utf-8-sig"))))
    rows = [r for r in rows if r["date"] <= CUTOFF]
    fields = list(rows[0])[1:]
    assert len(fields)==27 and len(rows)>3500
    assert rows[-1]["date"] == CUTOFF, (rows[-1]["date"], CUTOFF)
    assert all(len(r[f])>0 and r[f].isdigit() for r in rows for f in fields)
    D = np.array([[int(row[k][-2:]) for k in fields] for row in rows], np.uint8)
    assert D.max()<100 and D.shape[1]==27
    dates = [r["date"] for r in rows]
    return D, dates

def normalize(feature):
    a = np.asarray(feature, dtype=np.float32)
    return np.clip((a-a.mean())/max(1e-5,float(a.std())), -6, 6)

def prepare():
    start = time.monotonic()
    D, dates = load()
    N=len(D)
    C=np.zeros((N,100),np.uint8)
    for i in range(N): C[i]=np.bincount(D[i],minlength=100)
    P=(C>0).astype(np.uint8)
    prefix=np.vstack([np.zeros((1,100),np.int32), np.cumsum(P.astype(np.int32),axis=0)])
    T0=N-HORIZON
    BASE=T0-251
    # Forecast-by-position candidate for all 27x27 combinations.
    T=np.empty((N-BASE, len(FAMILIES),729),np.uint8)
    for k, t in enumerate(range(BASE,N)):
        a=D[t-1,:,None].astype(np.int16)
        b=D[t-2,None,:].astype(np.int16)
        c=D[t-3,:,None].astype(np.int16)
        T[k,0]=((a//10)*10+(b%10)).reshape(-1)
        T[k,1]=((b//10)*10+(a%10)).reshape(-1)
        T[k,2]=((a+b)%100).reshape(-1)
        T[k,3]=((a-b)%100).reshape(-1)
        T[k,4]=((a+b+c)%100).reshape(-1)
    # Predictive consistency per template is evaluated on *past* outcome dates.
    positions = np.arange(BASE,N)[:,None,None]
    successes = P[positions,T]  # date x family x 729
    pref=np.concatenate([np.zeros((1,5,729),np.uint16),
                         successes.astype(np.uint16).cumsum(axis=0).astype(np.uint16)])
    # Use t-w ... t-1 to select templates, then predict at t.
    X=np.zeros((1000,100,F),np.float32)
    dates_parsed = [dt.date.fromisoformat(d) for d in dates]
    dayofweek = np.array([d.weekday() for d in dates_parsed])
    dom=np.array([d.day for d in dates_parsed])
    nums=np.arange(100)
    h=nums//10
    tail=nums%10
    rev=(nums%10)*10+(nums//10)
    eligible=np.empty((1000,100),bool)
    for q,t in enumerate(range(T0,N)):
        eligible[q]=~((P[t-1]>0)&(P[t-2]>0))
        index=t-BASE
        f=0
        for fam in range(5):
            for w in WINDOWS:
                perf=(pref[index,fam].astype(np.int32)-pref[index-w,fam].astype(np.int32))
                for topk in TOPKS:
                    ii=np.argpartition(perf,-topk)[-topk:]
                    ix=T[index,fam,ii]
                    vote=np.maximum(.05, (perf[ii].astype(np.float32)/w-.20))*2
                    X[q,:,f]=normalize(np.bincount(ix,weights=vote,minlength=100))
                    f+=1
        fr={w:(prefix[t]-prefix[t-w]).astype(np.float32)/w for w in (7,14,30,60,120,250,500)}
        extra=[
            fr[7],fr[14],fr[30],fr[60],fr[120],fr[250],fr[500],
            fr[7]-fr[30],fr[14]-fr[120],fr[30]-fr[250],
            P[t-1].astype(float),P[t-2].astype(float),
            P[t-1,rev].astype(float),
        ]
        last90=P[t-90:t][::-1]
        gaps=np.where(last90.any(axis=0), last90.argmax(axis=0), 90)
        extra.extend([-np.abs(gaps-5),-np.abs(gaps-10),-gaps.astype(float)])
        hist=(prefix[t]-prefix[t-30]).astype(float)
        head30=np.bincount(h,weights=hist,minlength=10)[h]
        tail30=np.bincount(tail,weights=hist,minlength=10)[tail]
        extra.extend([head30,tail30])
        idx_w=np.flatnonzero(dayofweek[:t]==dayofweek[t])[-52:]
        idx_dom=np.flatnonzero(dom[:t]==dom[t])[-24:]
        extra.extend([P[idx_w].mean(axis=0), P[idx_dom].mean(axis=0)])
        bridge_sum=np.bincount((D[t-1].astype(int)+D[t-2].astype(int))%100,minlength=100)
        bridge_diff=np.bincount((D[t-1].astype(int)-D[t-2].astype(int))%100,minlength=100)
        bridge_tri=np.bincount((D[t-1].astype(int)+D[t-2].astype(int)+D[t-3].astype(int))%100,minlength=100)
        extra.extend([bridge_sum,bridge_diff,bridge_tri])
        extra.append(P[t-1,(nums+99)%100]+P[t-1,(nums+1)%100])
        extra.append(C[t-1].astype(float))
        assert len(extra)==25, len(extra)
        for v in extra:
            X[q,:,f]=normalize(v);f+=1
        if (q+1)%250==0:
            print("FEATURE_BUILD",q+1,"/1000",round(time.monotonic()-start,1),flush=True)
    return dict(dates=dates, C=C[-1000:], X=X, eligible=eligible,
                source_rows=N, feature_names=[
                  f"{fam}_w{w}_top{k}" for fam in FAMILIES for w in WINDOWS for k in TOPKS] +
                  ["f7","f14","f30","f60","f120","f250","f500",
                   "mom7_30","mom14_120","mom30_250","prev","prev2","reverse",
                   "gap5","gap10","gap","head30","tail30","weekday52","monthday24",
                   "position_sum","position_diff","position_triangle","neighbors","prev_count"])

def candidates(shard, count):
    rng=np.random.default_rng(20261014 + shard*7919)
    p=np.full((count,F),0,np.float32)
    div=np.zeros(count,np.float32)
    for j in range(count):
        k=int(rng.integers(2,7))
        ids=rng.choice(F,k,replace=False)
        # Some sparse expert models weigh template features more strongly.
        ww=rng.uniform(.25,2.5,k)
        ww*=rng.choice([-1,1],k,p=[.20,.80])
        p[j,ids]=ww/np.sum(np.abs(ww))
        div[j]=rng.choice([0,.15,.30,.50])
    # Seed every shard with deterministic baseline experts for reproducibility.
    for i in range(min(F,count)):
        p[i,:]=0; p[i,i]=1;div[i]=0
    return p,div

def rate(X,C,eligible,W,D,first=0,last=500):
    """Exact one-day-at-a-time retrospective picks for each frozen policy."""
    train=X[first:last]
    outcomes=C[first:last]
    allowed=eligible[first:last]
    B=len(W)
    days=last-first
    allhits=np.zeros((B,days),np.uint8)
    # Dense matrix multiply uses only prior-draw feature values.
    for st in range(0,B,24):
        wi=W[st:st+24];bs=len(wi)
        scores=(train.reshape(-1,F)@wi.T).reshape(days,100,bs).transpose(2,0,1).copy()
        scores[:,~allowed]=-1e8  # masking flattened eligibility across all policies
        hit=np.zeros((bs,days),np.uint8)
        day=np.arange(days)[None,:]
        row=np.arange(bs)[:,None]
        for k in range(3):
            idx=scores.argmax(axis=2)
            hit+=outcomes[day,idx].astype(np.uint8)
            scores[row,day,idx]=-1e8
            if k<2 and np.any(D[st:st+bs]):
                digits_h=np.arange(100)//10
                digits_t=np.arange(100)%10
                scores-=D[st:st+bs,None,None]*(
                    (digits_h[None,None,:]==(idx//10)[:,:,None]) +
                    (digits_t[None,None,:]==(idx%10)[:,:,None])).astype(np.float32)
        allhits[st:st+bs]=hit
    return allhits

def statistics(h):
    hit=(h>0)
    return {"days":int(len(h)),"at_least_one":int(hit.sum()),
            "at_least_two_nhay":int((h>=2).sum()),"at_least_three_nhay":int((h>=3).sum()),
            "total_nhay":int(h.sum()),"first_half":int(hit[:len(h)//2].sum()),
            "second_half":int(hit[len(h)//2:].sum())}

def run_search(args):
    A=prepare()
    W,D=candidates(args.shard,args.candidates)
    hits=rate(A["X"],A["C"],A["eligible"],W,D)
    yes=hits>0
    score=yes.sum(axis=1)
    balanced=np.minimum(yes[:,:250].sum(axis=1),yes[:,250:].sum(axis=1))
    nhay=hits.sum(axis=1)
    idx=sorted(range(len(W)),key=lambda i:(int(score[i]),int(balanced[i]),int(nhay[i])),reverse=True)[:15]
    out={"shard":args.shard,"candidates":args.candidates,"source_rows":A["source_rows"],
         "source_last":A["dates"][-1],"source":SRC,"train_dates":[A["dates"][-1000],A["dates"][-501]],
         "untouched_holdout_dates":[A["dates"][-500],A["dates"][-1]],
         "features":F, "tuned_on_holdout":False,
         "leaders":[{"train":statistics(hits[i]),"w":W[i].round(7).tolist(),"div":float(D[i]),
                     "local_index":int(i)} for i in idx]}
    p=pathlib.Path(args.output);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(out,ensure_ascii=False)+"\n",encoding="utf8")
    print("XSMB_3LO_SHARD="+json.dumps({"shard":args.shard,"candidates":args.candidates,
           "top_validation_days":out["leaders"][0]["train"]["at_least_one"]},ensure_ascii=False),flush=True)

def aggregate(args):
    records=[]
    for file in sorted(pathlib.Path(args.input_dir).glob("shard-*.json")):
        info=json.loads(file.read_text(encoding="utf8"))
        for r in info["leaders"]:
            records.append((info["shard"],r))
    assert len(records)>=8, "missing shards"
    records.sort(key=lambda x:(x[1]["train"]["at_least_one"],
          min(x[1]["train"]["first_half"],x[1]["train"]["second_half"]),
          x[1]["train"]["total_nhay"]),reverse=True)
    A=prepare()
    # Selection happens once, before reading any holdout result.
    shard,champ=records[0]
    W=np.asarray([champ["w"]],np.float32)
    D=np.asarray([champ["div"]],np.float32)
    hv=rate(A["X"],A["C"],A["eligible"],W,D,500,1000)[0]
    output={
      "goal":360,"goal_met":bool((hv>0).sum()>=360),
      "total_candidates_searched":args.shards*args.candidates,
      "independently_selected_by":"max validation wins and stability, no holdout tuning",
      "validation_champion":champ["train"],
      "holdout_champion":statistics(hv),
      "holdout_last_30":statistics(hv[-30:]),
      "holdout_last_60":statistics(hv[-60:]),
      "selected_shard":shard,"selected_parameters":champ["w"],
      "selected_penalty":champ["div"],
      "source":SRC,"source_rows":A["source_rows"],
      "train_dates":[A["dates"][-1000],A["dates"][-501]],
      "holdout_dates":[A["dates"][-500],A["dates"][-1]],
      "research_only":True, "production_changed":False,
      "historical_347_362_claim_reproduced":False,
      "warning":"Historical lottery is random. Strong train fits do not prove future accuracy.",
      "leaderboard_validation":[{"shard":sh,"days":m["train"]["at_least_one"]} for sh,m in records[:10]]
    }
    dest=pathlib.Path(args.output);dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("XSMB_MASS_3LO_INDEPENDENT_RESULT="+json.dumps(output,ensure_ascii=False),flush=True)

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--shard",type=int)
    p.add_argument("--candidates",type=int,default=5000)
    p.add_argument("--output",default="research/results/shard.json")
    p.add_argument("--aggregate",action="store_true")
    p.add_argument("--input-dir",default="research/results/mass")
    p.add_argument("--shards",type=int,default=8)
    args=p.parse_args()
    if args.aggregate:aggregate(args)
    else:run_search(args)
