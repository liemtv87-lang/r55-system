#!/usr/bin/env python3
"""Append all 27 authentic XSMB prize numbers to the local staging history.
No prediction or publication happens here."""
import json,pathlib
root=pathlib.Path('/opt/kq247/lottery-daily-staging')
lookup=json.loads((root/'xsmb-505-all27-prizes-20261014.json').read_text())
history=root/'xsmb-history-live.json'
rows=json.loads(history.read_text())
if len(lookup)!=505:raise SystemExit('WRONG_505_PRIZE_HISTORY')
count=0
for row in rows:
 day=row['draw_date']
 if day not in lookup:continue
 nums=lookup[day]
 if len(nums)!=27 or any(not isinstance(x,str) or not x.isdecimal() for x in nums):
  raise SystemExit('MALFORMED_27_PRIZES_'+day)
 if sum(len(x)>=3 for x in nums)!=23 or sum(len(x)==2 for x in nums)!=4:
  raise SystemExit('WRONG_3DIGIT_ELIGIBLE_PRIZES_'+day)
 if [x[-2:] for x in nums]!=row['all2'] or nums[0]!=row['special']:
  raise SystemExit('PRIZE_CONFLICT_WITH_STORED_ACTUAL_'+day)
 if 'full_results' in row and row['full_results']!=nums:
  raise SystemExit('EXISTING_FULL_RESULTS_CONFLICT_'+day)
 row['full_results']=nums
 count+=1
if count!=505:raise SystemExit('EXPECTED_505_VERIFIED_MATCHES_'+str(count))
staged=history.with_name('xsmb-history-live.json.all27-pending')
staged.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
staged.replace(history)
print('XSMB_505_ALL27_PRIZES_VERIFIED_INSTALLED total=505 eligible_three_digit_per_draw=23 two_digit_per_draw=4')
