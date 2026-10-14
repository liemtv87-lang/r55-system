#!/usr/bin/env python3
"""Prepare a safe Caddy candidate routing XS main pages to the verified 36-station reader.
This does not reload Caddy or modify the running file.
"""
import pathlib
base=pathlib.Path('/opt/kq247/deployment/football-staging')
source=base/'Caddyfile'
text=source.read_text()
old='''  handle @xsmb_page_path {
    route {
      reverse_proxy @xsmt_page_query lottery-original:3004
      reverse_proxy @xsmn_page_query lottery-original:3004
      reverse_proxy kq247-xsmb-snapshot-reader:3018
    }
  }
'''
new='''  handle @xsmb_page_path {
    reverse_proxy kq247-xs-36-reader:3019
  }
'''
if old not in text:
 if new in text:
  print('XS_ALL36_CADDY_ALREADY_CANDIDATE')
 else:
  raise SystemExit('CADDY_XS_BLOCK_CHANGED_REFUSING_TO_REPLACE')
else:
 text=text.replace(old,new,1)
if text.count(new)!=1 or not all(k in text for k in ('/xoso-khach','/lottery/*','lottery-original:3004')):
 raise SystemExit('XS_CUSTOMER_ROUTE_GUARD_FAILED')
target=base/'Caddyfile.xs-all36-candidate'
target.write_text(text)
print('XS_ALL36_CADDY_CANDIDATE_READY',target)
