#!/usr/bin/env python3
"""Read-only backlink verifier. Never submits links or edits other services."""
import json, sys, urllib.request, urllib.parse, ipaddress, socket
from html.parser import HTMLParser
from collections import defaultdict

class Links(HTMLParser):
    def __init__(self): super().__init__(); self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a': self.hrefs.extend(v for k,v in attrs if k=='href' and v)

def norm(url):
    p=urllib.parse.urlparse(url.strip())
    return p.netloc.lower().removeprefix('www.'),p.path.rstrip('/').lower()

def public_http_url(url):
    p=urllib.parse.urlparse(url)
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password:
        return False
    try:
        addresses=socket.getaddrinfo(p.hostname,p.port or (443 if p.scheme=='https' else 80))
        return bool(addresses) and all(ipaddress.ip_address(a[4][0]).is_global for a in addresses)
    except (OSError,ValueError):
        return False

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        if not public_http_url(newurl): raise ValueError('unsafe redirect')
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def verify(url,target):
    try:
        if not public_http_url(url): return False,'unsafe or non-public URL'
        opener=urllib.request.build_opener(SafeRedirect())
        req=urllib.request.Request(url,headers={'User-Agent':'KQ247BacklinkVerifier/1.0'})
        with opener.open(req,timeout=12) as resp:
            if resp.status!=200: return False,f'HTTP {resp.status}'
            if 'text/html' not in resp.headers.get('Content-Type',''): return False,'not HTML'
            p=Links();p.feed(resp.read(1500000).decode('utf-8','replace'))
            for href in p.hrefs:
                if norm(urllib.parse.urljoin(resp.url,href))==norm(target):
                    return True,'verified public HTML link'
            return False,'target link not present'
    except Exception as e: return False,type(e).__name__+': '+str(e)[:120]

def main():
    with open(sys.argv[1],encoding='utf-8') as f: campaign=json.load(f)
    groups={k:v['group'] for k,v in campaign['goals'].items()}
    results=[];domains=defaultdict(set);seen=set()
    for entry in campaign.get('published_listings',[]):
        group=entry.get('group');url=entry.get('listing_url')
        if group not in groups or not url:continue
        key=(group,url.strip().rstrip('/'))
        if key in seen: continue
        seen.add(key)
        ok,reason=verify(url,groups[group])
        results.append({'group':group,'url':url,'verified':ok,'reason':reason})
        if ok:domains[group].add(norm(url)[0])
    print(json.dumps({'results':results,'verified':{g:sum(x['verified'] and x['group']==g for x in results) for g in groups},'unique_domains':{g:len(domains[g]) for g in groups}},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
