# XSMB additive triangle, 27 full prizes — research progress 2026-10-12

Scope: XSMB-only, research-only. Production, customer URL, licenses, XSMT/XSMN, bot unchanged.

## Real input and rules
- Read 2,000 dated XSMB draws, 27 full prizes of 107 digits each, through 2026-10-10, from Supabase read-only query.
- Generate 280 triangle digits per draw; 16 lag configurations x 160 transforms x 280 squared pairs = 200,704,000 formulas.
- Predictions use exclusively preceding actual draws and exclude any number present in both immediately preceding actual draws.
- Training: five chronological 100-day blocks; then additional 500 day validation. Formula rank selected only from training.

## VERIFIED executed checks
- Earlier complete family: 3,136,000 formulas x 500 days = 1,568,000,000 checks, top training 167/500 versus following 105/500.
- Larger formula family: 12,000,000 formulas x 500 days = 6,000,000,000 checks in three 4 million batches.
- Formula ID 2,445,303: 157/500 training, 120/500 next. ID 4,651,965: 168/500 training, 117/500 next. ID 9,279,702: 156/500 training, 116/500 next.
- Cross-period study: 240,000 predetermined distinct formula IDs x 1000 target dates = 240,000,000 checks; Pearson training-versus-next-500 hit-count correlation = -0.00181623.
- Top 1% past-performing formulas averaged 136.58/500 in first period but 112.18/500 in next; all sampled formulas averaged 112.07/500 next.
- 10,000-rule dynamically weighted expert ensemble: seven-day vote scored 281/500 in middle validation, 286/500 in last 500; equal-vote baseline 284/500 in middle but only 256/500 last. Do not choose by looking at last block.
- 18,000 fixed positional rules x 1500 dates = 27,000,000 causal run/rest-state checks: in last 500 days, next-day hit rates were 23.7428% after 0 preceding consecutive hits; 23.8367% after 1; 23.7689% after 2; 23.7973% after 3+.
- For 0 to 4+ hits in the prior 7 days, next-day rates were approximately 23.71–23.83%. Rule-day observations are highly correlated.

## Runner, status, and limitation
- Compiled C++ research source: research/lottery/mb_triangle_100b.cpp; GitHub Actions workflow: .github/workflows/kq247-xsmb-100b.yml.
- Intended full runner workload 200,704,000 x 500 = 100,352,000,000 rule-day checks. Full run completion NOT VERIFIED. Never count planned checks as completed.
- The study does not prove all possible formulas fail, but these particular triangle families do not exhibit stable held-out gains.
- No claim of 338/347/350/360/372 successes reproduced. Do not promote a research candidate into locked snapshots.

Last verified changes were research files only, not production.
