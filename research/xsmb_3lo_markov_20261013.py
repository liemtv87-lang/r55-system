#!/usr/bin/env python3
"""Strictly causal XSMB 3-lo one-day transition research.
Every target t uses only previous 500 completed 27-prize draws.
Older 500 target predictions select hyperparameters, last 500 score them.
This is research only: never writes production snapshots.
"""
import csv,io,json,sys,urllib.request,time
import numpy as np
MODE=sys.argv[1] if len(sys.argv)>1 else 'markov'
assert MODE in ('markov','special','hybrid','antihot')
URL='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
rows=list(csv.DictReader(io.StringIO(urllib.request.urlopen(URL,timeout=40).read().decode('utf-8-sig'))))
keys=list(rows[0])[1:]
if rows[-1]['date']=='2026-10-12':
 oct13=['53618','54279','01658','99875','58777','33062','70578','29945','03967',
 '90070','1440','4471','5218','7377','8274','4475','3487','5399',
 '5678','2717','719','114','363','78','95','84','51']
 rows.append(dict(date='2026-10-13',**dict(zip(keys,oct13))))
assert len(rows)>=3500 and len(keys)==27 and rows[-1]['date']=='2026-10-13'
D=np.array([[int(r[k][-2:]) for k in keys] for r in rows],np.uint8)
n=len(D);FIRST=n-1000
C=np.zeros((n,100),np.uint8)
for t in range(n):C[t]=np.bincount(D[t],minlength=100)
H=(C>0).astype(np.float32)
head=np.arange(100)//10;tail=np.arange(100)%10;reverse=tail*10+head
pref=np.vstack([np.zeros((1,100),np.float32),H.cumsum(0)])
F=9
X=np.zeros((1000,100,F),np.float32)
eligible=np.ones((1000,100),bool)
cross=H[FIRST-500:FIRST-1].T@H[FIRST-499:FIRST]
start=time.monotonic()
def scale(x):
 x=np.asarray(x,np.float32)
 return np.clip((x-x.mean())/max(0.0001,float(x.std())),-4,4)
for i,t in enumerate(range(FIRST,n)):
 if i:
  cross+=np.outer(H[t-2],H[t-1])-np.outer(H[t-501],H[t-500])
 base=(pref[t]-pref[t-500])/500
 short=(pref[t]-pref[t-14])/14
 mid=(pref[t]-pref[t-120])/120
 long=(pref[t]-pref[t-250])/250
 prev=H[t-500:t-1]
 next=H[t-499:t]
 exp=prev.sum(0)
 shrink=10
 conditional=(cross+shrink*base[None,:])/(exp[:,None]+shrink)
 ix=np.flatnonzero(H[t-1])
 lifts=conditional[ix]-base[None,:]
 X[i,:,0]=scale(.5*short+.5*mid)
 X[i,:,1]=scale(-(long-.35*short))
 X[i,:,2]=scale(lifts.mean(0))
 X[i,:,3]=scale(lifts.max(0))
 X[i,:,4]=scale(conditional[reverse,np.arange(100)]-base)
 # Conditional evidence from exact location of yesterday's special tail
 specials=D[t-500:t-1,0]
 latest=int(D[t-1,0])
 sameH=(specials//10==latest//10).astype(np.float32)
 sameT=(specials%10==latest%10).astype(np.float32)
 X[i,:,5]=scale((sameH@next+15*base)/(sameH.sum()+15))
 X[i,:,6]=scale((sameT@next+15*base)/(sameT.sum()+15))
 # Strictly historical 499 pairs: yesterday positions vs historical predecessor
 priorpositions=D[t-500:t-1]
 targetpositions=D[t-1]
 pos=(priorpositions//10==targetpositions//10).sum(1)+(priorpositions%10==targetpositions%10).sum(1)
 val=np.argpartition(pos,-30)[-30:]
 score=pos[val].astype(np.float32)
 weights=np.exp(np.clip((score-score.max())/.65,-30,0))
 X[i,:,7]=scale(weights@next[val]/weights.sum())
 hprev=np.array([np.bincount(row//10,minlength=10) for row in priorpositions],np.float32)
 tprev=np.array([np.bincount(row%10,minlength=10) for row in priorpositions],np.float32)
 htoday=np.bincount(targetpositions//10,minlength=10).astype(np.float32)
 ttoday=np.bincount(targetpositions%10,minlength=10).astype(np.float32)
 similar=pos/5.-.02*np.sum((hprev-htoday)**2+(tprev-ttoday)**2,axis=1)
 val=np.argpartition(similar,-35)[-35:]
 weights=np.exp(np.clip((similar[val]-similar[val].max())/1.1,-30,0))
 X[i,:,8]=scale(weights@next[val]/weights.sum())
 eligible[i]=~((H[t-1]>0)&(H[t-2]>0))
 if (i+1)%250==0:
  print('XSMB_TRANSITION_PROGRESS',MODE,i+1,'/1000',round(time.monotonic()-start,2),flush=True)
groups={
 'markov':[0,1,2,3,4],
 'special':[0,1,5,6,7],
 'hybrid':list(range(F)),
 'antihot':[0,1,2,3,7,8]
}
rng=np.random.default_rng({'markov':501,'special':502,'hybrid':503,'antihot':504}[MODE])
members=groups[MODE]
W=[]
for col in members:
 for sign in (-1,1):
  w=np.zeros(F,np.float32);w[col]=sign;W.append(w)
for z in range(700):
 w=np.zeros(F,np.float32)
 ix=rng.choice(members,size=int(rng.integers(2,min(7,len(members))+1)),replace=False)
 w[ix]=rng.choice([-1,1],len(ix))*rng.uniform(.25,2.,len(ix))
 if MODE=='antihot':w[1]+=rng.uniform(.2,2.)
 W.append(w)
W=np.asarray(W,np.float32)
y=C[FIRST:]
day=np.arange(1000)
penalties=(0.,.2,.5)
best=None
for st in range(0,len(W),32):
 B=W[st:st+32]
 score=np.einsum('tnf,bf->btn',X,B,optimize=True)
 for pen in penalties:
  sc=np.where(eligible[None],score,-1e7).copy()
  sel=np.empty((len(B),1000,3),np.int16)
  ar=np.arange(len(B))[:,None];daily=np.arange(1000)[None,:]
  for position in range(3):
   idx=np.argmax(sc,axis=2);sel[:,:,position]=idx;sc[ar,daily,idx]=-1e7
   if pen:
    sc-=pen*((head[None,None,:]==head[idx][:,:,None]).astype(np.float32)+
             (tail[None,None,:]==tail[idx][:,:,None]).astype(np.float32))
  nh=np.take_along_axis(y[None],sel,axis=2).sum(2)
  truth=nh[:,:500]>0
  totals=truth.sum(1);half=np.minimum(truth[:,:250].sum(1),truth[:,250:].sum(1))
  nhay=nh[:,:500].sum(1)
  for j in range(len(B)):
   record=(int(totals[j]),int(half[j]),int(nhay[j]))
   if best is None or record>best[0]:
    best=(record,st+j,pen,sel[j].copy(),nh[j].copy())
record,index,pen,sel,nh=best
def stat(x):
 return {'days':int((x>0).sum()),'nhay':int(x.sum()),
 'days2plus':int((x>=2).sum()),'days3plus':int((x>=3).sum()),
 'first250':int((x[:250]>0).sum()),'last250':int((x[250:]>0).sum())}
out={
 'mode':MODE,'source_rows':n,'source_last':rows[-1]['date'],
 'validation_dates':[rows[FIRST]['date'],rows[FIRST+499]['date']],
 'holdout_dates':[rows[FIRST+500]['date'],rows[-1]['date']],
 'train_only_500history':True,'models_tested':len(W)*len(penalties),
 'validation':stat(nh[:500]),'holdout':stat(nh[500:]),
 'weights':{str(k):round(float(W[index,k]),3) for k in np.flatnonzero(W[index])},
 'head_tail_penalty':pen,'last_day_three':[f'{int(j):02d}' for j in np.sort(sel[-1])],
 'target_360_met':bool((nh[500:]>0).sum()>=360),
 'research_only':True,'seconds':round(time.monotonic()-start,2)
}
print('XSMB_3LO_MARKOV_RESULT='+json.dumps(out,ensure_ascii=False,separators=(',',':')),flush=True)
