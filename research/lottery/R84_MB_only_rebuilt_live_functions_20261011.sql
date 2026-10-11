-- KQ247 XSMB-only R84 REG7/W90 reconstruction deployed to Neon 2026-10-11.
-- IMPORTANT: The original R84 339/500 source was NOT recovered. Do not claim 339/500 for this reconstruction.
-- Historical JS XSMB replay using matching feature family: 280/500 train, 286/500 independent holdout with 3 picks.
-- Historical shortened doubles proxy: 205/500 independent holdout with 2 double picks; not exact SQL score replay.
-- All inputs from 500 latest completed station-specific results, never previous-day stored forecast; exclude all numbers present in BOTH prior actual draw dates.
-- For predictions on 2026-10-12, newly computed MB 3 lotto/2 doubles = 35 51 75 / 33 44, matching existing locked snapshot, so historical snapshot records not mutated.
-- All XSMT/XSMN rows remain on their prior daily500 model. No URL, license or Telegram schedule changed.
-- Two additional independent checks: temporary table triggers for station, legacy and MB solo snapshot generated all picks and retained D50/D60/D75 and 500 three-digit picks; customer Neon web and bot preview succeeded.

-- kq247_mb_r84_reg7_shadow_v2
CREATE OR REPLACE FUNCTION public.kq247_mb_r84_reg7_shadow_v2(p_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH history AS MATERIALIZED (
  SELECT row_number() OVER(ORDER BY d.draw_date DESC) AS rn, d.draw_date, d.all2,d.full_results
  FROM (SELECT draw_date,all2,full_results FROM public.kq247_draw_history
        WHERE region='mb' AND station='XSMB' AND draw_date<p_day
        ORDER BY draw_date DESC LIMIT 500) d
), guard AS (
  SELECT COUNT(*) AS n, MAX(draw_date) AS last_date,
         COUNT(*) FILTER(WHERE jsonb_typeof(all2)='array' AND jsonb_array_length(all2)=27) AS complete_n
  FROM history
), hits AS MATERIALIZED (
  SELECT h.rn,h.draw_date,v.n::text AS num
  FROM history h CROSS JOIN LATERAL jsonb_array_elements_text(h.all2) v(n)
  WHERE v.n ~ '^[0-9]{2}$'
), frequency AS (
  SELECT num,
    COUNT(*) FILTER(WHERE rn<=7) AS f7,
    COUNT(*) FILTER(WHERE rn<=14) AS f14,
    COUNT(*) FILTER(WHERE rn<=30) AS f30,
    COUNT(*) FILTER(WHERE rn<=60) AS f60,
    COUNT(*) FILTER(WHERE rn<=90) AS f90,
    COUNT(*) AS f500,
    COUNT(*) FILTER(WHERE rn=1) AS prev_occ,
    MIN(rn) AS gap
  FROM hits GROUP BY num
), head_tail AS (
  SELECT LEFT(num,1) AS h,RIGHT(num,1) AS t,COUNT(*) AS ct
  FROM hits WHERE rn<=7 GROUP BY LEFT(num,1),RIGHT(num,1)
), head_freq AS (
  SELECT h, SUM(ct) AS ct FROM head_tail GROUP BY h
), tail_freq AS (
  SELECT t, SUM(ct) AS ct FROM head_tail GROUP BY t
), special_recent AS (
  SELECT h.rn,h.full_results->>0 AS special
  FROM history h WHERE h.rn<=3 AND jsonb_typeof(h.full_results)='array'
), triangle AS (
  SELECT SUBSTRING(s.special FROM j FOR 2) AS num,SUM((4-s.rn)*1.0) AS tri
  FROM special_recent s, LATERAL generate_series(1,4) j
  WHERE s.special ~ '^[0-9]{5}$'
  GROUP BY SUBSTRING(s.special FROM j FOR 2)
), sum_diff AS (
  SELECT LPAD(((v1.n::int+v2.n::int)%100)::text,2,'0') AS nsum,
         LPAD(ABS(v1.n::int-v2.n::int)::text,2,'0') AS ndiff
  FROM history a JOIN history b ON a.rn=1 AND b.rn=2
  CROSS JOIN LATERAL jsonb_array_elements_text(a.all2) WITH ORDINALITY v1(n,i)
  JOIN LATERAL jsonb_array_elements_text(b.all2) WITH ORDINALITY v2(n,i)
    ON v2.i=v1.i
), sum_freq AS (SELECT nsum AS num,COUNT(*) AS votes FROM sum_diff GROUP BY nsum),
diff_freq AS (SELECT ndiff AS num,COUNT(*) AS votes FROM sum_diff GROUP BY ndiff),
exclusions AS (
  SELECT DISTINCT a.num FROM hits a JOIN hits b ON a.num=b.num AND a.rn=1 AND b.rn=2
), numbers AS (SELECT LPAD(i::text,2,'0') AS num FROM generate_series(0,99) AS i),
features AS (
  SELECT g.num,COALESCE(f.f7,0) AS f7,
    COALESCE(f.f90,0) AS f90,
    COALESCE(f.f30,0) AS f30,
    COALESCE(f.prev_occ,0) AS prev_occ,
    COALESCE(f.gap,501) AS gap,
    COALESCE(hf.ct,0)+COALESCE(tf.ct,0) AS headtail7,
    COALESCE(t.tri,0) AS triangle3,
    COALESCE(sf.votes,0) AS position_sum,
    COALESCE(df.votes,0) AS position_diff,
    (e.num IS NOT NULL) AS excluded
  FROM numbers g
  LEFT JOIN frequency f ON f.num=g.num
  LEFT JOIN head_freq hf ON hf.h=LEFT(g.num,1)
  LEFT JOIN tail_freq tf ON tf.t=RIGHT(g.num,1)
  LEFT JOIN triangle t ON t.num=g.num
  LEFT JOIN sum_freq sf ON sf.num=g.num
  LEFT JOIN diff_freq df ON df.num=g.num
  LEFT JOIN exclusions e ON e.num=g.num
), regime AS (
  SELECT count(*) FILTER(WHERE f7>=2) AS seven_hot_numbers,
         COALESCE(sum(f7),0) AS seven_lotto_draws
  FROM features
), ranked AS (
  SELECT f.num,
         CASE WHEN r.seven_hot_numbers>=57 THEN 'R81_7DAY_REGIME' ELSE 'R75_90DAY_REGIME' END AS branch,
         (CASE WHEN r.seven_hot_numbers>=57
             THEN 0.47*(f.f90/90.0)+0.28*(f.f30/30.0)+0.25*(f.f7/7.0)
               +0.03*(f.headtail7/54.0)+0.03*(f.position_sum/27.0)
               +0.025*(f.position_diff/27.0)+0.025*(f.triangle3/12.0)
               -0.025*f.prev_occ-0.03*(CASE WHEN f.gap>9 THEN 1 ELSE 0 END)
             ELSE 0.6*(f.f90/90.0)+0.4*(f.f30/30.0)
               +0.02*(f.headtail7/54.0)+0.025*(f.position_sum/27.0)
               +0.025*(f.position_diff/27.0)-0.025*(f.triangle3/12.0)
               -0.025*f.prev_occ-0.02*(CASE WHEN f.gap>9 THEN 1 ELSE 0 END)
         END) AS score
  FROM features f CROSS JOIN regime r WHERE NOT f.excluded
), top3 AS (
  SELECT num,branch FROM ranked ORDER BY score DESC,num ASC LIMIT 3
)
SELECT CASE
 WHEN g.n<>500 OR g.complete_n<>500 OR g.last_date IS NULL OR p_day-g.last_date<>1
  THEN jsonb_build_object('ok',false,'error','missing_complete_previous_500_mb_results','source_draws',g.n,'complete_draws',g.complete_n,'source_last_date',g.last_date)
 WHEN (SELECT COUNT(*) FROM special_recent WHERE special ~ '^[0-9]{5}$')<3
  THEN jsonb_build_object('ok',false,'error','missing_previous_3_special_prizes')
 ELSE jsonb_build_object('ok',true,'picks', (SELECT COALESCE(jsonb_agg(num ORDER BY num),'[]'::jsonb) FROM top3),
        'source_draws',g.n,'source_last_date',g.last_date,'excluded',(SELECT COALESCE(jsonb_agg(num ORDER BY num),'[]'::jsonb) FROM exclusions),
        'model','R84_REG7_W90_REBUILT_XSMB_SHADOW_V2','source_only_independent_daily',true,
        'uses_previous_day_forecast',false,'historic_339_reproduced',false,
        'regime', (SELECT branch FROM top3 LIMIT 1),
        'basis','R75 six saved coefficients and R84 stored REG7_W90_M0 family; missing original score vectors/params')
 END
FROM guard g
$function$
;

-- kq247_mb_r84_double_shadow_v1
CREATE OR REPLACE FUNCTION public.kq247_mb_r84_double_shadow_v1(p_day date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
WITH history AS MATERIALIZED (
  SELECT row_number() OVER(ORDER BY d.draw_date DESC) AS rn, d.draw_date, d.all2,d.full_results
  FROM (SELECT draw_date,all2,full_results FROM public.kq247_draw_history
        WHERE region='mb' AND station='XSMB' AND draw_date<p_day
        ORDER BY draw_date DESC LIMIT 500) d
), guard AS (
  SELECT COUNT(*) AS n, MAX(draw_date) AS last_date,
         COUNT(*) FILTER(WHERE jsonb_typeof(all2)='array' AND jsonb_array_length(all2)=27) AS complete_n
  FROM history
), hits AS MATERIALIZED (
  SELECT h.rn,h.draw_date,v.n::text AS num
  FROM history h CROSS JOIN LATERAL jsonb_array_elements_text(h.all2) v(n)
  WHERE v.n ~ '^[0-9]{2}$'
), frequency AS (
  SELECT num,
    COUNT(*) FILTER(WHERE rn<=7) AS f7,
    COUNT(*) FILTER(WHERE rn<=14) AS f14,
    COUNT(*) FILTER(WHERE rn<=30) AS f30,
    COUNT(*) FILTER(WHERE rn<=60) AS f60,
    COUNT(*) FILTER(WHERE rn<=90) AS f90,
    COUNT(*) AS f500,
    COUNT(*) FILTER(WHERE rn=1) AS prev_occ,
    MIN(rn) AS gap
  FROM hits GROUP BY num
), head_tail AS (
  SELECT LEFT(num,1) AS h,RIGHT(num,1) AS t,COUNT(*) AS ct
  FROM hits WHERE rn<=7 GROUP BY LEFT(num,1),RIGHT(num,1)
), head_freq AS (
  SELECT h, SUM(ct) AS ct FROM head_tail GROUP BY h
), tail_freq AS (
  SELECT t, SUM(ct) AS ct FROM head_tail GROUP BY t
), special_recent AS (
  SELECT h.rn,h.full_results->>0 AS special
  FROM history h WHERE h.rn<=3 AND jsonb_typeof(h.full_results)='array'
), triangle AS (
  SELECT SUBSTRING(s.special FROM j FOR 2) AS num,SUM((4-s.rn)*1.0) AS tri
  FROM special_recent s, LATERAL generate_series(1,4) j
  WHERE s.special ~ '^[0-9]{5}$'
  GROUP BY SUBSTRING(s.special FROM j FOR 2)
), sum_diff AS (
  SELECT LPAD(((v1.n::int+v2.n::int)%100)::text,2,'0') AS nsum,
         LPAD(ABS(v1.n::int-v2.n::int)::text,2,'0') AS ndiff
  FROM history a JOIN history b ON a.rn=1 AND b.rn=2
  CROSS JOIN LATERAL jsonb_array_elements_text(a.all2) WITH ORDINALITY v1(n,i)
  JOIN LATERAL jsonb_array_elements_text(b.all2) WITH ORDINALITY v2(n,i)
    ON v2.i=v1.i
), sum_freq AS (SELECT nsum AS num,COUNT(*) AS votes FROM sum_diff GROUP BY nsum),
diff_freq AS (SELECT ndiff AS num,COUNT(*) AS votes FROM sum_diff GROUP BY ndiff),
exclusions AS (
  SELECT DISTINCT a.num FROM hits a JOIN hits b ON a.num=b.num AND a.rn=1 AND b.rn=2
), numbers AS (SELECT LPAD(i::text,2,'0') AS num FROM generate_series(0,99) AS i),
features AS (
  SELECT g.num,COALESCE(f.f7,0) AS f7,
    COALESCE(f.f90,0) AS f90,
    COALESCE(f.f30,0) AS f30,
    COALESCE(f.prev_occ,0) AS prev_occ,
    COALESCE(f.gap,501) AS gap,
    COALESCE(hf.ct,0)+COALESCE(tf.ct,0) AS headtail7,
    COALESCE(t.tri,0) AS triangle3,
    COALESCE(sf.votes,0) AS position_sum,
    COALESCE(df.votes,0) AS position_diff,
    (e.num IS NOT NULL) AS excluded
  FROM numbers g
  LEFT JOIN frequency f ON f.num=g.num
  LEFT JOIN head_freq hf ON hf.h=LEFT(g.num,1)
  LEFT JOIN tail_freq tf ON tf.t=RIGHT(g.num,1)
  LEFT JOIN triangle t ON t.num=g.num
  LEFT JOIN sum_freq sf ON sf.num=g.num
  LEFT JOIN diff_freq df ON df.num=g.num
  LEFT JOIN exclusions e ON e.num=g.num
), regime AS (
  SELECT count(*) FILTER(WHERE f7>=2) AS seven_hot_numbers,
         COALESCE(sum(f7),0) AS seven_lotto_draws
  FROM features
), ranked AS (
  SELECT f.num,
         CASE WHEN r.seven_hot_numbers>=57 THEN 'R81_7DAY_REGIME' ELSE 'R75_90DAY_REGIME' END AS branch,
         (CASE WHEN r.seven_hot_numbers>=57
             THEN 0.47*(f.f90/90.0)+0.28*(f.f30/30.0)+0.25*(f.f7/7.0)
               +0.03*(f.headtail7/54.0)+0.03*(f.position_sum/27.0)
               +0.025*(f.position_diff/27.0)+0.025*(f.triangle3/12.0)
               -0.025*f.prev_occ-0.03*(CASE WHEN f.gap>9 THEN 1 ELSE 0 END)
             ELSE 0.6*(f.f90/90.0)+0.4*(f.f30/30.0)
               +0.02*(f.headtail7/54.0)+0.025*(f.position_sum/27.0)
               +0.025*(f.position_diff/27.0)-0.025*(f.triangle3/12.0)
               -0.025*f.prev_occ-0.02*(CASE WHEN f.gap>9 THEN 1 ELSE 0 END)
         END) AS score
  FROM features f CROSS JOIN regime r WHERE NOT f.excluded AND f.num ~ '^(00|11|22|33|44|55|66|77|88|99)$'
), top3 AS (
  SELECT num,branch FROM ranked ORDER BY score DESC,num ASC LIMIT 2
)
SELECT CASE
 WHEN g.n<>500 OR g.complete_n<>500 OR g.last_date IS NULL OR p_day-g.last_date<>1
  THEN jsonb_build_object('ok',false,'error','missing_complete_previous_500_mb_results','source_draws',g.n,'complete_draws',g.complete_n,'source_last_date',g.last_date)
 WHEN (SELECT COUNT(*) FROM special_recent WHERE special ~ '^[0-9]{5}$')<3
  THEN jsonb_build_object('ok',false,'error','missing_previous_3_special_prizes')
 ELSE jsonb_build_object('ok',true,'picks', (SELECT COALESCE(jsonb_agg(num ORDER BY num),'[]'::jsonb) FROM top3),
        'source_draws',g.n,'source_last_date',g.last_date,'excluded',(SELECT COALESCE(jsonb_agg(num ORDER BY num),'[]'::jsonb) FROM exclusions),
        'model','R84_REG7_W90_DOUBLE_REBUILT_XSMB_SHADOW_V1','source_only_independent_daily',true,
        'uses_previous_day_forecast',false,'historic_339_reproduced',false,'method_applied_to_doubles',true,'double_tested_separately',false,
        'regime', (SELECT branch FROM top3 LIMIT 1),
        'basis','R75 six saved coefficients and R84 stored REG7_W90_M0 family; missing original score vectors/params')
 END
FROM guard g
$function$
;

-- kq247_prepare_new_station_snapshot
CREATE OR REPLACE FUNCTION public.kq247_prepare_new_station_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE r jsonb; d jsonb;
BEGIN
  IF NEW.region='mb' AND NEW.station='XSMB' THEN
     r:=public.kq247_mb_r84_reg7_shadow_v2(NEW.prediction_date);
     d:=public.kq247_mb_r84_double_shadow_v1(NEW.prediction_date);
     IF COALESCE((r->>'ok')::boolean,false)=false OR COALESCE((d->>'ok')::boolean,false)=false THEN
       RAISE EXCEPTION 'KQ247_MB_R84_REBUILD_DATA_GATE_FAILED: % / %',r,d;
     END IF;
  ELSE
     r:=public.kq247_daily_independent_500_v3(NEW.prediction_date,NEW.region,NEW.station);
     d:=public.kq247_daily_double_500_v1(NEW.prediction_date,NEW.region,NEW.station);
  END IF;
  IF jsonb_array_length(r->'picks')<>3 OR jsonb_array_length(d->'picks')<>2 OR
    (r->>'source_draws')::integer<>500 OR (d->>'source_draws')::integer<>500
  THEN RAISE EXCEPTION 'incomplete_independent_lotto3_or_double_%_%',NEW.region,NEW.station;END IF;
  NEW.lotto3:=r->'picks';NEW.doubles:=d->'picks';NEW.model:=r->>'model';
  NEW.source_draws:=(r->>'source_draws')::int;
  NEW.source_last_date:=(r->>'source_last_date')::date;
  NEW.fingerprint:=md5(NEW.prediction_date::text||'|'||NEW.region||'|'||NEW.station||'|'||NEW.lotto3::text||'|'||NEW.doubles::text);
  NEW.diagnostics:=coalesce(NEW.diagnostics,'{}'::jsonb) || jsonb_build_object(
     'daily_500_lotto_independent',r,'daily_500_doubles_independent',d,
     'source_policy','500_recent_station_draws_before_prediction_day',
     'previous_predictions_used',false,'r84_mb_only',NEW.region='mb' AND NEW.station='XSMB');
  RETURN NEW;
END $function$
;

-- kq247_prepare_new_legacy_snapshot
CREATE OR REPLACE FUNCTION public.kq247_prepare_new_legacy_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE r jsonb; d jsonb; de jsonb;
BEGIN
  de:=NEW.prediction->'de';
  IF jsonb_typeof(de)<>'object' OR jsonb_typeof(de->'dan50')<>'array' OR
     jsonb_typeof(de->'dan60')<>'array' OR jsonb_typeof(de->'dan75')<>'array' OR
     jsonb_typeof(de->'three_digit')<>'array'
  THEN RAISE EXCEPTION 'missing_de_3c_%_%',NEW.region,NEW.station; END IF;
  IF jsonb_array_length(de->'dan50')<>50 OR jsonb_array_length(de->'dan60')<>60 OR
     jsonb_array_length(de->'dan75')<>75 OR jsonb_array_length(de->'three_digit')<>500
  THEN RAISE EXCEPTION 'invalid_de_3c_count_%_%',NEW.region,NEW.station;END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(de->'three_digit') x(n)
             WHERE NOT(de->'dan75' ? RIGHT(x.n,2)))
  THEN RAISE EXCEPTION '3c_not_subset_d75_%_%',NEW.region,NEW.station;END IF;
  IF NEW.region='mb' AND NEW.station='XSMB' THEN
     r:=public.kq247_mb_r84_reg7_shadow_v2(NEW.prediction_date);
     d:=public.kq247_mb_r84_double_shadow_v1(NEW.prediction_date);
     IF COALESCE((r->>'ok')::boolean,false)=false OR COALESCE((d->>'ok')::boolean,false)=false THEN
       RAISE EXCEPTION 'KQ247_MB_R84_REBUILD_DATA_GATE_FAILED: % / %',r,d;
     END IF;
  ELSE
     r:=public.kq247_daily_independent_500_v3(NEW.prediction_date,NEW.region,NEW.station);
     d:=public.kq247_daily_double_500_v1(NEW.prediction_date,NEW.region,NEW.station);
  END IF;
  IF jsonb_array_length(r->'picks')<>3 OR jsonb_array_length(d->'picks')<>2 OR
     (r->>'source_draws')::int<>500 OR (d->>'source_draws')::int<>500
  THEN RAISE EXCEPTION 'incomplete_independent_lotto3_double_%_%',NEW.region,NEW.station;END IF;
  NEW.prediction:=NEW.prediction||jsonb_build_object(
    'three_lotto',r->'picks','doubles',d->'picks',
    'lotto3_strategy',r,'doubles_daily_strategy',d
  );
  RETURN NEW;
END $function$
;

-- kq247_prepare_new_lotto3_snapshot
CREATE OR REPLACE FUNCTION public.kq247_prepare_new_lotto3_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE r jsonb;
BEGIN
  r:=public.kq247_mb_r84_reg7_shadow_v2(NEW.prediction_date);
  IF COALESCE((r->>'ok')::boolean,false)=false THEN
     RAISE EXCEPTION 'KQ247_MB_R84_REBUILD_DATA_GATE_FAILED: %',r;
  END IF;
  IF jsonb_array_length(r->'picks')<>3 OR (r->>'source_draws')::int<>500
  THEN RAISE EXCEPTION 'cannot_lock_unverified_3_lotto';END IF;
  NEW.picks:=r->'picks';NEW.model:=r->>'model';
  NEW.source_draws:=(r->>'source_draws')::int;
  NEW.source_last_date:=(r->>'source_last_date')::date;
  NEW.fingerprint:=md5(NEW.prediction_date::text||'|'||NEW.picks::text||'|'||NEW.model);
  RETURN NEW;
END $function$
;
