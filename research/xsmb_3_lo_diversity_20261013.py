"""Validation-tuned 3-ticket diversity: forbids hindsight and limits same-head,
same-tail, reversed-pair concentration while keeping exactly three tickets."""
import runpy,json,itertools
import numpy as np
d=runpy.run_path('research/xsmb_3_lo_500_holdout_20261013.py')
val=d['val'];test=d['test'];val_hit=d['val_hit'];test_hit=d['test_hit']
weights=d['weights'];leaders=d['leaders'];feat_names=d['feat_names']
head=np.arange(100)//10
tail=np.arange(100)%10
rev=(np.arange(100)%10)*10+np.arange(100)//10
picks=list(dict.fromkeys([r[3] for r in leaders]))
# Baseline strategies fixed in advance, chosen only by the preceding 500 days.
baseline_weights=[]
for n in ['f14','f30','f60','f120','f250','f500','f1000','f2500']:
    for sign in [-1,1]:
        w=np.zeros(len(feat_names),dtype=np.float32);w[feat_names.index(n)]=sign
        baseline_weights.append((n+('_hot' if sign==1 else '_cold'),w))
choices=[('model'+str(idx),weights[idx]) for idx in picks]+baseline_weights
params=list(itertools.product([0,0.25,0.6,1.0,1.5],[0,0.25,0.6,1.0,1.5],[0,0.4]))
def pick(sc,penalty):
    hp,tp,rp=penalty
    x=sc.copy().astype(np.float32)
    x=(x-x.mean(axis=1,keepdims=True))/np.maximum(x.std(axis=1,keepdims=True),1e-8)
    chosen=np.empty((len(x),3),dtype=np.int16)
    ix=np.arange(len(x))
    for j in range(3):
        n=x.argmax(axis=1)
        chosen[:,j]=n
        x-=hp*(head[None,:]==head[n,None])
        x-=tp*(tail[None,:]==tail[n,None])
        x-=rp*(rev[None,:]==n[:,None])
        x[ix,n]=-1e6
    return chosen
def stat(hits,chosen):
    nh=np.take_along_axis(hits,chosen,axis=1).sum(axis=1)
    return {'days':int(np.count_nonzero(nh)),'nhay':int(nh.sum()),
            'days2':int(np.count_nonzero(nh>=2)),
            'half_min':int(min(np.count_nonzero(nh[:250]),np.count_nonzero(nh[250:])))}
training=[]
for label,w in choices:
    scores=np.einsum('tnf,f->tn',val,w,optimize=True)
    for par in params:
        hit=stat(val_hit,pick(scores,par))
        training.append((hit['days'],hit['half_min'],hit['nhay'],label,par,w))
training.sort(key=lambda p:(p[0],p[1],p[2]),reverse=True)
best=training[:12];selected=[]
for wins,balanced,nhay,label,par,w in best:
    test_scores=np.einsum('tnf,f->tn',test,w,optimize=True)
    chosen=pick(test_scores,par)
    teststat=stat(test_hit,chosen)
    selected.append({'model':label,'head_penalty':par[0],
      'tail_penalty':par[1],'reverse_penalty':par[2],
      'training':{'days':wins,'balanced_half':balanced,'nhay':nhay},
      'test':teststat,'last_day_numbers':[f'{int(v):02d}' for v in chosen[-1]]})
print('XSMB_3_LO_DIVERSITY_RESULT='+json.dumps({
    'candidates_tested':len(training),'model_families':len(choices),
    'hyperparameter_sets':len(params),'validation_500':str(d['dates'][d['start']])+' to '+str(d['dates'][d['teststart']-1]),
    'test_500':str(d['dates'][d['teststart']])+' to '+str(d['dates'][-1]),
    'validation_best_selected':selected[0],
    'best_500_among_shortlist':max(x['test']['days'] for x in selected),
    'other_validation_winners':selected[1:7]},separators=(',',':')))
