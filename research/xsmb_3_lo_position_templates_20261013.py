#!/usr/bin/env python3
"""Exhaustive three-lotto XSMB positional/triangle templates, no future leakage.

Every candidate template uses ONLY the preceding three lottery draws.
Optimize a fixed 500-draw validation window, then evaluate candidates
once on the later 500 draws; report selection bias explicitly.
"""
import csv, io, itertools, json, urllib.request, sys, heapq, time, math, datetime
import numpy as np

mode=sys.argv[1] if len(sys.argv)>1 else 'raw'
assert mode in ('raw','expanded')
url='https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.csv'
s=urllib.request.urlopen(url,timeout=40).read().decode('utf-8-sig')
rows=list(csv.DictReader(io.StringIO(s)))
prizes=list(rows[0].keys())[1:]
dates=[r['date'] for r in rows]
raw=np.array([[int(r[p][-2:]) for p in prizes] for r in rows],dtype=np.uint8)
assert len(prizes)==27 and len(raw)>1500
N=len(raw);START=N-1000;SPLIT=START+500
current=datetime.date.fromisoformat(dates[-1])
assert current<=datetime.date.today()
symbols=[]
names=[]
for lag in [1,2,3]:
    for pos in range(27):
        symbols.append(raw[START-lag:N-lag,pos].copy())
        names.append(f'lag{lag}_slot{pos}')
if mode=='expanded':
    a=raw[START-1:N-1].astype(np.int16)
    b=raw[START-2:N-2].astype(np.int16)
    c=raw[START-3:N-3].astype(np.int16)
    expansions=[
      ('reverse_lag1',((a%10)*10+a//10)),
      ('sum_lags12', (a+b)%100),
      ('diff_lags12', (a-b)%100),
      ('adjacent_lag1', (a+np.roll(a,-1,axis=1))%100),
      ('triangle_lag123',(a+b+c)%100)
    ]
    for prefix,block in expansions:
        for pos in range(27):
            symbols.append(block[:,pos].astype(np.uint8))
            names.append(f'{prefix}_slot{pos}')
S=np.stack(symbols,axis=1)
M=S.shape[1]
assert S.shape==(1000,M)
# A valid XSMB day has 27 tails but potentially fewer unique distinct values.
occ=np.zeros((1000,100),dtype=np.uint8)
freq=np.zeros((1000,100),dtype=np.uint8)
for k,t in enumerate(range(START,N)):
    freq[k]=np.bincount(raw[t],minlength=100)
    occ[k]=(freq[k]>0).astype(np.uint8)

def get_triplets(table, triples):
    x=table[:,triples[:,0]]
    y=table[:,triples[:,1]].copy()
    z=table[:,triples[:,2]].copy()
    # Deterministic collision resolution, using predicted values only.
    y=np.where(y==x, (y+1)%100,y)
    z=np.where((z==x)|(z==y),(z+1)%100,z)
    z=np.where((z==x)|(z==y),(z+1)%100,z)
    assert not np.any((x==y)|(x==z)|(y==z))
    return x,y,z

started=time.monotonic()
heap=[];inspected=0;batchSize=1600;validationDateIndex=np.arange(500)[:,None]
def scan(batch):
    global inspected
    ix=np.asarray(batch,dtype=np.int16)
    a,b,c=get_triplets(S[:500],ix)
    success=occ[:500][validationDateIndex,a]|occ[:500][validationDateIndex,b]|occ[:500][validationDateIndex,c]
    days=success.sum(axis=0)
    first=success[:250].sum(axis=0)
    last=success[250:].sum(axis=0)
    flashes=(freq[:500][validationDateIndex,a]+freq[:500][validationDateIndex,b]+freq[:500][validationDateIndex,c]).sum(axis=0,dtype=np.int32)
    # Holdout is never consulted in model selection.
    for j in range(len(ix)):
        record=(int(days[j]),int(min(first[j],last[j])),int(flashes[j]),
                tuple(int(v) for v in ix[j]))
        if len(heap)<60:heapq.heappush(heap,record)
        elif record>heap[0]:heapq.heapreplace(heap,record)
    inspected+=len(ix)
    if inspected%240000<batchSize:print('TEMPLATE_PROGRESS',mode,inspected,round(time.monotonic()-started,1),flush=True)

batch=[]
for tr in itertools.combinations(range(M),3):
    batch.append(tr)
    if len(batch)==batchSize:
        scan(batch);batch.clear()
if batch:scan(batch)
assert inspected==math.comb(M,3)

leaders=sorted(heap,reverse=True)
result=[]
holdIdx=np.arange(500)[:,None]
for val,minhalf,vfl,tr in leaders[:30]:
    ix=np.asarray([tr],dtype=np.int16)
    a,b,c=get_triplets(S[500:],ix)
    success=occ[500:][holdIdx,a]|occ[500:][holdIdx,b]|occ[500:][holdIdx,c]
    hits=(freq[500:][holdIdx,a]+freq[500:][holdIdx,b]+freq[500:][holdIdx,c]).reshape(-1)
    result.append({
      'pattern':[names[i] for i in tr],
      'train_days':val,'train_min_half':minhalf,'train_nhay':vfl,
      'heldout_days':int(success.sum()),
      'heldout_nhay':int(hits.sum()),
      'heldout_2plus':int(np.sum(hits>=2)),
      'last_day_numbers':[f'{int(a[-1,0]):02d}',f'{int(b[-1,0]):02d}',f'{int(c[-1,0]):02d}']
    })
summary={
 'mode':mode,'source_rows':N,'candidates_examined':inspected,
 'validation_dates':[dates[START],dates[SPLIT-1]],
 'holdout_dates':[dates[SPLIT],dates[-1]],
 'selected_by':'validation days, balanced half, nhay; holdout blind',
 'best_validation_model':result[0],
 'best_heldout_of_top30':max(x['heldout_days'] for x in result),
 'top5':result[:5],
 'target_met':result[0]['heldout_days']>=360,
 'seconds':round(time.monotonic()-started,2)
}
print('XSMB_3_LO_TEMPLATE_RESULT='+json.dumps(summary,ensure_ascii=False,separators=(',',':')),flush=True)
