#!/usr/bin/env python3
from pathlib import Path
p=Path('/opt/kq247/lottery-daily-staging/minhngoc-draw.mjs')
s=p.read_text()
old="found.set(normalize(name),{special,all2:nums.map(n=>n.slice(-2)),name});"
new="found.set(normalize(name),{special,all2:nums.map(n=>n.slice(-2)),full_results:nums,name});"
if old in s:
 q=p.with_suffix('.mjs.before-full27')
 if not q.exists():q.write_text(s)
 p.write_text(s.replace(old,new))
elif new not in s:raise SystemExit('PARSER_FORMAT_UNKNOWN_REFUSE_MODIFY')
print('KQ247_SOURCE_PARSER_RETURNS_ALL27_PRIZE_VALUES_AND_ALL_POSITIONS')
