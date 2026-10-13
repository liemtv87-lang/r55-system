#!/usr/bin/env python3
"""Submit only newly changed KQ247 VPS-owned Telegram landing pages to IndexNow."""
import hashlib,json,os
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode
ROOT=Path('/opt/kq247/seo-groups')
PUBLIC=Path('/opt/kq247/deployment/football-original/public')
BASE='https://64-120-92-172.sslip.io'
PAGES=['nhom-bong-da-telegram-mien-phi.html','nhom-xo-so-mb-mn-mt-telegram-mien-phi.html']
def main():
    keyfile=ROOT/'indexnow.key'
    if not keyfile.exists():raise RuntimeError('missing_vps_indexnow_key')
    key=keyfile.read_text().strip()
    if not (len(key)==32 and all(c in '0123456789abcdef' for c in key)):raise RuntimeError('bad_indexnow_key')
    with urlopen(BASE+'/'+key+'.txt',timeout=12) as r:
        assert r.status==200 and r.read().decode().strip()==key,'indexnow_ownership_key_not_public'
    ledger=ROOT/'reports/indexnow-accepted.json'
    old=json.loads(ledger.read_text()) if ledger.exists() else {}
    accepted=dict(old)
    for page in PAGES:
        content=(PUBLIC/page).read_bytes()
        digest=hashlib.sha256(content).hexdigest()
        if old.get(page,{}).get('sha256')==digest:
            print('VPS_INDEXNOW_NO_CHANGE',page)
            continue
        url=BASE+'/'+page
        request='https://api.indexnow.org/indexnow?'+urlencode({'url':url,'key':key})
        try:
            with urlopen(Request(request,headers={'User-Agent':'KQ247-VPS-IndexNow/1.0'}),timeout=20) as r:
                status=r.status
        except HTTPError as exc:
            status=exc.code
        print('VPS_INDEXNOW_SUBMISSION',page,'http',status)
        if status not in (200,202):
            raise RuntimeError('indexnow_submission_unaccepted_'+page+'_'+str(status))
        accepted[page]={'sha256':digest,'http':status}
        temp=ledger.with_suffix('.tmp')
        temp.write_text(json.dumps(accepted,ensure_ascii=False,indent=2)+'\n')
        temp.replace(ledger)
    print('VPS_INDEXNOW_TWO_GROUPS_CHANGE_ONLY=PASS')
if __name__=='__main__':
    main()
