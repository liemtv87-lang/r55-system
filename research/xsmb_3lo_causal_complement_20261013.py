#!/usr/bin/env python3
"""XSMB 3-lotto: causally built expert scores, complementarity for 500 heldout dates.
All predictive inputs for date t come solely from draws t-500 ... t-1.
Older 500 dates select policy; last 500 are scored once, no public deployment.
"""
import csv, io, json, sys, time, urllib.request
import numpy as np

MODE=sys.argv[1] if len(sys.argv)>1 else 'coverage'
assert MODE in ('coverage','consensus','bridge','regime')
SRC="https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv"
rows=list(csv.DictReader(io.StringIO(urllib.request.urlopen(SRC,timeout=45).read().decode("utf-8-sig"))))
prizes=list(rows[0])[1:]
assert len(prizes)==27
if rows[-1]['date']=='2026-10-12':
 last=['53618','54279','01658','99875','58777','33062','70578',
       '29945','03967','90070','1440','4471','5218','7377','8274',
       '4475','3487','5399','5678','2717','719','114','363','78',
       '95','84','51']
 rows.append(dict(date='2026-10-13',**dict(zip(prizes,last))))
assert rows[-1]['date']=='2026-10-13' and len(rows)>=3000
D=np.array([[int(row[k][-2:]) for k in prizes] for row in rows],dtype=np.uint8)
N=len(D);START=N-1000
C=np.zeros((N,100),dtype=np.uint8)
for t in range(N):C[t]=np.bincount(D[t],minlength=100)
H=(C>0).astype(np.float32)
prefix=np.vstack([np.zeros((1,100),np.float32),H.cumsum(axis=0)])
nums=np.arange(100)
heads=nums//10;tails=nums%10
hd=np.array([np.bincount(r//10,minlength=10) for r in D],np.float32)
tl=np.array([np.bincount(r%10,minlength=10) for r in D],np.float32)
F=8
X=np.zeros((1000,100,F),np.float32)
cov=np.zeros((1000,100,100),np.float16)
eligible=np.ones((1000,100),bool)
now=time.monotonic()
# The first daily target's models may only inspect prior 500 results.
template_h=np.repeat(np.arange(27),27)
template_t=np.tile(np.arange(27),27)
for i,t in enumerate(range(START,N)):
 begin=t-500
 eligible[i]=~((C[t-1]>0)&(C[t-2]>0))
 fr={w:(prefix[t]-prefix[t-w])/w for w in (14,30,120,250,500)}
 def standardize(a):
  a=np.asarray(a,dtype=np.float32)
  return np.clip((a-a.mean())/max(1e-4,float(a.std())),-4,4)
 X[i,:,0]=standardize(fr[120]-fr[500]*.7)
 X[i,:,1]=standardize(-fr[250]+.25*fr[14])
 freq14=prefix[t]-prefix[t-14]
 headfreq=np.bincount(heads,weights=freq14,minlength=10)
 tailfreq=np.bincount(tails,weights=freq14,minlength=10)
 X[i,:,2]=standardize(headfreq[heads]+tailfreq[tails])
 # Historical analogues compare today's previous result to prior known predecessor.
 js=np.arange(begin+1,t)
 prev=D[js-1]; last=D[t-1]
 pos=(prev//10==last//10).sum(axis=1)+(prev%10==last%10).sum(axis=1)+2*(prev==last).sum(axis=1)
 digit=-np.sum((hd[js-1]-hd[t-1])**2+(tl[js-1]-tl[t-1])**2,axis=1)
 overlap=H[js-1]@H[t-1]
 for channel,dist,neighbors in ((3,pos,25),(4,.45*standardize(pos)+.30*standardize(digit)+.25*standardize(overlap),30)):
  ix=np.argpartition(dist,-neighbors)[-neighbors:]
  v=standardize(dist[ix])
  weight=np.exp(np.clip((v-v.max())/.85,-25,0))
  result=weight@H[js[ix]]/weight.sum()
  X[i,:,channel]=standardize(result)
 # Conditional historic template heads from yesterday + historical tails from day before.
 # 27*27 head/tail templates; rank on the prior 250 actual outcomes only.
 j=np.arange(t-249,t)
 today=(D[t-1,template_h]//10)*10+(D[t-2,template_t]%10)
 pred=(D[j-1][:,template_h]//10)*10+(D[j-2][:,template_t]%10)
 outcome=H[j[:,None],pred].mean(axis=0)
 for channel,topk in ((5,30),(6,100)):
  selected=np.argpartition(outcome,-topk)[-topk:]
  weights=np.maximum(outcome[selected]-.15,.005)
  score=np.bincount(today[selected],weights=weights,minlength=100)
  X[i,:,channel]=standardize(score)
 # gap scaled by past 500 with no day-t input.
 recent=H[t-65:t][::-1]
 has=recent>0
 first=np.where(has.any(axis=0),has.argmax(axis=0),65)
 X[i,:,7]=standardize(-np.abs(first-5)/5-fr[30])
 # 250-prior co-occur correlations, computed before date t.
 hp=H[t-250:t]
 p=hp.mean(axis=0)
 pair=(hp.T@hp)/250
 denom=np.sqrt(np.outer(np.maximum(p*(1-p),.01),np.maximum(p*(1-p),.01)))
 co=np.clip((pair-np.outer(p,p))/denom,-.8,.8)
 np.fill_diagonal(co,0)
 cov[i]=co.astype(np.float16)
 if (i+1)%250==0:
  print('XSMB_COMPLEMENT_PROGRESS',MODE,i+1,'/1000',round(time.monotonic()-now,1),flush=True)

rng=np.random.default_rng({'coverage':315,'consensus':316,'bridge':317,'regime':318}[MODE])
W=[]
if MODE=='coverage':
 for _ in range(400):
  w=rng.uniform(0,1,F)
  w[3:5]*=2
  w/=w.sum()
  W.append(w)
elif MODE=='consensus':
 for _ in range(400):
  w=np.zeros(F)
  idx=rng.choice(F,size=int(rng.integers(3,7)),replace=False)
  w[idx]=rng.uniform(.4,2.,len(idx))
  w/=w.sum()
  W.append(w)
elif MODE=='bridge':
 for _ in range(400):
  w=rng.uniform(0,.4,F)
  w[[5,6]]*=rng.uniform(2,8)
  w/=w.sum()
  W.append(w)
else:
 for _ in range(400):
  w=rng.uniform(0,1,F)
  w[3:5]*=rng.uniform(1,4)
  w/=w.sum()
  W.append(w)
W.extend(np.eye(F))
W=np.array(W,np.float32)

# Other models optimize for total individual hits; this specifically maximizes
# coverage by penalizing numbers historically found together.
variants=[(a,k,pen,headpen) for a in range(len(W))
          for k,pen,headpen in ((0,0.,0.),(1,.15,0.),(2,.4,0.05))]
# Input score may be a smooth weighted channel average (coverage/bridge),
# a consensus rank (consensus) or daily seasonal regime switching (regime).
def score_by_model(w,begin,end):
 feats=X[begin:end]
 if MODE=='consensus':
  ranks=np.argsort(np.argsort(feats,axis=1),axis=1)/99.0
  return np.einsum('tnf,f->tn',ranks,w,optimize=True)
 sc=np.einsum('tnf,f->tn',feats,w,optimize=True)
 if MODE=='regime':
  actual_recent=C[START+begin-1:START+end-1]
  diversity=(actual_recent>0).sum(axis=1)
  boost=(diversity>=23)[:,None]
  sc+=np.where(boost,.24,-.24)*feats[:,:,3]
 return sc

# Faster loop: evaluate one model each time for the full 1000-day sequence.
def run_variant(w,k,pen,headpen):
 sc=score_by_model(w,0,1000).astype(np.float32)
 sc=np.where(eligible,sc,-1e6)
 vals=np.empty((1000,3),np.int16)
 days=np.arange(1000)
 for j in range(3):
  best=sc.argmax(axis=1)
  vals[:,j]=best
  sc[days,best]=-1e6
  if pen:
   overlap=cov[days,best,:].astype(np.float32)
   sc-=pen*overlap
  if headpen:
   sc-=headpen*((heads[None,:]==heads[best,None])+(tails[None,:]==tails[best,None]))
 nh=C[np.arange(START,N)[:,None],vals].sum(axis=1)
 return nh,vals

best=None
# Only first 500 historical dates choose the hyperparameters.
for idx,w in enumerate(W):
 for k,pen,headpen in ((0,0.,0.),(1,.15,0.),(2,.4,.05)):
  hits,_=run_variant(w,k,pen,headpen)
  yes=hits[:500]>0
  quality=(int(yes.sum()),min(int(yes[:250].sum()),int(yes[250:].sum())),int(hits[:500].sum()))
  if best is None or quality>best[0]:
   best=(quality,idx,k,pen,headpen)
quality,ix,k,pen,headpen=best
allhits,allchosen=run_variant(W[ix],k,pen,headpen)
def stats(x):
 return {'days':int((x>0).sum()),'nhay':int(x.sum()),
 'days2plus':int((x>=2).sum()),'days3plus':int((x>=3).sum()),
 'first250':int((x[:250]>0).sum()),'last250':int((x[250:]>0).sum())}
result={
 'mode':MODE,'source_rows':N,'last_source_date':rows[-1]['date'],
 'validation_dates':[rows[START]['date'],rows[START+499]['date']],
 'holdout_dates':[rows[START+500]['date'],rows[-1]['date']],
 'input_history_limit':500,'candidates_examined':len(W)*3,'experts':F,
 'policy_selected_using':'only earlier 500 dates',
 'validation':stats(allhits[:500]),'holdout':stats(allhits[500:]),
 'weights':np.round(W[ix],3).tolist(),'cooccur_penalty':pen,'digit_penalty':headpen,
 'last_day_picks':[f'{int(x):02d}' for x in sorted(allchosen[-1])],
 'exclude_numbers_in_both_previous_actual_results':True,
 'target_met':bool((allhits[500:]>0).sum()>=360),
 'research_only':True,'seconds':round(time.monotonic()-now,2)
}
print('XSMB_CAUSAL_COMPLEMENT_RESULT='+json.dumps(result,ensure_ascii=False,separators=(',',':')),flush=True)
