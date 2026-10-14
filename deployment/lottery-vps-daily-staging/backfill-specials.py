import json,pathlib
root=pathlib.Path('/opt/kq247/lottery-daily-staging')
rows=json.loads((root/'xsmb-505-actual-through-20261014.json').read_text())
specials=json.loads((root/'xsmb-historical-specials-505.json').read_text())
assert len(rows)==len(specials)==505
assert {r['draw_date'] for r in rows}==set(specials)
for r in rows:
 s=specials[r['draw_date']]
 assert len(s)==5 and s.isdigit() and s[-2:]==r['all2'][0],r['draw_date']
 r['special']=s
live=root/'xsmb-history-live.json'
if live.exists():
 old=json.loads(live.read_text())
 bydate={r['draw_date']:r for r in old}
 for r in rows:
  if r['draw_date'] in bydate:
   assert bydate[r['draw_date']]['all2']==r['all2']
   bydate[r['draw_date']]['special']=r['special']
  else: old.append(r)
 rows=old
rows.sort(key=lambda r:r['draw_date'],reverse=True)
tmp=live.with_suffix('.json.incoming')
tmp.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
tmp.replace(live)
print('XSMB_505_SPECIALS_ENRICHED',len(rows),rows[0]['draw_date'])
