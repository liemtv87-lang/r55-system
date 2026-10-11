-- KQ247 independent reconstruction of the *338-signal family*, NOT original 338/500 source code.
-- Research only: function installed on Neon but NOT attached to the production triggers or active snapshot.
-- MB/XSMT/XSMN station-local 500 draws; hard excludes repeated numbers in most recent two draw results.
-- 2026-10-11 XSMB JS research: selected among 2500 configurations, 312/500 training, 281/500 holdout.
-- This SQL implementation HAS NOT been replayed over all 500 historical dates. It does not certify 338/500.
-- Historical full_results missing in 28/36 stations for at least one of three most recent station draws.

CREATE OR REPLACE FUNCTION public.kq247_338_family_shadow_v1(p_day date, p_region text, p_station text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  cnt int := 0;
  h record;
  day_seen boolean[];
  alive boolean[] := array_fill(true,ARRAY[100]);
  hits7 int[] := array_fill(0,ARRAY[100]);
  hits14 int[] := array_fill(0,ARRAY[100]);
  hits30 int[] := array_fill(0,ARRAY[100]);
  hits60 int[] := array_fill(0,ARRAY[100]);
  hits500 int[] := array_fill(0,ARRAY[100]);
  recent int[] := array_fill(0,ARRAY[100]);
  prior2 int[] := array_fill(0,ARRAY[100]);
  gap int[] := array_fill(501,ARRAY[100]);
  running int[] := array_fill(0,ARRAY[100]);
  week_hits int[] := array_fill(0,ARRAY[100]);
  head7 int[] := array_fill(0,ARRAY[10]);
  tail7 int[] := array_fill(0,ARRAY[10]);
  head14 int[] := array_fill(0,ARRAY[10]);
  tail14 int[] := array_fill(0,ARRAY[10]);
  triangle double precision[] := array_fill(0.0::double precision,ARRAY[100]);
  cooc int[][] := array_fill(0,ARRAY[100,100]);
  picked int[] := ARRAY[]::int[];
  excluded text[] := ARRAY[]::text[];
  last_date date;
  previous_special text := '';
  previous2_special text := '';
  special text;
  digits int[];
  next_digits int[];
  uniq int[];
  val text;
  dval int;
  n int;
  j int;
  a int;
  b int;
  idx int;
  other int;
  layer int;
  slot int;
  in_day int;
  head_n int;
  tail_n int;
  selected int;
  total_sc double precision;
  best_sc double precision;
  frequency_gap double precision;
  run_score double precision;
  score double precision;
  lambda double precision := 2.300558767048642;
  w double precision[] := ARRAY[
  2.2122645095456392,3.4032781118527056,0.419423345063813,0.466731015117839,
  0.016883601387031377,4.892769495397806,0.3180928962491453,1.4184149968950077,
  0.40621977639384566,4.859947347920388,0.6175389586435631,1.0845789155876264,
  0.3932485059723258,0.5299807878062129,0.012706519941799345,0.36393480909056963
  ];
BEGIN
 IF p_day IS NULL OR p_region NOT IN ('mb','mt','mn') OR p_station IS NULL OR length(p_station)=0 THEN
    RAISE EXCEPTION 'invalid_shadow_inputs';
 END IF;
 FOR h IN
    SELECT draw_date,all2,full_results FROM public.kq247_draw_history
    WHERE region=p_region AND station=p_station AND draw_date<p_day
    ORDER BY draw_date DESC LIMIT 500
 LOOP
  cnt:=cnt+1;
  IF cnt=1 THEN last_date:=h.draw_date; END IF;
  IF jsonb_typeof(h.all2)<>'array' OR jsonb_array_length(h.all2)<>(CASE WHEN p_region='mb' THEN 27 ELSE 18 END) THEN
    RAISE EXCEPTION 'invalid_actual_draw_%_%_%',p_day,p_region,p_station;
  END IF;
  day_seen:=array_fill(false,ARRAY[100]);
  FOR val IN SELECT jsonb_array_elements_text(h.all2)
  LOOP
    IF val !~ '^[0-9]{2}$' THEN RAISE EXCEPTION 'invalid_number'; END IF;
    dval:=val::int;
    idx:=dval+1;
    day_seen[idx]:=true;
    hits500[idx]:=hits500[idx]+1;
    IF cnt<=60 THEN hits60[idx]:=hits60[idx]+1;END IF;
    IF cnt<=30 THEN hits30[idx]:=hits30[idx]+1;END IF;
    IF cnt<=14 THEN 
      hits14[idx]:=hits14[idx]+1;
      head14[dval/10+1]:=head14[dval/10+1]+1;
      tail14[dval%10+1]:=tail14[dval%10+1]+1;
    END IF;
    IF cnt<=7 THEN
      hits7[idx]:=hits7[idx]+1;
      head7[dval/10+1]:=head7[dval/10+1]+1;
      tail7[dval%10+1]:=tail7[dval%10+1]+1;
    END IF;
    IF gap[idx]=501 THEN gap[idx]:=cnt;END IF;
    IF EXTRACT(DOW FROM h.draw_date)=EXTRACT(DOW FROM p_day) THEN
      week_hits[idx]:=week_hits[idx]+1;
    END IF;
    IF cnt=1 THEN recent[idx]:=recent[idx]+1; END IF;
    IF cnt=2 THEN prior2[idx]:=prior2[idx]+1;END IF;
  END LOOP;
  IF cnt<=7 THEN
    FOR n IN 1..100 LOOP
      IF alive[n] THEN
        IF day_seen[n] THEN running[n]:=running[n]+1;
        ELSE alive[n]:=false; END IF;
      END IF;
    END LOOP;
  END IF;
  IF cnt<=14 THEN
    uniq:=ARRAY(SELECT k-1 FROM generate_series(1,100) k WHERE day_seen[k]);
    IF cardinality(uniq)>1 THEN
      FOR a IN 1..cardinality(uniq)-1 LOOP
        FOR b IN a+1..cardinality(uniq) LOOP
          cooc[uniq[a]+1][uniq[b]+1]:=cooc[uniq[a]+1][uniq[b]+1]+1;
          cooc[uniq[b]+1][uniq[a]+1]:=cooc[uniq[b]+1][uniq[a]+1]+1;
        END LOOP;
      END LOOP;
    END IF;
  END IF;
  IF cnt<=3 THEN
    IF jsonb_typeof(h.full_results)<>'array' THEN RAISE EXCEPTION 'missing_full_results_for_338_source'; END IF;
    special:=CASE WHEN p_region='mb' THEN h.full_results->>0
      WHEN length(regexp_replace(coalesce(h.full_results->>0,''),'[^0-9]','','g'))=6 THEN h.full_results->>0
      ELSE h.full_results->>(jsonb_array_length(h.full_results)-1) END;
    special:=regexp_replace(COALESCE(special,''),'[^0-9]','','g');
    IF special !~ '^[0-9]{5,6}$' THEN RAISE EXCEPTION 'invalid_special_%_%_%',p_day,p_region,p_station;END IF;
    IF cnt=1 THEN previous_special:=special;END IF;
    IF cnt=2 THEN previous2_special:=special;END IF;
    SELECT array_agg(SUBSTR(special,i,1)::int ORDER BY i) INTO digits FROM generate_series(1,length(special)) i;
    FOR layer IN 0..3 LOOP
       IF cardinality(digits)<2 THEN EXIT;END IF;
       next_digits:=ARRAY[]::int[];
       FOR j IN 1..cardinality(digits)-1 LOOP
          a:=digits[j]*10+digits[j+1];
          b:=digits[j+1]*10+digits[j];
          triangle[a+1]:=triangle[a+1]+((1.0/cnt)*(layer+1)/4);
          triangle[b+1]:=triangle[b+1]+((1.0/cnt)*(layer+1)/8);
          next_digits:=array_append(next_digits,(digits[j]+digits[j+1])%10);
       END LOOP;
       digits:=next_digits;
    END LOOP;
  END IF;
 END LOOP;
 IF cnt<>500 OR last_date IS NULL OR p_day-last_date>8 OR (p_region='mb' AND p_day-last_date<>1) THEN
   RAISE EXCEPTION 'incomplete_or_stale_500_history:%/%/% %',p_day,p_region,p_station,cnt;
 END IF;
 -- A small special-prize position/difference bridge across latest two completed draws.
 FOR j IN 1..4 LOOP
   a:=(substr(previous_special,j,1)::int+substr(previous2_special,j,1)::int)%10;
   b:=abs(substr(previous_special,j,1)::int-substr(previous2_special,j,1)::int);
   triangle[a*10+b+1]:=triangle[a*10+b+1]+0.5;
   triangle[b*10+a+1]:=triangle[b*10+a+1]+0.5;
 END LOOP;
 FOR n IN 0..99 LOOP
    IF recent[n+1]>0 AND prior2[n+1]>0 THEN excluded:=array_append(excluded,lpad(n::text,2,'0'));END IF;
 END LOOP;
 FOR slot IN 1..3 LOOP
   selected:=NULL;best_sc:=-1e30;
   FOR n IN 0..99 LOOP
      IF lpad(n::text,2,'0')=ANY(excluded) OR n=ANY(picked) THEN CONTINUE;END IF;
      idx:=n+1;
      IF gap[idx]<=3 THEN frequency_gap:=1;
      ELSIF gap[idx]<=7 THEN frequency_gap:=0.6;
      ELSIF gap[idx]<=14 THEN frequency_gap:=0.1;
      ELSIF gap[idx]>20 THEN frequency_gap:=-0.5;
      ELSE frequency_gap:=0;END IF;
      run_score:=CASE WHEN hits7[idx]>0 AND hits14[idx]>hits7[idx] THEN 1.0 ELSE 0.0 END;
      score:=
       w[1]*hits7[idx]/7.0+w[2]*hits14[idx]/14.0+w[3]*hits30[idx]/30.0+
       w[4]*hits60[idx]/60.0+w[5]*hits500[idx]/500.0+
       w[6]*frequency_gap+w[7]*running[idx]/4.0+
       w[8]*triangle[idx]/2.0+
       w[9]*head7[n/10+1]/24.0+w[10]*tail7[n%10+1]/24.0+
       w[11]*head14[n/10+1]/45.0+w[12]*tail14[n%10+1]/45.0+
       w[13]*week_hits[idx]/100.0+w[14]*recent[idx]/4.0+
       w[15]*(CASE WHEN n%11=0 THEN 1.0 ELSE 0 END)+w[16]*run_score;
      IF cardinality(picked)>0 THEN
        FOREACH other IN ARRAY picked LOOP
           score:=score-lambda*cooc[idx][other+1]/14.0;
        END LOOP;
      END IF;
      IF score>best_sc THEN best_sc:=score;selected:=n;END IF;
   END LOOP;
   IF selected IS NULL THEN RAISE EXCEPTION 'three_lotto_exhausted'; END IF;
   picked:=array_append(picked,selected);
 END LOOP;
 RETURN jsonb_build_object(
   'picks',(SELECT jsonb_agg(lpad(u.v::text,2,'0') ORDER BY u.v) FROM unnest(picked) AS u(v)),
   'source_draws',cnt,'source_last_date',last_date,
   'excluded',to_jsonb(excluded),
   'model','KQ247_338_FAMILY_RECONSTRUCTED_UNVERIFIED_V1',
   'verified_338_of_500',false,
   'uses_prior_predictions',false,
   'independent_source_only',true,
   'candidate_weight_profile','20261011_338signal_search_1238',
   'related_js_search_train_hit_days',312,'related_js_search_holdout_hit_days',281,'sql_shadow_backtest_verified',false
 );
END $function$

