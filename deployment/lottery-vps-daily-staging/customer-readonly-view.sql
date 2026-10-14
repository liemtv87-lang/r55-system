-- Customer-facing read-only view: exposed only after full DE+3C has been locked.
-- Do not read from kq247_xs_vps.locked_lotto_daily (incomplete by design).
CREATE OR REPLACE VIEW kq247_xs_vps.customer_locked_full_snapshots
WITH (security_barrier=true)
AS
SELECT prediction_date,region,station,lotto3,doubles,de,model,source_last_date,locked_at
FROM kq247_xs_vps.locked_daily_snapshots x
WHERE 
 CASE WHEN jsonb_typeof(de->'dan50')='array' THEN jsonb_array_length(de->'dan50') ELSE -1 END =50
 AND CASE WHEN jsonb_typeof(de->'dan60')='array' THEN jsonb_array_length(de->'dan60') ELSE -1 END =60
 AND CASE WHEN jsonb_typeof(de->'dan75')='array' THEN jsonb_array_length(de->'dan75') ELSE -1 END =75
 AND CASE WHEN jsonb_typeof(de->'three_digit')='array' THEN jsonb_array_length(de->'three_digit') ELSE -1 END =500
 AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements_text(
   CASE WHEN jsonb_typeof(de->'three_digit')='array' THEN de->'three_digit' ELSE '[]'::jsonb END
  ) v(number) WHERE NOT (de->'dan75' ? right(v.number,2))
 )
 AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements_text(
   CASE WHEN jsonb_typeof(de->'three_digit')='array' THEN de->'three_digit' ELSE '[]'::jsonb END
  ) v(number) WHERE v.number !~ '^[0-9]{3}$'
 );
