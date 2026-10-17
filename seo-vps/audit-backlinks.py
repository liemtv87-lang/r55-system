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
def discover_verified_poster_receipts(cfg):
    """Merge independently checkable posted listing URLs, never pending clicks."""
    path=Path('/opt/pwremote/kq247-backlink-background/bulk-posts.json')
    try:
        attempts=json.loads(path.read_text(encoding='utf8')).get('attempts',[])
    except (OSError,ValueError,AttributeError):
        return []
    result=[]
    for row in attempts:
        if not isinstance(row,dict) or row.get('status') not in ('published_verified','already_listed_verified'):
            continue
        group=row.get('group')
        receipt=row.get('receipt','')
        host=row.get('host','')
        if group not in cfg.get('goals',{}) or not isinstance(receipt,str) or not isinstance(host,str):
            continue
        dest=urlsplit(receipt)
        if dest.scheme!='https' or not dest.hostname or dest.hostname.lower().removeprefix('www.')!=host.lower().removeprefix('www.'):
            continue
        result.append({'group':group,'listing_url':receipt,
                       'target_url':cfg['goals'][group]['group'],'receipt_source':'vps_opt_in_poster'})
    return result

def main():
    cfg=json.loads(CAMPAIGN.read_text(encoding='utf8'))
    now=datetime.datetime.now(datetime.timezone.utc)
    results={'checked_at_utc':now.isoformat(),'goals':{},'prospects':len(cfg.get('directories',[])),
             'count_policy':'Verified published external listing URL only, unique domain separately; no pending submissions counted',
             'new_links_last_hour':0}
    poster_receipts=discover_verified_poster_receipts(cfg)
    claimed=list(cfg.get('published_listings',[]))+poster_receipts
    # Same listing can appear in the campaign and poster output; verify once.
    seen=set()
    claimed=[e for e in claimed if not ((e.get('group'),e.get('listing_url'),e.get('target_url','')) in seen or
             seen.add((e.get('group'),e.get('listing_url'),e.get('target_url',''))))]
    results['eligible_poster_receipts_for_independent_verification']=len(poster_receipts)
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
            record={'status':answer,'checked_at_utc':now.isoformat(),'listing_url':url,'group':group}
            if previous.get('first_verified_at_utc'):
                record['first_verified_at_utc']=previous['first_verified_at_utc']
            elif answer=='verified' and previous.get('status')!='verified':
                record['first_verified_at_utc']=now.isoformat()
            cached[fingerprint]=record
            if answer=='verified' and previous.get('status')!='verified':verified_new+=1
    write(statefile,cached)
    results['checked_this_hour']=checks
    results['newly_verified_since_previous_report']=verified_new
    new_last_hour=0
    for entry in cached.values():
        if entry.get('status')!='verified':continue
        try:
            observed=datetime.datetime.fromisoformat(entry.get('first_verified_at_utc',''))
            if 0 <= (now-observed).total_seconds() < 3600:new_last_hour+=1
        except (TypeError,ValueError):pass
    results['new_links_last_hour']=new_last_hour
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
