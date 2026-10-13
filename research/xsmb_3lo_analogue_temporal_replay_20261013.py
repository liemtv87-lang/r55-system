#!/usr/bin/env python3
"""Rolling ensemble of historical analogue models, 3 XSMB numbers each day.
Select all parameters on earlier 500 days only; evaluate latest 500.
All features and source samples precede their forecast date.
Research-only; never write live snapshots or Telegram data.
"""
import csv,io,json,sys,urllib.request,time
import numpy as np
SHIFT=int(sys.argv[1]) if len(sys.argv)>1 else 1000
assert SHIFT in (1000,2000,3000,4000)
MODE='diverse'  # Current validation-selected family; independently recalibrate within each older period.
url='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
rows=list(csv.DictReader(io.StringIO(urllib.request.urlopen(url,timeout=35).read().decode('utf-8-sig'))))
cols=list(rows[0])[1:]
if rows[-1]['date']=='2026-10-12':
 known=['53618','54279','01658','99875','58777','33062','70578','29945','03967','90070',
 '1440','4471','5218','7377','8274','4475','3487','5399','5678','2717','719','114','363','78','95','84','51']
 rows.append(dict(date='2026-10-13',**dict(zip(cols,known))))
assert len(rows)>3500 and len(cols)==27
D=np.array([[int(r[c][-2:]) for c in cols] for r in rows],np.uint8)
n=len(D);first=n-1000-SHIFT
assert first>=1001
freq=np.zeros((n,100),np.uint8)
for t in range(n):freq[t]=np.bincount(D[t],minlength=100)
present=(freq>0).astype(np.float32)
head=np.array([np.bincount(x//10,minlength=10) for x in D],np.float32)
tail=np.array([np.bincount(x%10,minlength=10) for x in D],np.float32)
pre=np.vstack((np.zeros((1,100),np.float32),present.cumsum(axis=0)))
digitsH=np.arange(100)//10;digitsT=np.arange(100)%10
if MODE=='blend':
 weights=[(a/10,1-a/10,0,0) for a in range(11)]
elif MODE=='ranks':
 weights=[(a/10,1-a/10,0,0) for a in range(11)]
elif MODE=='diverse':
 weights=[(a/10,1-a/10,0,0) for a in range(11)]
else:
 weights=[(a/10,1-a/10,0,0) for a in range(11)]
# Model channel order: hybrid, positions, numbers, digits
weights+= [(a/10,(10-a-b)/10,b/10,0) for a in range(2,9,2) for b in range(2,9-a,2)]
weights+= [(a/10,(10-a-b)/10,0,b/10) for a in range(2,9,2) for b in range(2,9-a,2)]
weights+=[(.35,.35,.15,.15),(.4,.4,.1,.1),(.25,.5,.15,.1)]
variants=[(i,pen) for i in range(len(weights)) for pen in (0.,.15,.35)]
outcomes=np.zeros((len(variants),1000),np.uint8)
lastpicks=np.zeros((len(variants),3),np.uint8)
time0=time.monotonic()
def norm(a):
 return (a-a.mean())/max(float(a.std()),1e-5)
for k,t in enumerate(range(first,first+1000)):
 j=np.arange(t-1000,t)
 samen=norm(present[j-1]@present[t-1])
 samed=norm(-np.sum((head[j-1]-head[t-1])**2+(tail[j-1]-tail[t-1])**2,axis=1))
 raw=D[j-1];prev=D[t-1]
 samepos=norm(np.sum(raw//10==prev//10,axis=1)+np.sum(raw%10==prev%10,axis=1)+2*np.sum(raw==prev,axis=1))
 sim=[.4*samen+.3*samed+.3*samepos,samepos,samen,samed]
 meta=[(500,10,2.),(1000,30,.35),(250,30,.8),(500,30,.8)]
 four=[]
 for similarities,(win,neighbors,temp) in zip(sim,meta):
  score=similarities[-win:]
  ix=np.argpartition(score,-neighbors)[-neighbors:]
  value=score[ix]
  wei=np.exp(np.clip((value-value.max())/temp,-30,0))
  estimate=np.asarray(wei@present[j[-win:][ix]]/wei.sum()+.07*((pre[t]-pre[t-250])/250-.24))
  four.append(norm(estimate))
 four=np.stack(four,axis=0)
 ranks=np.empty_like(four)
 for q in range(4):
  ranks[q,np.argsort(four[q])]=np.arange(100)/99
 allowed=~((freq[t-1]>0)&(freq[t-2]>0))
 diversityLast=len(np.unique(D[t-1]))
 for v,(idx,pen) in enumerate(variants):
  w=np.asarray(weights[idx],float)
  if MODE=='adaptive':
   w=w.copy()
   # Whether yesterday had unusually diverse result numbers is known before target day.
   factor=1.25 if diversityLast>=24 else .75
   w[0]*=factor
   w/=max(w.sum(),1e-8)
  if MODE=='ranks':scores=w@ranks
  else:scores=w@four
  scores=np.where(allowed,scores,-1e8)
  sc=scores.copy()
  chosen=[]
  for slot in range(3):
   if MODE=='diverse' and slot<2:
    specialist=four[slot].copy()
    specialist[~allowed]=-1e8
    specialist[chosen]=-1e8
    jx=int(np.argmax(specialist))
   else:jx=int(np.argmax(sc))
   chosen.append(jx)
   sc[jx]=-1e8
   if pen:
    sc-=pen*((digitsH==digitsH[jx]).astype(float)+(digitsT==digitsT[jx]).astype(float))
  outcomes[v,k]=int(freq[t,chosen].sum())
  if k==999:lastpicks[v]=chosen
 if k in (249,499,749,999):
  print('XSMB_ENSEMBLE_PROGRESS',MODE,k+1,'/1000',round(time.monotonic()-time0,2),flush=True)
ranked=[]
for v in range(len(variants)):
 h=outcomes[v,:500];yes=h>0
 ranked.append((int(yes.sum()),min(int(yes[:250].sum()),int(yes[250:].sum())),int(h.sum()),v))
ranked.sort(reverse=True)
champ=ranked[0][3]
def stat(h):
 return {'days':int((h>0).sum()),'nhay':int(h.sum()),'days2plus':int((h>=2).sum()),
 'days3plus':int((h>=3).sum()),'first250':int((h[:250]>0).sum()),'last250':int((h[250:]>0).sum())}
q={'mode':MODE,'source_rows':n,'source_last':rows[-1]['date'],'evaluated_last_date':rows[first+999]['date'],
'validation_dates':[rows[first]['date'],rows[first+499]['date']],
'holdout_dates':[rows[first+500]['date'],rows[first+999]['date']],
'shift_days':SHIFT,
'policies':len(variants),'selected_weights':weights[variants[champ][0]],
'selected_diversity_penalty':variants[champ][1],
'validation':stat(outcomes[champ,:500]),'holdout':stat(outcomes[champ,500:]),
'last_day_three':[f'{int(x):02d}' for x in sorted(lastpicks[champ])],
'top10_holdout_days':[int((outcomes[v,500:]>0).sum()) for *_,v in ranked[:10]],
'research_only':True,'target_360_met':stat(outcomes[champ,500:])['days']>=360,
'seconds':round(time.monotonic()-time0,2)}
print('XSMB_ANALOG_TEMPORAL_REPLAY_RESULT='+json.dumps(q,ensure_ascii=False,separators=(',',':')),flush=True)
