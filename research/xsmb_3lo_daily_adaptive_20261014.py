#!/usr/bin/env python3
"""XSMB causal daily-adaptive 3-lo specialist ensemble (research only).

Frozen selection: search previous 500 forecast days, lock single best policy,
then compute results on latest 500. For forecast t, all recent expert rewards
and covariance features use only dates strictly earlier than t.
No VPS, customer, Telegram or prediction snapshot is ever modified.
"""
import argparse
import datetime as dt
import json
import pathlib
import runpy
import sys
import time
import numpy as np
from xsmb_mass_parallel_20261014 import prepare

NOW="2026-10-14"
WS=[7,14,30,60,120,250]
KS=[1,2,3,5,10,20]
METRICS=["winning_day","total_nhay","momentum_vs_long"]
BW=[0,.25,.5,1,2,4]
HEADP=[0,.12,.30,.55]
CORRP=[-.30,0,.15,.35,.70]
SIGN=[-1.,1.]
TOTAL_BASES=len(WS)*len(METRICS)*len(KS)

def standardize(matrix):
    m=matrix.mean(axis=1,keepdims=True)
    s=matrix.std(axis=1,keepdims=True)
    return np.clip((matrix-m)/np.maximum(s,1e-5),-6,6).astype(np.float32)

def data():
    A=prepare()
    oldargs=sys.argv[:]
    try:
        sys.argv=["research/xsmb_3lo_covariance_diversity_20261013.py","hybrid"]
        ref=runpy.run_path("research/xsmb_3lo_covariance_diversity_20261013.py")
    finally:
        sys.argv=oldargs
    assert A["source_rows"]==len(ref["R"])
    assert A["dates"][-1]==ref["rows"][-1]["date"]=="2026-10-13"
    assert int((ref["target"][500:]>0).sum())==316
    assert np.array_equal(A["C"],ref["counts"][-1000:])
    assert np.array_equal(A["eligible"],ref["valid"])
    E=np.concatenate([A["X"].transpose(0,2,1),ref["S"][:,None,:]],axis=1).astype(np.float32)
    T,NE,N=E.shape
    assert (T,N)==(1000,100)
    eligible=A["eligible"]
    masked=np.where(eligible[:,None,:],E,-1e8)
    top3=np.argpartition(masked,-3,axis=2)[:,:,-3:]
    reward=A["C"][np.arange(T)[:,None,None],top3].sum(axis=2).astype(np.int16)
    binary=(reward>0).astype(np.int16)
    prefwin=np.vstack((np.zeros((1,NE),np.int32),binary.cumsum(axis=0)))
    prefnhay=np.vstack((np.zeros((1,NE),np.int32),reward.cumsum(axis=0)))
    BASES=[]
    DESCR=[]
    for w in WS:
        begin=np.maximum(np.arange(T)-w,0)
        day=np.arange(T)
        num=np.maximum(day-begin,1)[:,None]
        win=(prefwin[day]-prefwin[begin])/num
        nhay=(prefnhay[day]-prefnhay[begin])/num
        past120=np.maximum(day-120,0)
        long=(prefwin[day]-prefwin[past120])/np.maximum(day-past120,1)[:,None]
        for metric_name,m in zip(METRICS,[win,nhay,win-long]):
            for k in KS:
                best=np.argsort(m,axis=1,kind="stable")[:,-k:]
                agg=np.take_along_axis(E,best[:,:,None],axis=1).mean(axis=1)
                BASES.append(standardize(agg))
                DESCR.append({"recent_window":w,"metric":metric_name,"top_k_experts":k})
    bases=np.stack(BASES,axis=0)
    # covariance strictly from the previous 250 days; old reference policy is causal.
    cov=ref["C"].astype(np.float32)
    return {"A":A,"bases":bases,"descriptions":DESCR,
            "base_score":ref["S"].astype(np.float32),
            "cov":cov,"reference":ref,"reward":reward}

def params(shard, n):
    rng=np.random.default_rng(20261014+shard*52453)
    p=np.zeros((n,5),np.float32)
    p[:,0]=rng.integers(0,TOTAL_BASES,size=n)  # basis
    p[:,1]=rng.choice(BW,size=n)
    p[:,2]=rng.choice(HEADP,size=n)
    p[:,3]=rng.choice(CORRP,size=n)
    p[:,4]=rng.choice(SIGN,size=n,p=[.20,.80])
    for i in range(min(15,n)):
        p[i]=[i,0,0,0,1]
    return p

def evaluate(data,p,first,last,batch=32):
    B=len(p)
    C=data["A"]["C"][first:last]
    allowed=data["A"]["eligible"][first:last]
    cov=data["cov"][first:last]
    basiss=data["bases"][:,first:last,:]
    origin=data["base_score"][first:last]
    T=last-first
    nums=np.arange(100)
    hd=nums//10
    tl=nums%10
    days=np.arange(T)[None,:]
    out=np.empty((B,T),np.uint8)
    for start in range(0,B,batch):
        end=min(B,start+batch)
        block=p[start:end]
        k=(block[:,0]).astype(np.int32)
        scores=basiss[k].copy()*block[:,4,None,None]+origin[None,:,:]*block[:,1,None,None]
        scores=np.where(allowed[None,:,:],scores,-1e7).astype(np.float32)
        hit=np.zeros((len(block),T),np.uint8)
        row=np.arange(len(block))[:,None]
        for slot in range(3):
            ix=scores.argmax(axis=2)
            hit+=C[days,ix].astype(np.uint8)
            scores[row,days,ix]=-1e7
            if slot<2:
                heads=(hd[None,None,:]==hd[ix][:,:,None]).astype(np.float32)
                tails=(tl[None,None,:]==tl[ix][:,:,None]).astype(np.float32)
                scores-=block[:,2,None,None]*(heads+tails)
                cc=cov[days,ix,:]
                scores-=block[:,3,None,None]*cc
        out[start:end]=hit
    return out

def stat(v):
    v=np.asarray(v)
    yes=(v>0)
    return {"days":len(v),"at_least_one":int(yes.sum()),
            "at_least_two_nhay":int((v>=2).sum()),
            "at_least_three_nhay":int((v>=3).sum()),
            "total_nhay":int(v.sum()),
            "first_half":int(yes[:len(v)//2].sum()),
            "second_half":int(yes[len(v)//2:].sum())}

def shard_run(args):
    t=time.monotonic()
    D=data()
    p=params(args.shard,args.count)
    h=evaluate(D,p,0,500)
    won=(h>0)
    best=np.argsort(-won.sum(axis=1),kind="stable")[:100]
    leaders=[]
    for idx in best:
        leaders.append({"param":p[idx].tolist(),"train":stat(h[idx])})
    # Re-rank only on *training* based on stability and hits.
    leaders.sort(key=lambda x:(x["train"]["at_least_one"],
                              min(x["train"]["first_half"],x["train"]["second_half"]),
                              x["train"]["total_nhay"]),reverse=True)
    out={"shard":args.shard,"count":len(p),
         "train_dates":[D["A"]["dates"][-1000],D["A"]["dates"][-501]],
         "holdout_untouched":True,"leaders":leaders[:25],"status":"train_complete"}
    path=pathlib.Path(args.output);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(out,ensure_ascii=False),encoding="utf8")
    print("XSMB_DAILY_ADAPTIVE_SHARD="+json.dumps({
        "shard":args.shard,"candidates":len(p),
        "train_best":leaders[0]["train"]["at_least_one"],
        "seconds":round(time.monotonic()-t,2)}),flush=True)

def aggregate(args):
    rec=[]
    for f in sorted(pathlib.Path(args.dir).glob("shard-*.json")):
        x=json.loads(f.read_text(encoding="utf8"))
        for z in x["leaders"]: rec.append((x["shard"],z))
    assert len(rec)>=8*20,len(rec)
    key=lambda v:(v[1]["train"]["at_least_one"],
                  min(v[1]["train"]["first_half"],v[1]["train"]["second_half"]),
                  v[1]["train"]["total_nhay"])
    rec.sort(key=key,reverse=True)
    # Freeze the global champion before accessing the last 500 draws.
    selected=rec[0]
    d=data()
    p=np.asarray([selected[1]["param"]],np.float32)
    test=evaluate(d,p,500,1000)[0]
    base=d["reference"]["target"]
    result={
      "research_only":True,"production_modified":False,
      "candidates":args.shards*args.count,
      "train_dates":[d["A"]["dates"][-1000],d["A"]["dates"][-501]],
      "test_dates":[d["A"]["dates"][-500],d["A"]["dates"][-1]],
      "source_rows":d["A"]["source_rows"],
      "reference":{"training":stat(base[:500]),"holdout":stat(base[500:])},
      "frozen_global_champion":{"training":selected[1]["train"],
          "holdout":stat(test),"last30":stat(test[-30:]),
          "last60":stat(test[-60:]),"first250":stat(test[:250]),
          "last250":stat(test[250:]),"shard":selected[0],
          "hyperparams":selected[1]["param"],
          "basis":d["descriptions"][int(selected[1]["param"][0])]},
      "target_360_reached":bool((test>0).sum()>=360),
      "holdout_used_for_selection":False,
      "important":"Last-500 has been examined in earlier experiments. This is not a prospective proof."
    }
    output=pathlib.Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("XSMB_DAILY_ADAPTIVE_INDEPENDENT_RESULT="+json.dumps(result,ensure_ascii=False),flush=True)

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--shard",type=int,default=0)
    ap.add_argument("--count",type=int,default=6000)
    ap.add_argument("--output",required=True)
    ap.add_argument("--aggregate",action="store_true")
    ap.add_argument("--dir",default="research/results/xsmb_adaptive")
    ap.add_argument("--shards",type=int,default=8)
    args=ap.parse_args()
    if args.aggregate:aggregate(args)
    else:shard_run(args)
