#!/usr/bin/env python3
"""Research-only XSMB: 80,000 three-number selection policies, including 3 consecutive.

Input is the 27 true prize tails. Forecast t accesses actual results only up to t-1.
Every policy is fitted/selected on older 500 days, and the newest 500 are untouched
until a single global candidate is frozen. Never modify live KQ247 or Telegram.
"""
import argparse
import json
import pathlib
import numpy as np
from xsmb_mass_parallel_20261014 import prepare, F

MODES = ["independent_top3", "triple_0_to_97", "triple_cyclic",
         "adjacent_pair_plus_one", "reverse_pair_plus_one",
         "two_same_head_plus_one", "two_same_tail_plus_one"]
REV = np.array([(x%10)*10+(x//10) for x in range(100)])
PAIR_A = np.array([x for x in range(100) if x < REV[x]], dtype=np.int16)
PAIR_B = REV[PAIR_A]
assert len(PAIR_A)==45

def candidate_weights(shard, n):
    rng=np.random.default_rng(20261014+shard*91939)
    weights=np.zeros((n,F),np.float32)
    mode=np.zeros(n,np.uint8)
    penalty=np.zeros(n,np.float32)
    for i in range(n):
        nfeat=int(rng.integers(2,8))
        feat=rng.choice(F,nfeat,replace=False)
        vals=rng.uniform(.25,2.5,size=nfeat).astype(np.float32)
        vals *= rng.choice([-1,1],size=nfeat,p=[.22,.78])
        vals/=np.sum(np.abs(vals))
        weights[i,feat]=vals
        mode[i]=(i+shard)%len(MODES)
        penalty[i]=float(rng.choice([0,.10,.25,.50]))
    for i in range(min(n,F)):
        weights[i]=0
        weights[i,i]=1
        mode[i]=(i+shard)%len(MODES)
        penalty[i]=0
    return weights,mode,penalty

def scores(X,W):
    t,n,f=X.shape
    return (X.reshape(t*n,f)@W.T).reshape(t,n,len(W)).transpose(2,0,1).copy()

def choose_for_batch(S,allowed,mode,penalty):
    """Returns B x time x 3 picks, each distinct and eligible."""
    B,T,_=S.shape
    S[:,~allowed]=-1e7
    result=np.zeros((B,T,3),dtype=np.int16)
    days=np.arange(T)
    for v in range(B):
        s=S[v]
        m=int(mode[v])
        if m in (1,2):
            if m==1:
                trip=s[:,:-2]+s[:,1:-1]+s[:,2:]
                anchor=trip.argmax(axis=1)
            else:
                trip=s+np.roll(s,-1,axis=1)+np.roll(s,-2,axis=1)
                anchor=trip.argmax(axis=1)
            result[v]=np.stack((anchor,(anchor+1)%100,(anchor+2)%100),axis=1)
            continue
        if m in (3,4):
            if m==3:
                idx=(s[:,:-1]+s[:,1:]).argmax(axis=1)
                one=idx; two=idx+1
            else:
                idx=(s[:,PAIR_A]+s[:,PAIR_B]).argmax(axis=1)
                one=PAIR_A[idx]; two=PAIR_B[idx]
            s[days,one]=-1e7;s[days,two]=-1e7
            three=s.argmax(axis=1)
            result[v]=np.stack((one,two,three),axis=1)
            continue
        if m in (5,6):
            a=s.reshape(T,10,10)
            if m==6:
                a=a.transpose(0,2,1)
            ids=np.argpartition(a,-2,axis=2)[:,:,-2:]
            pair_scores=np.take_along_axis(a,ids,axis=2).sum(axis=2)
            grp=pair_scores.argmax(axis=1)
            pair=ids[days,grp]
            if m==5:
                one=10*grp+pair[:,0];two=10*grp+pair[:,1]
            else:
                one=10*pair[:,0]+grp;two=10*pair[:,1]+grp
            s[days,one]=-1e7;s[days,two]=-1e7
            three=s.argmax(axis=1)
            result[v]=np.stack((one,two,three),axis=1)
            continue
        # Independent top three, with a head/tail penalty for each earlier pick.
        for k in range(3):
            idx=s.argmax(axis=1)
            result[v,:,k]=idx
            s[days,idx]=-1e7
            if k<2 and penalty[v]:
                nums=np.arange(100)
                s-=penalty[v]*((nums[None,:]//10==idx[:,None]//10).astype(np.float32)+
                               (nums[None,:]%10==idx[:,None]%10).astype(np.float32))
    return result

def evaluate(A,W,mode,penalty,start,end):
    X=A["X"][start:end]
    C=A["C"][start:end]
    allowed=A["eligible"][start:end]
    B=len(W);T=end-start
    nhay=np.zeros((B,T),np.uint8)
    lastpicks=[]
    for k in range(0,B,24):
        sc=scores(X,W[k:k+24])
        picks=choose_for_batch(sc,allowed,mode[k:k+24],penalty[k:k+24])
        nhay[k:k+len(picks)]=np.take_along_axis(C[None,:,:],picks,axis=2).sum(axis=2)
        if end==1000:
            lastpicks.extend(picks[:,-1,:].tolist())
    return nhay,lastpicks

def stat(a):
    h=np.asarray(a)
    yes=h>0
    return {"days":len(h),"winning_days":int(yes.sum()),
            "days_2plus_nhay":int((h>=2).sum()),
            "days_3plus_nhay":int((h>=3).sum()),
            "total_nhay":int(h.sum()),
            "first_half":int(yes[:len(h)//2].sum()),
            "second_half":int(yes[len(h)//2:].sum())}

def shard(args):
    A=prepare()
    W,mode,penalty=candidate_weights(args.shard,args.candidates)
    h,_=evaluate(A,W,mode,penalty,0,500)
    yes=(h>0)
    wins=yes.sum(axis=1)
    balanced=np.minimum(yes[:,:250].sum(axis=1),yes[:,250:].sum(axis=1))
    nhay=h.sum(axis=1)
    leaders=[]
    for m in range(len(MODES)):
        ids=np.flatnonzero(mode==m)
        top=sorted(ids,key=lambda i:(int(wins[i]),int(balanced[i]),int(nhay[i])),reverse=True)[:7]
        for i in top:
            leaders.append({"mode":MODES[m],"mode_id":m,"idx":int(i),
                            "train":stat(h[i]),"weights":W[i].round(7).tolist(),
                            "penalty":round(float(penalty[i]),3)})
    result={"shard":args.shard,"num_models":args.candidates,"leaders":leaders,
            "train_dates":A["dates"][-1000:-500][::499],
            "holdout_untouched":True,"source_rows":A["source_rows"],
            "source_last":A["dates"][-1]}
    dst=pathlib.Path(args.output);dst.parent.mkdir(parents=True,exist_ok=True)
    dst.write_text(json.dumps(result,ensure_ascii=False),encoding="utf8")
    best=max(x["train"]["winning_days"] for x in leaders)
    print("XSMB_CONSECUTIVE_SHARD="+json.dumps({"shard":args.shard,"models":args.candidates,
          "best_train":best,"modes":len(MODES)}),flush=True)

def aggregate(args):
    records=[]
    for p in pathlib.Path(args.input_dir).glob("shard-*.json"):
        j=json.loads(p.read_text(encoding="utf8"))
        for leader in j["leaders"]:records.append((j["shard"],leader))
    assert len(records)>=len(MODES)*args.shards
    def key(v):
        d=v[1]["train"]
        return d["winning_days"], min(d["first_half"],d["second_half"]),d["total_nhay"]
    records.sort(key=key,reverse=True)
    # Freeze one champion per class on TRAIN, plus the single globally best champion.
    winners=[records[0]]
    for name in MODES:
        winners.append(next(x for x in records if x[1]["mode"]==name))
    A=prepare()
    W=np.asarray([r["weights"] for _,r in winners],np.float32)
    M=np.asarray([r["mode_id"] for _,r in winners],np.uint8)
    D=np.asarray([r["penalty"] for _,r in winners],np.float32)
    test,lastpicks=evaluate(A,W,M,D,500,1000)
    summary=[]
    for i,(shard_id,r) in enumerate(winners):
        summary.append({"selection":"global_train_champion" if i==0 else "best_train_"+r["mode"],
           "train":r["train"],"holdout":stat(test[i]),
           "last_30":stat(test[i,-30:]),"last_60":stat(test[i,-60:]),
           "holdout_250_first":stat(test[i,:250]),
           "holdout_250_last":stat(test[i,250:]),
           "last_date_picks":[f"{num:02d}" for num in sorted(lastpicks[i])],
           "mode":r["mode"],"penalty":r["penalty"],"shard":shard_id})
    out={"research_only":True,"cutoff":A["dates"][-1],"source_rows":A["source_rows"],
         "source":"khiemdoan/vietnam-lottery-xsmb-analysis","candidates":args.shards*args.candidates,
         "num_selection_modes":len(MODES),
         "training_dates":[A["dates"][-1000],A["dates"][-501]],
         "untouched_holdout_dates":[A["dates"][-500],A["dates"][-1]],
         "test_not_used_for_selection":True,"target":360,
         "global_champion_goal_met":summary[0]["holdout"]["winning_days"]>=360,
         "mode_comparisons_exploratory_not_selection":True,
         "results":summary,
         "production_changed":False,
         "note":"No 3-lotto method guarantees hits; 500 draws are retrospective."}
    d=pathlib.Path(args.output);d.parent.mkdir(parents=True,exist_ok=True)
    d.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding="utf8")
    compact={s["selection"]:{"train":s["train"]["winning_days"],
              "test":s["holdout"]["winning_days"],"last_30":s["last_30"]["winning_days"],
              "picks":s["last_date_picks"]} for s in summary}
    print("XSMB_CONSECUTIVE_INDEPENDENT_RESULT="+json.dumps(compact,ensure_ascii=False),flush=True)

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--aggregate",action="store_true")
    parser.add_argument("--shard",type=int,default=0)
    parser.add_argument("--candidates",type=int,default=10000)
    parser.add_argument("--shards",type=int,default=8)
    parser.add_argument("--input-dir",default="research/results/xsmb_consecutive")
    parser.add_argument("--output",required=True)
    args=parser.parse_args()
    if args.aggregate:aggregate(args)
    else:shard(args)
