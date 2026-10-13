#!/usr/bin/env python3
"""Hourly evidence-based backlink report. Zero claims without public proof."""
import json,re,datetime
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
from html.parser import HTMLParser

ROOT=Path('/opt/kq247/seo-groups')
PUBLIC=Path('/opt/kq247/deployment/football-original/public')
CAMPAIGN=ROOT/'backlink-campaign.json'
REPORT=ROOT/'reports/backlinks.json'
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        if tag.lower()=='a':
            a=dict(attrs)
            if a.get('href'):self.hrefs.append(a['href'])
def domain(url):
    return urlsplit(url).hostname or ''
def verify(url,target):
    try:
        u=urlsplit(url)
        if u.scheme!='https' or not u.hostname or u.port not in (None,443):
            return 'invalid_url'
        req=Request(url,headers={'User-Agent':'KQ247-SEO-LinkVerifier/1.0'})
        with urlopen(req,timeout=8) as r:
            if r.status!=200:return 'http_'+str(r.status)
            if domain(r.geturl())!=domain(url):return 'redirected_off_domain'
            html=r.read(220000).decode('utf8','replace')
        links=Links();links.feed(html)
        wanted=target.rstrip('/')
        for x in links.hrefs:
            if x.rstrip('/')==wanted:return 'verified'
        return 'missing_target_anchor'
    except Exception as e:return type(e).__name__
def write(path,payload):
    path.parent.mkdir(parents=True,exist_ok=True)
    p=path.with_suffix('.tmp')
    p.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    p.replace(path)
def main():
    cfg=json.loads(CAMPAIGN.read_text(encoding='utf8'))
    now=datetime.datetime.now(datetime.timezone.utc)
    results={'checked_at_utc':now.isoformat(),'goals':{},'prospects':len(cfg.get('directories',[])),
             'count_policy':'Verified published external listing URL only, unique domain separately; no pending submissions counted',
             'new_links_last_hour':0}
    claimed=cfg.get('published_listings',[])
    statefile=ROOT/'reports/backlink-verifications.json'
    cached=json.loads(statefile.read_text()) if statefile.exists() else {}
    verified_new=0
    checks=0
    # Bounded third-party traffic: no more than 100 GETs per hourly run.
    for e in claimed:
        url=e.get('listing_url','');group=e.get('group','')
        if group not in cfg['goals'] or not url:continue
        dest=e.get('target_url') or cfg['goals'][group]['group']
        fingerprint=group+'|'+url+'|'+dest
        previous=cached.get(fingerprint,{})
        date=previous.get('checked_at_utc','')
        try:age=(now-datetime.datetime.fromisoformat(date)).total_seconds()
        except Exception:age=1e12
        if age>=18*3600 and checks<100:
            answer=verify(url,dest);checks+=1
            cached[fingerprint]={'status':answer,'checked_at_utc':now.isoformat(),'listing_url':url,'group':group}
            if answer=='verified' and previous.get('status')!='verified':verified_new+=1
    write(statefile,cached)
    results['checked_this_hour']=checks
    results['newly_verified_since_previous_report']=verified_new
    for group,spec in cfg['goals'].items():
        links=[]
        for e in claimed:
            if e.get('group')!=group:continue
            target=e.get('target_url') or spec['group']
            state=cached.get(group+'|'+e.get('listing_url','')+'|'+target,{})
            if state.get('status')=='verified':
                links.append(e['listing_url'])
        unique=sorted(set(links))
        domains=sorted(set(domain(x) for x in unique))
        results['goals'][group]={'target_verified':spec['verified_links'],
                                'verified_published':len(unique),
                                'verified_referring_domains':len(domains),
                                'remaining':max(0,spec['verified_links']-len(unique)),
                                'prospect_count':sum(group in x.get('groups',[]) for x in cfg['directories']),
                                'public_listing_examples':unique[:6]}
    write(REPORT,results)
    # Public counts only, no tokens, no secret details.
    write(PUBLIC/'seo-backlinks-status.json',results)
    print('KQ247_BACKLINK_EVIDENCE_REPORT',json.dumps(results,ensure_ascii=False))
if __name__=='__main__':main()
