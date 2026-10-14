#!/usr/bin/env python3
"""Chronological XSMB 3-lo rule switching: 316/500 baseline + positional experts.

Uses frozen specialist rules selected on first 500 only, and a single new
switch rule selected on that same training block. Last 500 remain untouched
until all weights, thresholds, and expert choices are frozen. Research-only.
"""
import argparse
import datetime as dt
import json
import pathlib
import runpy
import sys
import numpy as np
from xsmb_mass_parallel_20261014 import prepare
from xsmb_3lo_consecutive_80k_20261014 import MODES, scores, choose_for_batch

def source_only_features(rows,R,START,base,alts):
    n=len(rows)
    D=np.asarray(R,dtype=np.uint8)
    P=(np.asarray([np.bincount(x,minlength=100) for x in D])>0).astype(np.uint8)
    C=np.asarray([np.bincount(x,minlength=100) for x in D],dtype=np.uint8)
    pre=np.vstack((np.zeros((1,100),np.float32),P.cumsum(axis=0)))
    tcount=len(base)
    names=["weekday","day_of_month","target_daydigit","is_weekend",
       "prev_distinct","prev2_distinct","prev_overlap","prev3_overlap",
       "prev_heads_used","prev_tails_used","prev_max_head",
       "prev_max_tail","prev_even_tail","prev_special","prev_prize27",
       "prev_repeated_pairs","prev3_distinct","prev7_distinct_mean",
       "prev14_distinct_mean","base_recent14","base_recent60",
       "base_recent120","base_gap_mean","base_gap_min",
       "base_num_heads","base_num_tails","prev_touched_base",
       "prev2_touched_base","first_base_last2","prev_sum_tails"]
    f=np.zeros((tcount,len(names)),np.float32)
    for i,t in enumerate(range(START,n)):
        y=D[t-1]
        heads=np.bincount(y//10,minlength=10)
        tails=np.bincount(y%10,minlength=10)
        b=base[i]
        now=dt.date.fromisoformat(rows[t]["date"])
        prev90=P[t-90:t][::-1,b]
        gaps=np.where(prev90.any(axis=0),prev90.argmax(axis=0),90)
        r14=(pre[t,b]-pre[t-14,b]).mean()/14
        r60=(pre[t,b]-pre[t-60,b]).mean()/60
        r120=(pre[t,b]-pre[t-120,b]).mean()/120
        f[i]=[
            now.weekday(),now.day,now.day%10,float(now.weekday()>=5),
            P[t-1].sum(),P[t-2].sum(),(P[t-1]&P[t-2]).sum(),
            (P[t-1]&P[t-2]&P[t-3]).sum(),
            (heads>0).sum(),(tails>0).sum(),heads.max(),
            tails.max(),(y%2==0).sum(),int(y[0]),int(y[-1]),
            (C[t-1]>1).sum(),P[t-3].sum(),
            P[t-7:t].sum(axis=1).mean(),
            P[t-14:t].sum(axis=1).mean(),
            r14,r60,r120,gaps.mean(),gaps.min(),
            len(set(int(x)//10 for x in b)),
            len(set(int(x)%10 for x in b)),
            P[t-1,b].sum(),P[t-2,b].sum(),
            P[t-1,b[:2]].sum(),
            int(np.sum(y%10))
        ]
    return f,names

def load_specialists(directory):
    leaders=[]
    for path in pathlib.Path(directory).glob("shard-*.json"):
        data=json.loads(path.read_text(encoding="utf8"))
        for l in data["leaders"]:
            leaders.append(l)
    assert len(leaders)>=7*8*7, len(leaders)
    def k(m):
        x=m["train"]
        return (x["winning_days"],min(x["first_half"],x["second_half"]),x["total_nhay"])
    selected=[]
    for mode in MODES:
        group=[x for x in leaders if x["mode"]==mode]
        selected.append(max(group,key=k))
    return selected

def assemble_options(base, experts):
    # Each option is 1000 x 3, with exactly three distinct numbers.
    candidates=[np.array(base,np.int16)]
    names=["baseline_316"]
    for e,name in zip(experts,MODES):
        full=np.array(e,np.int16)
        one=np.empty_like(full)
        two=np.empty_like(full)
        for t in range(len(base)):
            b=list(map(int,base[t]))
            a=list(map(int,e[t]))
            # one switched while retaining the first two original numbers
            extra=next(x for x in a if x not in b[:2])
            one[t]=[b[0],b[1],extra]
            # two switched while retaining the first original number
            extra2=[x for x in a if x!=b[0]][:2]
            assert len(extra2)==2
            two[t]=[b[0],*extra2]
        for suffix,pick in [("full",full),("replace_one",one),("replace_two",two)]:
            assert np.all(np.array([len(np.unique(x))==3 for x in pick]))
            candidates.append(pick)
            names.append(name+"_"+suffix)
    return np.stack(candidates,axis=1),names

def generate_masks(v):
    masks=[];labels=[]
    for j in range(v.shape[1]):
        train=np.asarray(v[:500,j])
        thresholds=np.unique(np.quantile(train,np.linspace(.1,.9,9)))
        for threshold in thresholds:
            for s in (0,1):
                mask=(v[:,j] > threshold) if s else (v[:,j]<=threshold)
                cover=mask[:500].mean()
                if .07<=cover<=.93:
                    masks.append(mask)
                    labels.append({"feature":int(j),"test":">" if s else "<=",
                                   "threshold":float(threshold),"train_share":round(float(cover),3)})
    return np.array(masks,bool),labels

def main(args):
    original_argv=sys.argv[:]
    sys.argv=["research/xsmb_3lo_covariance_diversity_20261013.py","hybrid"]
    old=runpy.run_path("research/xsmb_3lo_covariance_diversity_20261013.py")
    sys.argv=original_argv
    R=old["R"];START=old["START"];base=old["chosen"];counts=old["counts"]
    assert len(base)==1000 and len(counts)==len(R)
    assert int((old["target"][500:]>0).sum())==316
    rows=old["rows"]
    methods=load_specialists(args.directory)
    A=prepare()
    assert A["source_rows"]==len(rows) and A["dates"][-1]==rows[-1]["date"]
    W=np.asarray([x["weights"] for x in methods],np.float32)
    M=np.asarray([x["mode_id"] for x in methods],np.uint8)
    D=np.asarray([x["penalty"] for x in methods],np.float32)
    experts=choose_for_batch(scores(A["X"],W),A["eligible"],M,D)
    picks,names=assemble_options(base,experts)
    numbers=np.arange(1000)[:,None,None]
    full_hits=counts[START+numbers,picks].sum(axis=2).astype(np.uint8)
    assert full_hits.shape==(1000,len(names))
    assert np.all(full_hits[:,0]==old["target"])
    v,feature_names=source_only_features(rows,R,START,base,experts)
    masks,labels=generate_masks(v)
    print("XSMB_SWITCH_FEATURES",len(masks),len(names),"alternative options",flush=True)
    np.random.seed(20261014)
    rng=np.random.default_rng(20261014)
    n=args.candidates
    alt_ids=rng.integers(1,len(names),n)
    m1=rng.integers(0,len(masks),n)
    m2=rng.integers(0,len(masks),n)
    op=rng.integers(0,3,n) # AND, OR, XOR
    best=None
    base_yes=(full_hits[:500,0]>0).astype(np.int16)
    basewin=int(base_yes.sum())
    for st in range(0,n,512):
        end=min(n,st+512)
        a=masks[m1[st:end],:500]
        b=masks[m2[st:end],:500]
        mm=np.where(op[st:end,None]==0,a&b,
                    np.where(op[st:end,None]==1,a|b,a^b))
        share=mm.mean(axis=1)
        alt=(full_hits[:500,alt_ids[st:end]]>0).T.astype(np.int16)
        deltas=alt-base_yes
        won=basewin+(deltas*mm).sum(axis=1)
        half=(
          base_yes[:250].sum() + (deltas[:,:250]*mm[:,:250]).sum(axis=1),
          base_yes[250:].sum() + (deltas[:,250:]*mm[:,250:]).sum(axis=1)
        )
        robust=np.minimum(half[0],half[1])
        for k in np.flatnonzero((share>=.07)&(share<=.75)):
            x=(int(won[k]),int(robust[k]),-abs(float(share[k])-.25))
            if best is None or x>best[0]:
                best=(x,st+k)
        if end%20000==0:print("XSMB_SWITCH_SEARCH",end,"/",n,flush=True)
    assert best is not None
    idx=best[1]
    a,b=masks[m1[idx]],masks[m2[idx]]
    switch=(a&b) if op[idx]==0 else ((a|b) if op[idx]==1 else (a^b))
    alt=int(alt_ids[idx])
    picked=np.where(switch,full_hits[:,alt],full_hits[:,0])
    actual=np.where(switch[:,None],picks[:,alt,:],picks[:,0,:])
    assert len(actual)==1000 and int((picked[:500]>0).sum())==best[0][0]
    def stat(h):
        return {"days":len(h),"trúng_1_ngày":int((h>0).sum()),
                "ngày_2_nháy":int((h>=2).sum()),
                "ngày_3_nháy":int((h>=3).sum()),
                "tổng_nháy":int(h.sum())}
    out={
        "models_examined":n,
        "source_rows":A["source_rows"],"source_latest":A["dates"][-1],
        "train_dates":[A["dates"][-1000],A["dates"][-501]],
        "holdout_dates":[A["dates"][-500],A["dates"][-1]],
        "chosen_policy_from_train_only":True,
        "strict_no_target_day_data":True,
        "reference_316":{"training":stat(full_hits[:500,0]),"holdout":stat(full_hits[500:,0])},
        "switched":{"train":stat(picked[:500]),"holdout":stat(picked[500:]),
                    "holdout_last30":stat(picked[-30:]),"holdout_last60":stat(picked[-60:])},
        "switch_rule":{"source_only_first":dict(labels[m1[idx]],name=feature_names[labels[m1[idx]]["feature"]]),
                       "source_only_second":dict(labels[m2[idx]],name=feature_names[labels[m2[idx]]["feature"]]),
                       "operation":["AND","OR","XOR"][int(op[idx])],
                       "alternative":names[alt],
                       "frequency_train":float(switch[:500].mean()),
                       "frequency_holdout":float(switch[500:].mean())},
        "last_day_numbers":[f"{x:02d}" for x in sorted(actual[-1])],
        "target_360_reached":bool(int((picked[500:]>0).sum())>=360),
        "research_only":True,"production_unchanged":True,
        "warning":"One frozen train-selected policy; no selection or fitting on holdout."
    }
    outpath=pathlib.Path(args.output);outpath.parent.mkdir(parents=True,exist_ok=True)
    outpath.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print("XSMB_SWITCH_100K_INDEPENDENT_RESULT="+json.dumps(out,ensure_ascii=False),flush=True)

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--directory",default="research/results/xsmb_consecutive")
    parser.add_argument("--output",default="research/results/xsmb_switch_100k.json")
    parser.add_argument("--candidates",type=int,default=100000)
    main(parser.parse_args())
