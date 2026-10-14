-- Private lotto-only locked snapshot. Public customer endpoints MUST NOT query this
-- until an independently computed full DE/3C payload is available and verified.
CREATE SCHEMA IF NOT EXISTS kq247_xs_vps;
CREATE TABLE IF NOT EXISTS kq247_xs_vps.locked_lotto_daily (
 prediction_date date NOT NULL,
 region text NOT NULL CHECK (region IN ('mb','mt','mn')),
 station text NOT NULL,
 lotto3 jsonb NOT NULL CHECK (jsonb_typeof(lotto3)='array' AND jsonb_array_length(lotto3)=3),
 doubles jsonb NOT NULL CHECK (jsonb_typeof(doubles)='array' AND jsonb_array_length(doubles)=2),
 model text NOT NULL,
 source_last_date date NOT NULL,
 source_draws integer NOT NULL CHECK (source_draws=500),
 source_sha256 text NOT NULL,
 locked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(prediction_date,region,station),
 CONSTRAINT source_before_prediction CHECK(source_last_date<prediction_date)
);
CREATE OR REPLACE FUNCTION kq247_xs_vps.prevent_lotto_stage_edit()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN RAISE EXCEPTION 'LOCKED_LOTTO_STAGE_IMMUTABLE'; END $f$;
DROP TRIGGER IF EXISTS xs_locked_lotto_immutable ON kq247_xs_vps.locked_lotto_daily;
CREATE TRIGGER xs_locked_lotto_immutable
BEFORE UPDATE OR DELETE ON kq247_xs_vps.locked_lotto_daily
FOR EACH ROW EXECUTE FUNCTION kq247_xs_vps.prevent_lotto_stage_edit();
