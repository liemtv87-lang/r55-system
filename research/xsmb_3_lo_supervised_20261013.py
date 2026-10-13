#!/usr/bin/env python3
"""XSMB 3 single tickets: supervised nonlinear predictive model research.
Training: all eligible days through the 500-day validation start.
Validation: preceding 500. Test: latest 500. No test-day info in features.
"""
import csv, io, json, os, sys, urllib.request, datetime
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, ExtraTreesClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import log_loss

URL='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
rows=list(csv.DictReader(io.StringIO(urllib.request.urlopen(URL,timeout=40).read().decode('utf-8-sig'))))
cols=list(rows[0].keys())[1:]
raw=np.asarray([[int(r[c][-2:]) for c in cols] for r in rows],dtype=np.int16)
n=len(raw);start=2500;v=n-1000;test=n-500
assert n>=4000 and raw.shape[1]==27
print('DATA_READY rows',n,'features_start',rows[start]['date'],'validation',rows[v]['date'],'test',rows[test]['date'],flush=True)
counts=np.zeros((n,100),dtype=np.uint8)
for t in range(n):counts[t]=np.bincount(raw[t],minlength=100).astype(np.uint8)
hits=(counts>0).astype(np.uint8)
cum=np.vstack((np.zeros((1,100),dtype=np.int32),np.cumsum(counts.astype(np.int32),axis=0)))
cumh=np.vstack((np.zeros((1,100),dtype=np.int32),np.cumsum(hits.astype(np.int32),axis=0)))
nums=np.arange(100);heads=nums//10;tails=nums%10
rev=10*tails+heads
dows=np.array([datetime.date.fromisoformat(r['date']).weekday() for r in rows])
dms=np.array([int(r['date'][-2:]) for r in rows])
names=['hit7','hit14','hit30','hit60','hit120','hit250','hit500','hit1000','hit2500',
'nhay7','nhay14','nhay30','nhay120','last1','last2','reverse','gap','recent14',
'head14','head60','head250','tail14','tail60','tail250','prev_head','prev_tail',
'weekday52','weekday156','dom24','sumpos','diffpos','triplepos','position_repeat',
'last_special','last_first','number','digit_sum','digit_diff','head','tail','dow']
f=len(names)
features=np.empty((n-start,100,f),dtype=np.float32)
for t in range(start,n):
 x=[]
 for w in [7,14,30,60,120,250,500,1000,2500]:x.append((cumh[t]-cumh[t-w])/w)
 for w in [7,14,30,120]:x.append((cum[t]-cum[t-w])/w)
 x.extend([counts[t-1],counts[t-2],hits[t-1,rev]])
 gap=np.full(100,150,dtype=np.float32);untouched=np.ones(100,dtype=bool)
 for back in range(1,151):
  nz=(hits[t-back]>0)&untouched;gap[nz]=back-1;untouched[nz]=False
  if not untouched.any():break
 x.extend([gap,cumh[t]-cumh[t-14]])
 for w in [14,60,250]:
  fr=cumh[t]-cumh[t-w];x.append(np.bincount(heads,weights=fr,minlength=10)[heads])
 for w in [14,60,250]:
  fr=cumh[t]-cumh[t-w];x.append(np.bincount(tails,weights=fr,minlength=10)[tails])
 x.append(np.bincount(heads,weights=counts[t-1],minlength=10)[heads])
 x.append(np.bincount(tails,weights=counts[t-1],minlength=10)[tails])
 dw=np.flatnonzero(dows[:t]==dows[t])
 for w in [52,156]:
  choose=dw[-w:];x.append(hits[choose].mean(axis=0) if len(choose) else np.zeros(100))
 dm=np.flatnonzero(dms[:t]==dms[t])[-24:]
 x.append(hits[dm].mean(axis=0) if len(dm) else np.zeros(100))
 sums=np.zeros(100,dtype=np.int16);diff=np.zeros(100,dtype=np.int16)
 tri=np.zeros(100,dtype=np.int16)
 for k in range(27):
  a=int(raw[t-1,k]);b=int(raw[t-2,k]);c=int(raw[t-3,k])
  sums[(a+b)%100]+=1;diff[(a-b+100)%100]+=1;tri[(a+b+c)%100]+=1
 x.extend([sums,diff,tri,counts[t-1]+counts[t-2]])
 x.extend([hits[t-1,int(raw[t-1,0])]*np.float32(nums==raw[t-1,0]),
           np.float32(nums==raw[t-1,1]),nums,np.floor(nums/10)+nums%10,
           np.abs(heads-tails),heads,tails,np.full(100,dows[t],dtype=np.float32)])
 assert len(x)==f,(len(x),f)
 features[t-start]=np.stack(x,axis=-1).astype(np.float32)
 if (t-start)%1200==0:print('FEATURE_PROGRESS',t-start,flush=True)

# Scale independently; only train set gets fitted scalers.
X=features.reshape(-1,f);Y=hits[start:].reshape(-1)
cutTrain=(v-start)*100;cutValid=(test-start)*100
Xt=X[:cutTrain];Yt=Y[:cutTrain]
Xv=X[cutTrain:cutValid];Yv=Y[cutTrain:cutValid]
Xh=X[cutValid:];Yh=Y[cutValid:]
modelname=sys.argv[1] if len(sys.argv)>1 else 'hgb80'
if modelname=='hgb60':
 model=HistGradientBoostingClassifier(max_iter=60,max_leaf_nodes=15,learning_rate=0.05,
        l2_regularization=8.0,max_bins=128,random_state=20261013)
elif modelname=='hgb120':
 model=HistGradientBoostingClassifier(max_iter=120,max_leaf_nodes=31,learning_rate=0.05,
        l2_regularization=15.0,max_bins=128,random_state=20261013)
elif modelname=='extratrees':
 model=ExtraTreesClassifier(n_estimators=150,max_features=0.6,min_samples_leaf=55,
        n_jobs=-1,random_state=20261013)
elif modelname=='logistic':
 model=make_pipeline(StandardScaler(),LogisticRegression(C=0.1,max_iter=170,
        solver='lbfgs',random_state=20261013))
else:raise ValueError(modelname)
print('TRAIN_MODEL',modelname,'rows',len(Xt),'features',f,flush=True)
model.fit(Xt,Yt)
def report(data,label):
 p=model.predict_proba(data)[:,1].reshape(-1,100)
 choose=np.argpartition(p,-3,axis=1)[:,-3:]
 observed=counts[v: test] if label=='validation' else counts[test:]
 hit=np.take_along_axis(observed,choose,axis=1).sum(axis=1)
 yes=hit>0
 return {'days':int(np.sum(yes)),'rate':round(100*np.mean(yes),3),
   'nhay':int(np.sum(hit)),'days2plus':int(np.sum(hit>=2)),
   'first250':int(np.sum(yes[:250])),'last250':int(np.sum(yes[250:])),
   'last3':[f'{int(x):02d}' for x in np.sort(choose[-1])],
   'logloss':round(float(log_loss(hits[v:test] if label=='validation' else hits[test:],p)),6)}
result={'model':modelname,'train_days':v-start,'train_start':rows[start]['date'],
 'train_end':rows[v-1]['date'],'validation_dates':[rows[v]['date'],rows[test-1]['date']],
 'test_dates':[rows[test]['date'],rows[-1]['date']],
 'validation':report(Xv,'validation'),'holdout':report(Xh,'holdout'),
 'features':names,'target_met':False}
result['target_met']=result['holdout']['days']>=360
print('XSMB_SUPERVISED_RESULT='+json.dumps(result,ensure_ascii=False,separators=(',',':')),flush=True)
