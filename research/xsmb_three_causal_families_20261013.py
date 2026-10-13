#!/usr/bin/env python3
"""Strict chronological XSMB 3-number research, four independent causal families.
Choose by older 500 actual results; evaluate next 500 without later-day leakage.
Never writes any public prediction, customer data, or bot output.
"""
import csv,io,json,sys,urllib.request,datetime
import numpy as np
mode=sys.argv[1] if len(sys.argv)>1 else 'mixed'
assert mode in ('contrarian','bridges','seasonal','mixed')
src='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
rows=list(csv.DictReader(io.StringIO(urllib.request.urlopen(src,timeout=35).read().decode('utf-8-sig'))))
cols=list(rows[0])[1:]
# 13 October 2026 completed draw cross-checked on sxmb.com and xskt.net.
# Append exactly once until the third-party CSV catches up.
if rows[-1]['date']=='2026-10-12':
 oct13=['53618','54279','01658','99875','58777','33062','70578',
 '29945','03967','90070','1440','4471','5218','7377','8274',
 '4475','3487','5399','5678','2717','719','114','363','78',
 '95','84','51']
 assert len(oct13)==27
 rows.append(dict(date='2026-10-13',**dict(zip(cols,oct13))))
dates=[datetime.date.fromisoformat(r['date']) for r in rows]
assert len(cols)==27 and len(rows)>3500 and dates==sorted(dates)
assert dates[-1]<=datetime.date.today()
raw=np.array([[int(r[k][-2:]) for k in cols] for r in rows],np.uint8)
n=len(raw);first=n-1000
counts=np.zeros((n,100),np.uint8)
for t in range(n):counts[t]=np.bincount(raw[t],minlength=100)
present=counts>0
cp=np.vstack([np.zeros((1,100),np.int32),present.astype(np.int32).cumsum(0)])
nums=np.arange(100);heads=nums//10;tails=nums%10
names=['f7','f14','f30','f60','f120','f250','f500','f1000','f2500',
'prev','prev2','rev','gap','head14','tail14','head250','tail250',
'weekday','calendar','sum','diff','trip','headprev','tailprev']
F=len(names)
features=np.zeros((1000,100,F),np.float32)
dow=np.array([d.weekday() for d in dates]);dom=np.array([d.day for d in dates])
for i,t in enumerate(range(first,n)):
 x=[]
 for w in (7,14,30,60,120,250,500,1000,2500):x.append((cp[t]-cp[t-w])/w)
 x.extend([present[t-1],present[t-2],present[t-1,tails*10+heads]])
 gap=np.full(100,65.,np.float32)
 for d in range(1,66):
  at=present[t-d];gap[(gap==65)&at]=d-1
 x.append(np.minimum(gap,40))
 for w in (14,250):
  freq=cp[t]-cp[t-w]
  x.append(np.bincount(heads,weights=freq,minlength=10)[heads])
  x.append(np.bincount(tails,weights=freq,minlength=10)[tails])
 ix=np.flatnonzero(dow[:t]==dow[t])[-52:]
 x.append(present[ix].mean(axis=0) if len(ix) else np.zeros(100))
 ix=np.flatnonzero(dom[:t]==dom[t])[-24:]
 x.append(present[ix].mean(axis=0) if len(ix) else np.zeros(100))
 a=raw[t-1].astype(int);b=raw[t-2].astype(int);c=raw[t-3].astype(int)
 x.extend([np.bincount((a+b)%100,minlength=100),
           np.bincount((a-b)%100,minlength=100),
           np.bincount((a+b+c)%100,minlength=100)])
 x.append(np.bincount(heads,weights=counts[t-1],minlength=10)[heads])
 x.append(np.bincount(tails,weights=counts[t-1],minlength=10)[tails])
 features[i]=np.stack(x,axis=1).astype(np.float32)
mean=features.mean(axis=1,keepdims=True);std=features.std(axis=1,keepdims=True)
features=np.clip((features-mean)/np.maximum(std,1e-4),-5,5)
valid=np.array([~(present[t-1]&present[t-2]) for t in range(first,n)])
actual=counts[first:]
groups={
 'contrarian':['f7','f14','f30','f60','f120','f250','f500','f1000','f2500','gap','head250','tail250'],
 'bridges':['f120','f250','f500','prev','prev2','rev','sum','diff','trip','headprev','tailprev'],
 'seasonal':['f120','f250','f500','weekday','calendar','head14','tail14','head250','tail250'],
 'mixed':names
}
members=np.array([names.index(q) for q in groups[mode]])
rng=np.random.default_rng({'contrarian':101,'bridges':202,'seasonal':303,'mixed':404}[mode])
weights=[]
for j in members:
 for sign in [-1,1]:
  w=np.zeros(F,np.float32);w[j]=sign;weights.append(w)
for _ in range(1250):
 w=np.zeros(F,np.float32)
 k=int(rng.integers(2,min(8,len(members))+1))
 js=rng.choice(members,k,replace=False)
 w[js]=rng.choice([-1,1],size=k)*rng.uniform(.2,2.0,size=k)
 if mode=='contrarian':w[names.index('f250')]-=rng.uniform(.2,2.)
 weights.append(w)
weights=np.array(weights,np.float32)
def choose(f,w,allowed,pen):
 scores=np.einsum('tnf,bf->btn',f,w,optimize=True)
 scores=np.where(allowed[None,:,:],scores,-1e7)
 B,T,_=scores.shape
 out=np.empty((B,T,3),np.int16)
 bi=np.arange(B)[:,None];ti=np.arange(T)[None,:]
 for j in range(3):
  ix=np.argmax(scores,axis=2)
  out[:,:,j]=ix
  scores[bi,ti,ix]=-1e7
  if pen:
   same_head=(heads[None,None,:]==heads[ix][:,:,None])
   same_tail=(tails[None,None,:]==tails[ix][:,:,None])
   scores-=pen*(same_head.astype(np.float32)+same_tail.astype(np.float32))
 return out
leaders=[]
for pen in (0,.15,.4):
 best=None
 for start in range(0,len(weights),48):
  ww=weights[start:start+48]
  ix=choose(features[:500],ww,valid[:500],pen)
  nh=np.take_along_axis(actual[:500][None,:,:],ix,axis=2).sum(2)
  yes=nh>0
  days=yes.sum(1);halves=np.minimum(yes[:,:250].sum(1),yes[:,250:].sum(1))
  flashes=nh.sum(1)
  for k in range(len(ww)):
   candidate=(int(days[k]),int(halves[k]),int(flashes[k]),start+k)
   if best is None or candidate>best:best=candidate
 leaders.append((best,pen))
top,pen=max(leaders,key=lambda a:a[0][:3]);w=weights[top[3]:top[3]+1]
picks=choose(features[500:],w,valid[500:],pen)[0]
nh=np.take_along_axis(actual[500:],picks,axis=1).sum(1)
yes=nh>0
print('XSMB_CAUSAL_FAMILY_RESULT='+json.dumps({
'mode':mode,'source_rows':n,'source_last':str(dates[-1]),
'validation_dates':[str(dates[first]),str(dates[first+499])],
'holdout_dates':[str(dates[first+500]),str(dates[-1])],
'model_variants':len(weights)*3,'hard_exclude_both_previous_draws':True,
'selection':'choose hyperparameters on older 500 only',
'validation_days':top[0],'validation_balance_half':top[1],'validation_nhay':top[2],
'holdout_days':int(yes.sum()),'holdout_nhay':int(nh.sum()),
'holdout_days_2plus':int((nh>=2).sum()),'holdout_days_3plus':int((nh>=3).sum()),
'holdout_first_half':int(yes[:250].sum()),'holdout_second_half':int(yes[250:].sum()),
'last_day_three':[f'{int(z):02d}' for z in np.sort(picks[-1])],
'best_weights':{names[j]:round(float(w[0,j]),3) for j in np.flatnonzero(w[0])},
'penalty':pen,'target_360_met':bool(yes.sum()>=360),'production_changed':False
},ensure_ascii=False,separators=(',',':')),flush=True)
