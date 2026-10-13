#!/usr/bin/env python3
"""XSMB 3 bach thu: DAILY rolling selection of complementary position heads/tails.
Every candidate is computed from past draw positions only, and every ranking
uses ONLY draws strictly before the target date. 500/500 chronological split.
"""
import csv, io, json, urllib.request, datetime, sys, itertools, time
import numpy as np
SRC='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
data=list(csv.DictReader(io.StringIO(urllib.request.urlopen(SRC,timeout=35).read().decode('utf8-sig'))))
keys=list(data[0].keys())[1:]
assert len(keys)==27
# 13 October 2026 results independently confirmed in sxmb.com and xsmb.io.vn.
# Only append if source has NOT yet incorporated this draw.
oct13=['53618','54279','01658','99875','58777','33062','70578',
       '29945','03967','90070','1440','4471','5218','7377','8274',
       '4475','3487','5399','5678','2717','719','114','363','78',
       '95','84','51']
if data[-1]['date']=='2026-10-12':
    data.append(dict(date='2026-10-13',**dict(zip(keys,oct13))))
assert data[-1]['date']=='2026-10-13',data[-1]['date']
assert len(data)>=4000
n=len(data)
draws=np.array([[int(x[key][-2:]) for key in keys] for x in data],dtype=np.uint8)
assert draws.shape==(n,27)
presence=np.zeros((n,100),dtype=bool)
for t in range(n):
    presence[t,np.unique(draws[t])]=True
freq=np.zeros((n,100),dtype=np.uint8)
for t in range(n):freq[t]=np.bincount(draws[t],minlength=100)
LAGS=[1,2,3,5,7]
lagheads=np.repeat(np.array(LAGS,dtype=np.int16),len(LAGS)*27*27)
lagtails=np.tile(np.repeat(np.array(LAGS,dtype=np.int16),27*27),len(LAGS))
heads=np.tile(np.repeat(np.arange(27,dtype=np.int16),27),len(LAGS)*len(LAGS))
tails=np.tile(np.arange(27,dtype=np.int16),len(LAGS)*len(LAGS)*27)
m=len(heads)
assert m==18225
base=n-2000
H=np.empty((2000,m),dtype=np.uint8)
P=np.empty((2000,m),dtype=np.uint8)
for i,t in enumerate(range(base,n)):
    pred=(draws[t-lagheads,heads]//10)*10 + (draws[t-lagtails,tails]%10)
    P[i]=pred
    H[i]=presence[t,pred].astype(np.uint8)
# Prefix historical results: candidate indexes can NEVER use target day or later.
cum=np.vstack([np.zeros((1,m),dtype=np.int16),H.cumsum(axis=0,dtype=np.int16)])
window=int(sys.argv[1]) if len(sys.argv)>1 else 250
assert window in [90,250,500,1000]
ks=[20,50,100]
penalties=[0.0,0.25,0.75]
results={(K,pen):[0,0,0,0,0,0] for K in ks for pen in penalties}
# results track first-500 days hit, nhays, days with >=2;
# last-500 separately.
last_predictions={}
time0=time.monotonic()
for i in range(1000,2000):
    actual_index=base+i
    historical=H[i-window:i]
    # Bayesian shrinkage stabilizes 1000s of highly-correlated templates.
    # Identical lag/position templates sorted by ID deterministically.
    past_hits=cum[i]-cum[i-window]
    prior_rate=(1-(0.99)**27)
    shrink=125
    score=(past_hits+shrink*prior_rate)/(window+shrink)
    # Last 14-day stability penalty using previous-only observations.
    recent=H[max(i-14,0):i].sum(axis=0)
    score+=0.02*((recent+2*prior_rate)/(min(i,14)+2)-prior_rate)
    for K in ks:
        # Top-K templates by prior-only accuracy, stable tie handling.
        candidate=np.argpartition(score,-K)[-K:]
        candidate=candidate[np.lexsort((candidate,-score[candidate]))]
        hist=historical[:,candidate]
        today=P[i,candidate]
        for pen in penalties:
            chosen_idx=[]
            chosen_nums=[]
            covered=np.zeros(window,dtype=bool)
            for step in range(3):
                # Marginal historic probability the next template hits on a
                # day when our already selected template(s) all miss.
                marginal=((~covered)[:,None]&hist.astype(bool)).sum(axis=0).astype(float)
                if chosen_nums:
                    headPenalty=np.array([sum(v//10==n//10 for v in chosen_nums) for n in today])
                    tailPenalty=np.array([sum(v%10==n%10 for v in chosen_nums) for n in today])
                    marginal-=pen*window*(headPenalty+tailPenalty)*0.10
                for j,num in enumerate(today):
                    if num in chosen_nums:marginal[j]=-1e8
                picked=int(np.argmax(marginal))
                assert today[picked] not in chosen_nums
                chosen_idx.append(picked);chosen_nums.append(int(today[picked]))
                covered |= hist[:,picked].astype(bool)
            count=sum(int(freq[actual_index,num]) for num in chosen_nums)
            arr=results[(K,pen)]
            o=0 if i<1500 else 3
            arr[o]+=int(count>0)
            arr[o+1]+=count
            arr[o+2]+=int(count>=2)
            if i==1999:last_predictions[(K,pen)]=[f'{num:02d}' for num in chosen_nums]
    if (i-999)%250==0:
        print('ROLLING_PROGRESS',window,i-999,'/1000','seconds',round(time.monotonic()-time0,2),flush=True)
ranked=sorted([{'window':window,'k':K,'diversity_penalty':pen,
     'validation_days':x[0],'validation_nhay':x[1],'validation_days2plus':x[2],
     'holdout_days':x[3],'holdout_nhay':x[4],'holdout_days2plus':x[5],
     'day13_picks':last_predictions[(K,pen)]}
     for (K,pen),x in results.items()],
     key=lambda d:(-d['validation_days'],-d['validation_nhay'],d['k'],d['diversity_penalty']))
print('XSMB_ROLLING_COMPLEMENT_RESULT='+json.dumps({
 'window':window,'candidate_templates':m,'candidate_variants':len(results),
 'validation_dates':[data[n-1000]['date'],data[n-501]['date']],
 'holdout_dates':[data[n-500]['date'],data[-1]['date']],
 'selection_policy':'Best variants ranked by VALIDATION only; holdout never used to pick settings',
 'best_selected':ranked[0],
 'all_variants':ranked,
 'target_reached':ranked[0]['holdout_days']>=360,
 'runtime_seconds':round(time.monotonic()-time0,2)
},ensure_ascii=False,separators=(',',':')),flush=True)
