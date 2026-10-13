#!/usr/bin/env python3
"""KQ247 Telegram SEO: independent public evidence, one submission per site/group."""
import datetime as dt
import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from playwright.sync_api import sync_playwright

DATA = Path('/data')
DATA.mkdir(exist_ok=True, parents=True)
STATE = DATA / 'state.json'
REPORT = DATA / 'latest.json'
NOW = dt.datetime.now(dt.timezone.utc)
GROUPS = {
    'football': dict(url='https://t.me/keochuyengia79', handle='keochuyengia79',
        name='KQ247 - Cong dong bong da mien phi',
        desc='Cong dong chia se lich thi dau, ket qua va phan tich du lieu bong da de tham khao. Khong bao dam ket qua.',
        category='Sports'),
    'lottery': dict(url='https://t.me/xsbm999', handle='xsbm999',
        name='KQ247 - Ket qua xo so ba mien',
        desc='Cong dong cap nhat ket qua xo so MB MT MN, thong ke va phan tich tham khao mien phi. Du doan khong bao dam chinh xac.',
        category='News')
}
SEEDS = {
    'football': [
        'https://tgfind.net/en/resource/keochuyengia79',
        'https://telejoiner.com/invite/1002315121695'
    ],
    'lottery': [
        'https://tgfind.net/en/resource/xsbm999',
        'https://telejoiner.com/invite/1004320899120'
    ]
}
def read():
    try: return json.loads(STATE.read_text())
    except (OSError,ValueError): return {'attempted':{}, 'candidates':{}, 'first_verified':{}}
def save(path,obj):
    tmp=path.with_name(path.name+'.tmp')
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
    tmp.replace(path)
def norm(url):
    x=urlsplit(url)
    return (x.hostname or '').lower().removeprefix('www.'),x.path.rstrip('/').lower()
def challenge(page):
    return any(page.locator(x).count() for x in (
        '[data-sitekey]','iframe[src*="captcha"]','.g-recaptcha','.h-captcha','#cf-challenge-running'))
def submission_tgmania(page, spec):
    r=page.goto('https://tgmania.com/submit',wait_until='domcontentloaded',timeout=25000)
    if not r or r.status!=200 or challenge(page): return ('manual_needed','page_blocked')
    field=page.locator('input[placeholder*="@yourchannel"]')
    if not field.count(): return ('manual_needed','form_not_found')
    field.fill('@'+spec['handle'],timeout=5000)
    radio=page.locator('input[type=radio][value=group]')
    if radio.count(): radio.check(force=True)
    elif page.get_by_text('Group',exact=True).count(): page.get_by_text('Group',exact=True).last.click()
    btn=page.get_by_role('button',name='Next: Choose Category')
    if not btn.count(): return ('manual_needed','step1_missing')
    btn.click(timeout=6000); page.wait_for_timeout(500)
    if challenge(page): return ('manual_needed','captcha')
    choices=['Communities','News & Media'] if spec['category']=='Sports' else ['News & Media','Communities']
    choice=next((page.get_by_text(s,exact=True).last for s in choices if page.get_by_text(s,exact=True).count()),None)
    if not choice: return ('manual_needed','category_missing')
    choice.click(timeout=5000)
    nextbtn=page.get_by_role('button',name=re.compile('Next',re.I))
    if not nextbtn.count(): return ('manual_needed','step2_missing')
    nextbtn.last.click(timeout=6000);page.wait_for_timeout(500)
    if page.locator('textarea').count(): page.locator('textarea').first.fill(spec['desc'],timeout=4500)
    if challenge(page): return ('manual_needed','captcha')
    submit=page.get_by_role('button',name=re.compile('Submit',re.I))
    if not submit.count(): return ('manual_needed','submit_missing')
    submit.last.click(timeout=9000);page.wait_for_timeout(800)
    return ('pending_review','clicked_submit_once')
def submission_tgdirectory(page,spec):
    r=page.goto('https://telegramchannels.io/submit-channel',wait_until='domcontentloaded',timeout=25000)
    if not r or r.status!=200 or challenge(page): return ('manual_needed','page_blocked')
    inp=page.locator('input[placeholder*="t.me/"]')
    if not inp.count(): inp=page.locator('input[type=url]')
    if not inp.count(): return ('manual_needed','form_not_found')
    inp.first.fill(spec['url'],timeout=5000)
    name=page.locator('input[placeholder*="Only if"]')
    if name.count(): name.first.fill(spec['name'],timeout=5000)
    if page.locator('textarea').count():page.locator('textarea').first.fill(spec['desc'],timeout=5000)
    for i in range(page.locator('select').count()):
        node=page.locator('select').nth(i)
        options=node.locator('option').evaluate_all('(es)=>es.map(x=>({value:x.value,text:x.textContent.trim()}))')
        prefs=[spec['category'],'Sports','News','Group','Vietnamese']
        selected=next((x['value'] for s in prefs for x in options if x['value'] and x['text'].lower()==s.lower()),None)
        if selected: node.select_option(value=selected,timeout=5000)
    if challenge(page): return ('manual_needed','captcha')
    btn=page.get_by_role('button',name='Submit for review')
    if not btn.count(): return ('manual_needed','submit_missing')
    btn.click(timeout=9000);page.wait_for_timeout(700)
    return ('pending_review','clicked_submit_once')
def check(page,url,target):
    try:
        if not url.startswith('https://'):return False,'invalid_scheme'
        r=page.goto(url,wait_until='domcontentloaded',timeout=18000)
        if not r or r.status!=200:return False,'not_http_200'
        if urlsplit(page.url).hostname!=urlsplit(url).hostname:return False,'redirected'
        links=page.locator('a[href]').evaluate_all('(es)=>es.map(a=>a.href)')
        return (True,'exact_html_anchor') if any(norm(x)==norm(target) for x in links) else (False,'no_target_anchor')
    except Exception as e:return False,type(e).__name__
def main():
    mode='verify' if '--verify-only' in __import__('sys').argv else 'submit'
    state=read()
    attempted=state.setdefault('attempted',{})
    candidates=state.setdefault('candidates',{})
    first_verified=state.setdefault('first_verified',{})
    for name in GROUPS:
        candidates.setdefault(name,[])
        for url in SEEDS[name]:
            if url not in candidates[name]:candidates[name].append(url)
        for site in ('tgfind','telejoiner','toptglinks','groupmandi'):
            attempted.setdefault(site+'|'+name,{'status':'previously_processed','note':'Do not send duplicates'})
    events=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        if mode=='submit':
            for site,fn in (('tgmania',submission_tgmania),('tgdirectory',submission_tgdirectory)):
                for name,spec in GROUPS.items():
                    k=site+'|'+name
                    if k in attempted:continue
                    page=browser.new_page(viewport={'width':1200,'height':860})
                    try:
                        status,reason=fn(page,spec)
                    except Exception as e:
                        status,reason='manual_needed',type(e).__name__
                    attempted[k]={'status':status,'reason':reason,'time_utc':NOW.isoformat()}
                    events.append({'site':site,'group':name,'status':status,'reason':reason})
                    print('DIRECTORY_RESULT',json.dumps(events[-1],ensure_ascii=False),flush=True)
                    save(STATE,state)
                    page.close();time.sleep(1)
        verified={}
        details={}
        for name,spec in GROUPS.items():
            verified[name]=[]
            details[name]=[]
            page=browser.new_page(viewport={'width':1000,'height':700})
            for url in sorted(set(candidates[name]))[:80]:
                ok,reason=check(page,url,spec['url'])
                details[name].append({'listing_url':url,'verified':ok,'reason':reason})
                if ok:
                    verified[name].append(url)
                    first_verified.setdefault(name+'|'+url,NOW.isoformat())
            page.close()
        browser.close()
    counts={}
    since=NOW-dt.timedelta(hours=1)
    for name in GROUPS:
        count=sum(1 for url in verified[name] if dt.datetime.fromisoformat(first_verified[name+'|'+url])>=since)
        counts[name]=dict(group_url=GROUPS[name]['url'],verified_total=len(verified[name]),
                          new_verified_last_hour=count,pending=sum(
                          1 for k,v in attempted.items() if k.endswith('|'+name) and v['status']=='pending_review'),
                          candidates_checked=len(details[name]))
    recent=sum(v['new_verified_last_hour'] for v in counts.values())
    result=dict(checked_at_utc=NOW.isoformat(),mode=mode,goal_new_verified_hourly=100,
                new_verified_hourly=recent,shortfall=max(0,100-recent),
                groups=counts,attempts_this_run=events,verification=details,
                honesty='Counts require publicly readable exact anchors; submissions and approvals are not interchangeable.',
                targets_only=['https://t.me/keochuyengia79','https://t.me/xsbm999'])
    save(STATE,state);save(REPORT,result)
    print('KQ247_PLAYWRIGHT_HOURLY_REPORT',json.dumps(result,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
