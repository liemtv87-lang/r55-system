#!/usr/bin/env python3
"""Auditable per-day historical predictions for exactly the 314/500 XSMB study.
Do not confuse historical observations with guaranteed future performance.
The production XSMB tool is never accessed or modified.
"""
import csv,hashlib,json,os,runpy,sys
sys.argv=['research/xsmb_3lo_stable_diversity_20261013.py','hybrid']
m=runpy.run_path('research/xsmb_3lo_covariance_diversity_20261013.py')
R=m['R'];chosen=m['chosen'];counts=m['counts'];rows=m['rows'];START=m['START'];target=m['target']
params=m['parameters']
assert tuple(round(float(x),5) for x in params)==(.12,.15,0.),params
assert len(chosen)==1000 and chosen.shape==(1000,3)
assert len(target)==1000 and rows[-1]['date']=='2026-10-13'
assert sum(target[:500]>0)==305 and sum(target[500:]>0)==314
os.makedirs('research/results',exist_ok=True)
p='research/results/xsmb_314_500_replay_20261013.csv'
with open(p,'w',newline='',encoding='utf-8') as file:
 writer=csv.writer(file)
 writer.writerow(['date','split','pick1','pick2','pick3','count_1','count_2','count_3','total_nhay','at_least_one','at_least_two','at_least_three'])
 for i in range(1000):
  t=START+i
  nums=sorted(int(x) for x in chosen[i])
  assert len(set(nums))==3
  assert all(counts[t-1,x]==0 or counts[t-2,x]==0 for x in nums),'two-day overlap'
  hits=[int(counts[t,x]) for x in nums]
  assert sum(hits)==int(target[i])
  writer.writerow([rows[t]['date'],'validation' if i<500 else 'holdout',
                   *[f'{x:02d}' for x in nums],*hits,int(sum(hits)),
                   int(sum(hits)>0),int(sum(hits)>=2),int(sum(hits)>=3)])
b=open(p,'rb').read()
digest=hashlib.sha256(b).hexdigest()
meta={'method':'causal hybrid/positions 500-history diversity','sha256':digest,
      'source_rows':len(rows),'validation':305,'holdout':314,
      'holdout_nhay':int(target[500:].sum()),'rows':1000,
      'parameters':params,'csv_file':p,
      'research_only':True,'target360reached':False}
with open('research/results/xsmb_314_500_replay_manifest.json','w',encoding='utf-8') as f:
 json.dump(meta,f,ensure_ascii=False,indent=2)
print('XSMB_STABLE_REPLAY_AUDIT='+json.dumps(meta,ensure_ascii=False,separators=(',',':')),flush=True)
