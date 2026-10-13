#!/usr/bin/env python3
"""Read-only hourly SEO checks for two KQ247 Telegram group landing pages."""
import json,os,re,datetime
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
BASE='https://64-120-92-172.sslip.io'
PAGES={'football':('nhom-bong-da-telegram-mien-phi.html','https://t.me/keochuyengia79'),
       'lottery':('nhom-xo-so-mb-mn-mt-telegram-mien-phi.html','https://t.me/xsbm999')}
REPORT=Path('/opt/kq247/seo-groups/reports')
PUBLIC=Path('/opt/kq247/deployment/football-original/public')
def get(url):
    try:
        with urlopen(Request(url,headers={'User-Agent':'KQ247-SEO-Health-Check/1.0'}),timeout=12) as r:
            return r.status,r.read(160000).decode('utf8','replace')
    except HTTPError as e:
        return e.code,''
    except Exception as e:
        return 0,type(e).__name__
def write(path,doc):
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
    tmp.replace(path)
def main():
    REPORT.mkdir(parents=True,exist_ok=True)
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    sm,xml=get(BASE+'/sitemap.xml')
    rb,robots=get(BASE+'/robots.txt')
    out={'checked_at_utc':now,'source':'VPS systemd hourly','scope':['football','lottery'],'groups':{},'errors':[]}
    if sm!=200 or rb!=200 or BASE+'/sitemap.xml' not in robots:out['errors'].append('sitemap_or_robots')
    for key,(path,telegram) in PAGES.items():
        url=BASE+'/'+path
        code,html=get(url)
        tg,_=get(telegram)
        canonical=bool(re.search(r'<link[^>]*rel="canonical"[^>]*href="'+re.escape(url)+'"',html,re.I))
        og=bool(re.search(r'<meta[^>]*property="og:url"[^>]*content="'+re.escape(url)+'"',html,re.I))
        good=code==200 and canonical and og and telegram in html and url in xml
        item={'http':code,'telegram_http':tg,'canonical':canonical,'og':og,'ok':good}
        out['groups'][key]=item
        if not good:out['errors'].append(key+'_seo_landing')
    out['ok']=not out['errors']
    write(REPORT/'latest.json',out)
    with (REPORT/'history.jsonl').open('a') as f:f.write(json.dumps(out)+'\n')
    write(PUBLIC/'seo-groups-status.json',out)
    print('SEO_VPS_GROUP_AUDIT',json.dumps(out,ensure_ascii=False))
    return 0 if out['ok'] else 1
if __name__=='__main__':
    raise SystemExit(main())
