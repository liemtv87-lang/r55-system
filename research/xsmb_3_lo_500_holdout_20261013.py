#!/usr/bin/env python3
"""Walk-forward research: three distinct XSMB numbers, 27 prize tails/day.
Validation uses the 500 days before a strictly untouched latest-500 holdout.
No prior day's results are read from the target day or later.
"""
import csv, io, json, math, urllib.request, datetime, os
import numpy as np

URL='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
text=urllib.request.urlopen(URL,timeout=30).read().decode('utf-8-sig')
data=list(csv.DictReader(io.StringIO(text)))
dates=[datetime.date.fromisoformat(r['date']) for r in data]
raw=np.array([[int(r[c][-2:]) for c in list(r.keys())[1:]] for r in data],dtype=np.uint8)
assert raw.shape[1]==27 and len(data)>=3500
assert max(dates)<=datetime.date.today(), 'Source includes future data'
n=len(data); start=n-1000; teststart=n-500
counts=np.zeros((n,100),dtype=np.uint8)
for i,d in enumerate(raw):counts[i]=np.bincount(d,minlength=100)
present=(counts>0).astype(np.uint8)
pre=np.vstack((np.zeros((1,100),dtype=np.int32),counts.astype(np.int32).cumsum(axis=0)))
dows=np.array([d.weekday() for d in dates])
dom=np.array([d.day for d in dates])
feat_names=['f7','f14','f30','f60','f120','f250','f500','f1000','f2500',
'prev','prev2','reverse','gap','gap5','gap10','head14','tail14',
'head60','tail60','weekday52','weekday156','dom24','pair120','pair500',
'position_repeat','sumpos','diffpos','tripos','neighbors','recent14']
F=len(feat_names); features=np.zeros((1000,100,F),dtype=np.float32)
p100=np.arange(100);heads=p100//10;tails=p100%10
rev=(p100%10)*10+p100//10
# Conditioned historical transition signals, updated without using today's result.
transition={}
for window in [120,500]:
    m=np.zeros((100,100),dtype=np.float32)
    for j in range(start-window,start):
        m+=np.outer(present[j-1],present[j])
    transition[window]=m
for i,t in enumerate(range(start,n)):
    if i:
        for w,m in transition.items():
            m+=np.outer(present[t-2],present[t-1])
            m-=np.outer(present[t-w-2],present[t-w-1])
    x={}
    for w in [7,14,30,60,120,250,500,1000,2500]:
        x['f'+str(w)]=(pre[t]-pre[t-w])/w
    x['prev']=counts[t-1]
    x['prev2']=counts[t-2]
    x['reverse']=present[t-1,rev]
    gap=np.zeros(100,dtype=np.float32);rem=np.ones(100,dtype=bool)
    for back in range(1,121):
        hit=(present[t-back]>0)&rem
        gap[hit]=back-1; rem[hit]=False
        if not rem.any():break
    gap[rem]=120
    x['gap']=gap
    x['gap5']=np.exp(-np.abs(gap-5)/4)
    x['gap10']=np.exp(-np.abs(gap-10)/6)
    for w in (14,60):
        tailfreq=(pre[t]-pre[t-w])>0 if False else (pre[t]-pre[t-w])
        x['head'+str(w)]=np.bincount(heads,weights=tailfreq,minlength=10)[heads]
        x['tail'+str(w)]=np.bincount(tails,weights=tailfreq,minlength=10)[tails]
    weekday_ix=np.flatnonzero(dows[:t]==dows[t])
    for numwin in [52,156]:
        selected=weekday_ix[-numwin:]
        x['weekday'+str(numwin)]=present[selected].mean(axis=0) if len(selected) else np.zeros(100)
    dom_ix=np.flatnonzero(dom[:t]==dom[t])[-24:]
    x['dom24']=present[dom_ix].mean(axis=0) if len(dom_ix) else np.zeros(100)
    previous=np.flatnonzero(present[t-1])
    for w in [120,500]:
        m=transition[w]
        exposure=np.maximum(1,present[max(0,t-w-1):t-1].sum(axis=0))
        prob=(m[previous]/exposure[previous,None]).mean(axis=0)
        x['pair'+str(w)]=prob
    s=np.zeros(100);dif=np.zeros(100);p=np.zeros(100);tr=np.zeros(100)
    for j in range(27):
        a=int(raw[t-1,j]);b=int(raw[t-2,j]);c=int(raw[t-3,j])
        s[(a+b)%100]+=1;dif[(a-b)%100]+=1;p[a]+=1;p[b]+=1;tr[(a+b+c)%100]+=1
    x['position_repeat']=p;x['sumpos']=s;x['diffpos']=dif;x['tripos']=tr
    x['neighbors']=present[t-1,(p100+1)%100]+present[t-1,(p100+99)%100]
    x['recent14']=pre[t]-pre[t-14]
    features[i]=np.stack([x[name] for name in feat_names],axis=-1).astype(np.float32)
# Within-day z-score features means test features have no target-day leakage.
mean=features.mean(axis=1,keepdims=True);std=features.std(axis=1,keepdims=True)
features=(features-mean)/np.maximum(std,1e-5)
val=features[:500];test=features[500:]
val_hit=(counts[start:teststart]);test_hit=counts[teststart:]
rng=np.random.default_rng(20261013)
models=20000
weights=np.zeros((models+F*2,F),dtype=np.float32)
for i in range(models):
    k=int(rng.integers(2,7))
    js=rng.choice(F,size=k,replace=False)
    weights[i,js]=rng.choice([-1.0,1.0],size=k)*rng.uniform(0.2,2,size=k)
for j in range(F):
    weights[models+2*j,j]=1
    weights[models+2*j+1,j]=-1
models=len(weights)
result=[]
max_batch=32
for st in range(0,models,max_batch):
    batch=weights[st:st+max_batch]
    scores=np.einsum('tnf,bf->btn',val,batch,optimize=True)
    top3=np.argpartition(scores,-3,axis=2)[:,:,-3:]
    scored=np.take_along_axis(val_hit[None,:,:],top3,axis=2).sum(axis=2)
    won=np.sum(scored>0,axis=1)
    flashes=np.sum(scored,axis=1)
    half=np.minimum(np.sum(scored[:,:250]>0,axis=1),np.sum(scored[:,250:]>0,axis=1))
    for i in range(len(batch)):
        result.append((int(won[i]),int(half[i]),int(flashes[i]),st+i))
# Choose ONLY by validation, then reveal last-500 test scores.
leaders=sorted(result,reverse=True)[:25]
evaluation=[]
for wins,balanced,flashes,idx in leaders:
    w=weights[idx]
    sc=np.einsum('tnf,f->tn',test,w,optimize=True)
    selected=np.argpartition(sc,-3,axis=1)[:,-3:]
    hits=np.take_along_axis(test_hit,selected,axis=1).sum(axis=1)
    items=np.count_nonzero(hits)
    nhay=int(hits.sum())
    order=np.argsort(sc[-1])[::-1][:3]
    evaluation.append(dict(model=int(idx),validation_days=wins,validation_min_half=balanced,
        test_days=int(items),test_nhay=nhay,
        weights={feat_names[j]:round(float(w[j]),3) for j in np.flatnonzero(w)},
        last_day_top3=[f'{int(v):02d}' for v in order]))
# Plain season-to-season adaptive baselines selected independently per day.
baselines=[]
for w in [7,14,30,60,120,250,500,1000,2500]:
    fw=features[500:,:,feat_names.index('f'+str(w))]
    for sign in [-1,1]:
        top3=np.argpartition(sign*fw,-3,axis=1)[:,-3:]
        h=np.take_along_axis(test_hit,top3,axis=1).sum(axis=1)
        baselines.append({'window':w,'sign':sign,'days':int(np.count_nonzero(h)),'nhay':int(h.sum())})
summary=dict(rows=n,validated_dates=[str(dates[start]),str(dates[teststart-1])],
    heldout_dates=[str(dates[teststart]),str(dates[-1])],source=URL,models_tested=models,
    features=F,top_validation_model=evaluation[0],tested_champions=evaluation[:10],
    baselines=baselines,best_holdout_among_examined=int(max(z['test_days'] for z in evaluation)),
    target_360_reached=evaluation[0]['test_days']>=360)
print('XSMB_3_LO_BACKTEST_RESULT='+json.dumps(summary,ensure_ascii=False,separators=(',',':')))
