"""XSMB: select three numbers for P(at least one hit) using conditional coverage.
Only past draws form pairwise correlations. Select settings on older 500
and evaluate the latest 500 strictly out of sample.
"""
import runpy,json,itertools
import numpy as np

d=runpy.run_path('research/xsmb_3_lo_500_holdout_20261013.py')
val=d['val'];test=d['test'];val_hit=d['val_hit'];test_hit=d['test_hit']
weights=d['weights'];leaders=d['leaders'];feat_names=d['feat_names']
present=d['present'].astype(np.float32)
dates=d['dates'];start=d['start'];teststart=d['teststart']
heads=np.arange(100)//10;tails=np.arange(100)%10
windows=(90,250,500,1500)
corr={}
for window in windows:
    # t's training data stops yesterday. Both the mean and covariance
    # are computed on [t-window, t), never on day t.
    m=np.zeros((100,100),dtype=np.float32)
    sum1=np.zeros(100,dtype=np.float32)
    for t in range(start-window,start):
        p=present[t];m+=np.outer(p,p);sum1+=p
    arr=np.zeros((1000,100,100),dtype=np.float16)
    for i,t in enumerate(range(start,start+1000)):
        if i:
            add=present[t-1];sub=present[t-window-1]
            m+=np.outer(add,add)-np.outer(sub,sub)
            sum1+=add-sub
        p=sum1/window
        cov=m/window-np.outer(p,p)
        var=np.maximum(p*(1-p),0.0025)
        denom=np.sqrt(np.outer(var,var))
        z=np.clip(cov/denom,-0.65,0.65)
        np.fill_diagonal(z,0)
        arr[i]=z.astype(np.float16)
    corr[window]=arr

def choose(score, paircorr, coef, head_penalty, tail_penalty):
    # Daily standardization ensures one common penalty scale.
    s=score.astype(np.float32).copy()
    s=(s-s.mean(axis=1,keepdims=True))/np.maximum(s.std(axis=1,keepdims=True),1e-8)
    out=np.empty((s.shape[0],3),dtype=np.int16);ix=np.arange(len(s))
    for j in range(3):
        picked=s.argmax(axis=1)
        out[:,j]=picked
        if coef!=0:
            s-=coef*paircorr[ix,picked,:].astype(np.float32)
        if head_penalty:s-=head_penalty*(heads[None,:]==heads[picked,None])
        if tail_penalty:s-=tail_penalty*(tails[None,:]==tails[picked,None])
        s[ix,picked]=-1e9
    return out

def stats(hits,selection):
    h=np.take_along_axis(hits,selection,axis=1).sum(axis=1)
    return dict(days=int(np.count_nonzero(h)),nhay=int(h.sum()),
        days2=int(np.count_nonzero(h>=2)),
        first_half=int(np.count_nonzero(h[:250])),
        last_half=int(np.count_nonzero(h[250:])))

# Candidate model scores are fixed by earlier validation, not tuned on holdout.
picks=list(dict.fromkeys([x[3] for x in leaders]))
baseline=[]
for feature in ['f14','f30','f60','f120','f250','f500','f1000','f2500','head14','tail14']:
    for sign in [-1,1]:
        w=np.zeros(len(feat_names),dtype=np.float32);w[feat_names.index(feature)]=sign
        baseline.append((feature+('_hot' if sign==1 else '_cold'),w))
choices=[('trained_'+str(idx),weights[idx]) for idx in picks]+baseline

parameters=list(itertools.product(windows,[-2,-1,-0.5,0,0.5,1,2,3],
    [(0,0),(0.35,0),(0,0.35),(0.35,0.35)]))
ranked=[]
for label,w in choices:
    vs=val@w
    for win,coef,(hp,tp) in parameters:
        sel=choose(vs,corr[win][:500],coef,hp,tp)
        st=stats(val_hit,sel)
        # Explicitly favor balanced performance across validation halves.
        score=(min(st['first_half'],st['last_half']),st['days'],st['nhay'])
        ranked.append((score,label,w,win,coef,hp,tp,st))
ranked.sort(key=lambda p:p[0],reverse=True)
shortlisted=ranked[:30]
results=[]
for score,label,w,win,coef,hp,tp,st in shortlisted:
    pred=choose(test@w,corr[win][500:],coef,hp,tp)
    test_stats=stats(test_hit,pred)
    results.append(dict(label=label,window=win,correlation_penalty=coef,
        same_head_penalty=hp,same_tail_penalty=tp,
        validation=st,test=test_stats,
        last_picks=[f'{int(n):02d}' for n in np.sort(pred[-1])]))
best=results[0]
print('XSMB_CONDITIONAL_COVERAGE='+json.dumps({
   'candidates':len(ranked),'validated':500,'heldout':500,
   'validation_range':[str(dates[start]),str(dates[teststart-1])],
   'holdout_range':[str(dates[teststart]),str(dates[-1])],
   'selection_rule':'highest minimum of two validation halves then overall days',
   'selected':best,'other_candidates':results[1:9],
   'target_360_met':best['test']['days']>=360
},ensure_ascii=False,separators=(',',':')))
