#!/usr/bin/env python3
"""Strict 500-draw XSMB, selecting three positions with joint-hit diversity.
Choose only from older 500 backtested dates; report later 500 as unseen.
No production change. Date t may read only actual results [t-500,t).
"""
import csv,io,json,sys,urllib.request,time,itertools
import numpy as np
MODE='hybrid'
SHIFT=int(sys.argv[1]) if len(sys.argv)>1 else 1000
assert SHIFT in (1000,2000,3000,4000)
url='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
rows=list(csv.DictReader(io.StringIO(urllib.request.urlopen(url,timeout=40).read().decode('utf-8-sig'))))
cols=list(rows[0])[1:]
if rows[-1]['date']=='2026-10-12':
 oct13=['53618','54279','01658','99875','58777','33062','70578','29945','03967','90070',
 '1440','4471','5218','7377','8274','4475','3487','5399','5678','2717','719','114','363','78','95','84','51']
 rows.append(dict(date='2026-10-13',**dict(zip(cols,oct13))))
assert len(cols)==27 and len(rows)>3500 and rows[-1]['date']=='2026-10-13'
R=np.array([[int(z[k][-2:]) for k in cols] for z in rows],np.uint8)
N=len(R);START=N-1000-SHIFT
assert START>1000
counts=np.zeros((N,100),np.uint8)
for t in range(N):counts[t]=np.bincount(R[t],minlength=100)
hits=(counts>0).astype(np.float32)
heads=np.arange(100)//10;tails=np.arange(100)%10
h=np.array([np.bincount(v//10,minlength=10) for v in R],np.float32)
t=np.array([np.bincount(v%10,minlength=10) for v in R],np.float32)
prefix=np.vstack([np.zeros((1,100),np.float32),hits.cumsum(0)])
S=np.zeros((1000,100),np.float32)
C=np.zeros((1000,100,100),np.float16)
valid=np.zeros((1000,100),bool)
start=time.monotonic()
def norm(a):
 a=np.asarray(a,np.float32)
 return (a-a.mean())/max(.0001,float(a.std()))
for i,d in enumerate(range(START,START+1000)):
 js=np.arange(d-499,d)
 previous=R[js-1];target=R[d-1]
 pos=(previous//10==target//10).sum(1)+(previous%10==target%10).sum(1)+2*(previous==target).sum(1)
 digit=-np.sum((h[js-1]-h[d-1])**2+(t[js-1]-t[d-1])**2,axis=1)
 overlap=hits[js-1]@hits[d-1]
 hybrid=.4*norm(overlap)+.3*norm(digit)+.3*norm(pos)
 base=(prefix[d]-prefix[d-250])/250
 def analog(sim,w,k,temp):
  dist=sim[-w:];inds=np.argpartition(dist,-k)[-k:]
  xx=dist[inds];weight=np.exp(np.clip((xx-xx.max())/temp,-35,0))
  return weight@hits[js[-w:][inds]]/weight.sum()
 pp=norm(analog(pos,499,30,.35)+.07*(base-.24))
 hb=norm(analog(hybrid,499,10,2.)+.07*(base-.24))
 if MODE=='hybrid':sc=hb
 elif MODE=='positional':sc=pp
 elif MODE=='rank':
  def rank(a):return np.argsort(np.argsort(a)).astype(np.float32)/99
  sc=norm(.65*rank(hb)+.35*rank(pp))
 else:sc=norm(.6*hb+.4*pp)
 S[i]=sc
 past=hits[d-250:d]
 p=past.mean(0)
 cc=(past.T@past)/250 - np.outer(p,p)
 var=np.maximum(p*(1-p),.012)
 corr=cc/np.sqrt(np.outer(var,var))
 np.fill_diagonal(corr,0)
 C[i]=np.clip(corr,-.9,.9).astype(np.float16)
 valid[i]=~((counts[d-1]>0)&(counts[d-2]>0))
 if (i+1)%250==0:print('XSMB_DIVERSITY_PROGRESS',MODE,i+1,round(time.monotonic()-start,1),flush=True)
variants=list(itertools.product([0.,.12,.3,.6,1.],[-.3,0.,.15,.35,.7],[0.,.15,.35]))
def evaluate(pen_head,pen_corr,pen_rev):
 sc=S.copy()
 sc=np.where(valid,sc,-1e7)
 choose=np.empty((1000,3),np.int16)
 ix=np.arange(1000)
 for slot in range(3):
  best=sc.argmax(1)
  choose[:,slot]=best
  sc[ix,best]=-1e7
  same=(heads[None,:]==heads[best,None]).astype(float)+(tails[None,:]==tails[best,None]).astype(float)
  sc-=pen_head*same
  sc-=pen_corr*C[ix,best,:].astype(np.float32)
  if pen_rev:
   reversednum=tails[best]*10+heads[best]
   sc[ix,reversednum]-=pen_rev
 target=counts[np.arange(START,START+1000)[:,None],choose].sum(1)
 return target,choose
best=None
for parameters in variants:
 target,values=evaluate(*parameters)
 a=target[:500]>0
 mark=(int(a.sum()),min(int(a[:250].sum()),int(a[250:].sum())),int(target[:500].sum()))
 if best is None or mark>best[0]:
  best=(mark,parameters,target,values)
mark,parameters,target,chosen=best
def stat(v):
 return {'days':int((v>0).sum()),'nhay':int(v.sum()),
  'days2plus':int((v>=2).sum()),'days3plus':int((v>=3).sum()),
  'first250':int((v[:250]>0).sum()),'last250':int((v[250:]>0).sum())}
out={'mode':MODE,'source_rows':N,'source_last':rows[-1]['date'],'evaluated_last_date':rows[START+999]['date'],
 'validation_dates':[rows[START]['date'],rows[START+499]['date']],
 'holdout_dates':[rows[START+500]['date'],rows[START+999]['date']],
 'shift_days':SHIFT,
 'original_policy_fixed_holdout':stat(evaluate(.12,.15,0)[0][500:]),
 'candidates':len(variants),'policy':{'head_tail_penalty':parameters[0],
 'cooccurrence_penalty':parameters[1],'reverse_penalty':parameters[2]},
 'history_limit':500,'training_only_selects_policy':True,
 'validation':stat(target[:500]),'holdout':stat(target[500:]),
 'last_day_three':[f'{int(a):02d}' for a in sorted(chosen[-1])],
 'target_360':bool((target[500:]>0).sum()>=360),
 'research_only':True,'seconds':round(time.monotonic()-start,2)}
print('XSMB_THREE_DIVERSITY_TEMPORAL_RESULT='+json.dumps(out,ensure_ascii=False,separators=(',',':')),flush=True)
