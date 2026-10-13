#!/usr/bin/env python3
"""Causal XSMB conditional recurrence/hazard experiment; research-only."""
import csv,io,json,sys,urllib.request,datetime
import numpy as np
mode=sys.argv[1] if len(sys.argv)>1 else 'hazard'
assert mode in ['hazard','gap','headtail','hybrid']
u='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
rows=list(csv.DictReader(io.StringIO(urllib.request.urlopen(u,timeout=30).read().decode('utf-8-sig'))))
keys=list(rows[0])[1:]
if rows[-1]['date']=='2026-10-12':
 oct13=['53618','54279','01658','99875','58777','33062','70578','29945','03967','90070',
 '1440','4471','5218','7377','8274','4475','3487','5399','5678','2717','719','114','363','78','95','84','51']
 rows.append(dict(date='2026-10-13',**dict(zip(keys,oct13))))
assert len(keys)==27 and len(rows)>=3500 and rows[-1]['date']=='2026-10-13'
A=np.array([[int(r[k][-2:]) for k in keys] for r in rows],dtype=np.uint8)
N=len(A);first=N-1000
ct=np.zeros((N,100),np.uint8)
for i in range(N):ct[i]=np.bincount(A[i],minlength=100)
hit=ct>0;cum=np.vstack([np.zeros((1,100),np.int32),hit.astype(np.int32).cumsum(0)])
age=np.zeros((N,100),np.uint8)
for i in range(1,N):
 age[i]=np.minimum(age[i-1].astype(np.int16)+1,90).astype(np.uint8)
 age[i,hit[i]]=0
num=np.arange(100);head=num//10;tail=num%10
names=['hazard2','hazard5','freq120','freq250','freq500','age',
'head14','tail14','head60','tail60','prev','rev']
F=len(names);feat=np.zeros((1000,100,F),np.float32)
valid=np.empty((1000,100),bool)
for it,t in enumerate(range(first,N)):
 cur=age[t-1].astype(np.int16)
 prev_age=age[t-501:t-1].astype(np.int16)
 prev_hit=hit[t-500:t]
 f120=(cum[t]-cum[t-120])/120
 f250=(cum[t]-cum[t-250])/250
 f500=(cum[t]-cum[t-500])/500
 x=[]
 for closeness in (2,5):
  same=np.abs(prev_age-cur)<=closeness
  conditional=(np.sum(same*prev_hit,axis=0)+12*f500)/(np.sum(same,axis=0)+12)
  x.append(conditional)
 x.extend((f120,f250,f500,cur/30.))
 for w in (14,60):
  fr=cum[t]-cum[t-w]
  x.append(np.bincount(head,weights=fr,minlength=10)[head])
  x.append(np.bincount(tail,weights=fr,minlength=10)[tail])
 x.append(hit[t-1])
 x.append(hit[t-1,tail*10+head])
 feat[it]=np.stack(x,axis=1)
 valid[it]=~(hit[t-1]&hit[t-2])
mu=feat.mean(axis=1,keepdims=True);sd=feat.std(axis=1,keepdims=True)
feat=np.clip((feat-mu)/np.maximum(sd,1e-5),-5,5)
families={
'hazard':['hazard2','hazard5','freq120','freq250','freq500'],
'gap':['hazard2','hazard5','age','freq250','freq500','prev'],
'headtail':['hazard2','freq250','head14','tail14','head60','tail60'],
'hybrid':names
}
members=np.array([names.index(z) for z in families[mode]])
rng=np.random.default_rng({'hazard':23,'gap':39,'headtail':41,'hybrid':53}[mode])
weights=[]
for j in members:
 for sign in (-1,1):
  w=np.zeros(F,np.float32);w[j]=sign;weights.append(w)
for i in range(650):
 w=np.zeros(F,np.float32)
 js=rng.choice(members,int(rng.integers(2,min(6,len(members))+1)),replace=False)
 w[js]=rng.uniform(.15,2.,len(js))*rng.choice([-1,1],len(js))
 weights.append(w)
weights=np.asarray(weights,np.float32)
def choose(mat,w,eligible,pen):
 scores=np.einsum('tnf,bf->btn',mat,w,optimize=True)
 scores=np.where(eligible[None],scores,-1e8)
 B,T,_=scores.shape
 out=np.empty((B,T,3),np.int16)
 ii=np.arange(B)[:,None];tt=np.arange(T)[None,:]
 for step in range(3):
  ix=np.argmax(scores,axis=2)
  out[:,:,step]=ix;scores[ii,tt,ix]=-1e8
  if pen:
   sh=(head[None,None,:]==head[ix][:,:,None])
   st=(tail[None,None,:]==tail[ix][:,:,None])
   scores-=pen*(sh+st)
 return out
best=None
for pen in (0,.2,.5):
 for st in range(0,len(weights),40):
  w=weights[st:st+40]
  chosen=choose(feat[:500],w,valid[:500],pen)
  nh=np.take_along_axis(ct[first:first+500][None],chosen,axis=2).sum(2)
  ys=nh>0;days=ys.sum(1)
  balance=np.minimum(ys[:,:250].sum(1),ys[:,250:].sum(1))
  flashes=nh.sum(1)
  for j in range(len(w)):
   key=(int(days[j]),int(balance[j]),int(flashes[j]))
   if best is None or key>best[0]:best=(key,pen,st+j)
key,pen,index=best
pred=choose(feat[500:],weights[index:index+1],valid[500:],pen)[0]
nh=np.take_along_axis(ct[first+500:],pred,axis=1).sum(1)
out={'mode':mode,'rows':N,'latest':rows[-1]['date'],
'validation':[rows[first]['date'],rows[first+499]['date']],
'holdout':[rows[first+500]['date'],rows[-1]['date']],
'model_variants':len(weights)*3,'excluded_both_previous_days':True,
'train_days':key[0],'holdout_days':int((nh>0).sum()),'holdout_nhay':int(nh.sum()),
'days_2plus':int((nh>=2).sum()),'days_3plus':int((nh>=3).sum()),
'first_half':int((nh[:250]>0).sum()),'second_half':int((nh[250:]>0).sum()),
'last_date_three':[f'{int(v):02d}' for v in sorted(pred[-1])],
'weights':{names[i]:round(float(weights[index,i]),3) for i in np.flatnonzero(weights[index])},
'penalty':pen,'target_reached':bool((nh>0).sum()>=360),'deployed':False}
print('XSMB_HAZARD_BACKTEST='+json.dumps(out,ensure_ascii=False,separators=(',',':')),flush=True)
