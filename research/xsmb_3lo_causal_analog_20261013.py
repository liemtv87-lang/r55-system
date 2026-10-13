#!/usr/bin/env python3
"""Three XSMB numbers from past-result nearest-neighbor analogues.
All 500 validation and 500 evaluation target draws predicted from strictly
earlier actual draws; target and future outcomes never used in model scores.
Research only; never mutate production tool, Telegram or locked snapshots.
"""
import csv,io,json,sys,urllib.request,time
import numpy as np
MODE=sys.argv[1] if len(sys.argv)>1 else 'hybrid'
assert MODE in ('numbers','digits','positions','hybrid')
u='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
rows=list(csv.DictReader(io.StringIO(urllib.request.urlopen(u,timeout=35).read().decode('utf-8-sig'))))
cols=list(rows[0])[1:]
if rows[-1]['date']=='2026-10-12':
 oct13=['53618','54279','01658','99875','58777','33062','70578','29945','03967','90070',
 '1440','4471','5218','7377','8274','4475','3487','5399','5678','2717','719','114','363','78','95','84','51']
 rows.append(dict(date='2026-10-13',**dict(zip(cols,oct13))))
assert len(cols)==27 and len(rows)>=3000 and rows[-1]['date']>='2026-10-13'
D=np.array([[int(r[c][-2:]) for c in cols] for r in rows],np.uint8)
n=len(D);first=n-1000
freq=np.zeros((n,100),np.uint8)
for t in range(n):freq[t]=np.bincount(D[t],minlength=100)
present=(freq>0).astype(np.float32)
head=np.array([np.bincount(x//10,minlength=10) for x in D],np.float32)
tail=np.array([np.bincount(x%10,minlength=10) for x in D],np.float32)
prior=np.vstack((np.zeros((1,100),np.float32),present.cumsum(axis=0)))
headnums=np.arange(100)//10;tailnums=np.arange(100)%10
settings=[(win,k,temp,pen) for win in (250,500,1000) for k in (10,30,100)
          for temp in (.35,.8,2.) for pen in (0.,.025,.06)]
R=len(settings)
records=np.zeros((R,1000),np.uint8)
picks=np.zeros((R,3),np.uint8)
expected=0.
t0=time.monotonic()
for i,t in enumerate(range(first,n)):
 j=np.arange(t-1000,t,dtype=int)
 sample=D[j-1];reference=D[t-1]
 sameNumber=present[j-1]@present[t-1]
 digitHead=np.sum((head[j-1]-head[t-1])**2,axis=1)
 digitTail=np.sum((tail[j-1]-tail[t-1])**2,axis=1)
 digitSimilarity=-(digitHead+digitTail)
 positionSimilarity=np.sum(sample//10==reference//10,axis=1)+np.sum(sample%10==reference%10,axis=1)
 positionSimilarity=positionSimilarity+2*np.sum(sample==reference,axis=1)
 # Normalize each distance using only earlier historical analogues.
 def scaled(a):
  return (a-a.mean())/max(float(a.std()),1e-4)
 if MODE=='numbers': similarity=scaled(sameNumber)
 elif MODE=='digits': similarity=scaled(digitSimilarity)
 elif MODE=='positions':similarity=scaled(positionSimilarity)
 else: similarity=.4*scaled(sameNumber)+.3*scaled(digitSimilarity)+.3*scaled(positionSimilarity)
 permitted=~((freq[t-1]>0)&(freq[t-2]>0))
 base=(prior[t]-prior[t-250])/250
 if i>=500:
  N=int(permitted.sum());K=int((permitted&(freq[t]>0)).sum())
  expected+=1-((N-K)*(N-K-1)*(N-K-2))/(N*(N-1)*(N-2))
 for win in (250,500,1000):
  sl=j[-win:];sim=similarity[-win:]
  for k in (10,30,100):
   order=np.argpartition(sim,-k)[-k:]
   xx=sim[order]
   y=present[sl[order]]
   for temp in (.35,.8,2.):
    w=np.exp(np.clip((xx-xx.max())/temp,-35,0))
    score=np.asarray(w@y/w.sum()+.07*(base-.24),float)
    score[~permitted]=-1e8
    for pen in (0.,.025,.06):
     v=settings.index((win,k,temp,pen))
     sc=score.copy()
     chosen=[]
     for z in range(3):
      b=int(np.argmax(sc));chosen.append(b);sc[b]=-1e8
      if pen:sc-=pen*((headnums==headnums[b])+(tailnums==tailnums[b]))
     records[v,i]=int(min(255,freq[t,chosen].sum()))
     if i==999:picks[v]=chosen
 if i in (249,499,749,999):
  print('XSMB_ANALOG_PROGRESS',MODE,i+1,'/1000',round(time.monotonic()-t0,2),flush=True)
# policy must be selected exclusively using earlier 500 days
ranking=[]
for v,z in enumerate(records):
 train=z[:500]
 success=train>0
 key=(int(success.sum()),min(int(success[:250].sum()),int(success[250:].sum())),int(train.sum()),v)
 ranking.append(key)
ranking.sort(reverse=True)
champ=ranking[0][3]
def summary(h):
 return {'days':int((h>0).sum()),'nhay':int(h.sum()),'days2plus':int((h>=2).sum()),
 'days3plus':int((h>=3).sum()),'first250':int((h[:250]>0).sum()),'last250':int((h[250:]>0).sum())}
out={'mode':MODE,'source_rows':n,'last_date':rows[-1]['date'],
 'validation_dates':[rows[first]['date'],rows[first+499]['date']],
 'evaluation_dates':[rows[first+500]['date'],rows[-1]['date']],
 'policies':R,'policy':{'window':settings[champ][0],'neighbors':settings[champ][1],
 'temperature':settings[champ][2],'digit_diversity':settings[champ][3]},
 'validation':summary(records[champ,:500]),'evaluation':summary(records[champ,500:]),
 'random_3_eligible_expected_hit_days':round(expected,2),
 'last_day_three':[f'{int(x):02d}' for x in sorted(picks[champ])],
 'holdout_of_10_validation_leaders':[summary(records[x[3],500:])['days'] for x in ranking[:10]],
 'exclude_two_prior_day_overlap':True,'target_360_met':summary(records[champ,500:])['days']>=360,
 'production_changed':False,'seconds':round(time.monotonic()-t0,2)}
print('XSMB_ANALOG_RESULT='+json.dumps(out,ensure_ascii=False,separators=(',',':')),flush=True)
