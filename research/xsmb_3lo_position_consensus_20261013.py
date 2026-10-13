#!/usr/bin/env python3
"""XSMB 3-number rolling template-consensus study; strictly earlier information.
500 dates tune policy, next 500 dates evaluate without using their outcomes
in policy selection. Experiments never alter main tool, bot, or customers.
"""
import csv,io,json,sys,urllib.request,time
import numpy as np
MODE=sys.argv[1] if len(sys.argv)>1 else 'stable'
assert MODE in ('recent','long','stable','momentum')
u='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
rows=list(csv.DictReader(io.StringIO(urllib.request.urlopen(u,timeout=40).read().decode('utf-8-sig'))))
cols=list(rows[0].keys())[1:]
if rows[-1]['date']=='2026-10-12':
 last=['53618','54279','01658','99875','58777','33062','70578','29945','03967',
 '90070','1440','4471','5218','7377','8274','4475','3487','5399',
 '5678','2717','719','114','363','78','95','84','51']
 assert len(last)==27
 rows.append(dict(date='2026-10-13',**dict(zip(cols,last))))
assert len(cols)==27 and len(rows)>4000 and rows[-1]['date']>='2026-10-13'
n=len(rows);start=n-2000
raw=np.array([[int(r[x][-2:]) for x in cols] for r in rows],dtype=np.uint8)
freq=np.zeros((n,100),dtype=np.uint8)
for i in range(n):freq[i]=np.bincount(raw[i],minlength=100)
presence=freq>0
L=np.array([1,2,3,5,7],dtype=np.int16)
headLag=np.repeat(L,5*27*27)
tailLag=np.tile(np.repeat(L,27*27),5)
hp=np.tile(np.repeat(np.arange(27,dtype=np.int16),27),25)
tp=np.tile(np.arange(27,dtype=np.int16),25*27)
m=len(hp)
assert m==18225 and len(headLag)==m
H=np.empty((2000,m),dtype=np.uint8)
P=np.empty_like(H)
ts=time.monotonic()
for i,t in enumerate(range(start,n)):
 pred=(raw[t-headLag,hp]//10)*10+(raw[t-tailLag,tp]%10)
 P[i]=pred;H[i]=presence[t,pred]
prefix=np.vstack((np.zeros((1,m),np.int16),H.cumsum(axis=0,dtype=np.int16)))
heads=np.arange(100)//10;tails=np.arange(100)%10
variants=[(k,alpha,pen) for k in (20,50,100,250,500) for alpha in (0.,.5,1.) for pen in (0.,.08,.2)]
V=len(variants)
hits=np.zeros((V,1000),np.int16)
picks=np.zeros((V,3),np.uint8)
for i in range(1000,2000):
 t=start+i
 rates={}
 for w in (90,250,500,1000):
  rates[w]=(prefix[i]-prefix[i-w]).astype(np.float32)/w
 if MODE=='recent':
  ranking=.7*rates[90]+.3*rates[250]
 elif MODE=='long':
  ranking=.65*rates[500]+.35*rates[1000]
 elif MODE=='stable':
  ranking=np.minimum(np.minimum(rates[90],rates[250]),rates[500])
 else:
  ranking=rates[250]+.9*(rates[90]-rates[500])
 prev_two=presence[t-1]&presence[t-2]
 candidate_num=P[i]
 numfreq=freq[t]
 for k in (20,50,100,250,500):
  # Select templates by strictly historical success at i.
  selected=np.argpartition(ranking,-k)[-k:]
  selected=selected[np.lexsort((selected,-ranking[selected]))]
  weights=np.maximum(ranking[selected]-.17,.002)
  today=candidate_num[selected]
  vote=np.bincount(today,weights=weights,minlength=100)
  count=np.bincount(today,minlength=100)
  for alpha in (0.,.5,1.):
   score=vote/np.maximum(1.,count.astype(float))**alpha
   score=np.where(prev_two,-1e8,score)
   scale=max(float(np.max(score)),.005)
   for pen in (0.,.08,.2):
    p=variants.index((k,alpha,pen))
    s=score.copy()
    three=[]
    for j in range(3):
     best=int(np.argmax(s))
     three.append(best)
     s[best]=-1e8
     if pen:
      near=(heads==heads[best]).astype(float)+(tails==tails[best]).astype(float)
      s-=pen*scale*near
    hits[p,i-1000]=int(numfreq[three].sum())
    if i==1999:picks[p]=three
 if (i-999)%250==0:
  print('XSMB_TEMPLATE_CONSENSUS_PROGRESS',MODE,i-999,'/1000','sec',round(time.monotonic()-ts,2),flush=True)
# Select policy ONLY on first 500 chronological dates.
result=[]
for index,settings in enumerate(variants):
 train=hits[index,:500];test=hits[index,500:]
 trainhits=int(np.count_nonzero(train))
 trainhalf=int(min(np.count_nonzero(train[:250]),np.count_nonzero(train[250:])))
 result.append((trainhits,trainhalf,int(train.sum()),index))
result.sort(reverse=True)
bestidx=result[0][3]
def stats(x):
 return {'days':int(np.count_nonzero(x)),'nhay':int(x.sum()),
 'days2plus':int(np.sum(x>=2)),'days3plus':int(np.sum(x>=3)),
 'first250':int(np.count_nonzero(x[:250])),'last250':int(np.count_nonzero(x[250:]))}
sel=hits[bestidx]
out={'mode':MODE,'source_rows':n,'source_last_date':rows[-1]['date'],
'templates':m,'policy_variants':V,
'validation_dates':[rows[n-1000]['date'],rows[n-501]['date']],
'holdout_dates':[rows[n-500]['date'],rows[-1]['date']],
'selected_policy':{'k':variants[bestidx][0],'alpha':variants[bestidx][1],
 'diversity_penalty':variants[bestidx][2]},
'validation':stats(sel[:500]),'holdout':stats(sel[500:]),
'holdout_first250':int(np.count_nonzero(sel[500:750])),
'holdout_last250':int(np.count_nonzero(sel[750:])),
'last_day_numbers':[f'{int(x):02d}' for x in sorted(picks[bestidx])],
'best_other_holdout':max(stats(hits[idx,500:])['days'] for *_,idx in result[:10]),
'selection':'validation only; no test-day information in forecasts',
'exclude_two_previous_actual_days':True,'target_360_met':stats(sel[500:])['days']>=360,
'production_changed':False,'runtime_sec':round(time.monotonic()-ts,2)}
print('XSMB_TEMPLATE_CONSENSUS_RESULT='+json.dumps(out,ensure_ascii=False,separators=(',',':')),flush=True)
