-- Apply only to local VPS PostgreSQL; no existing table is modified.
CREATE SCHEMA IF NOT EXISTS kq247_xs_vps;
CREATE TABLE IF NOT EXISTS kq247_xs_vps.actual_draws (
 region text NOT NULL CHECK (region IN ('mb','mt','mn')),
 station text NOT NULL,draw_date date NOT NULL,
 all2 jsonb NOT NULL CHECK (jsonb_typeof(all2)='array'),
 full_results jsonb,source text NOT NULL,source_url text,
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(region,station,draw_date)
);
CREATE TABLE IF NOT EXISTS kq247_xs_vps.locked_daily_snapshots(
 prediction_date date NOT NULL,region text NOT NULL CHECK (region IN ('mb','mt','mn')),
 station text NOT NULL,
 lotto3 jsonb NOT NULL CHECK(jsonb_typeof(lotto3)='array' AND jsonb_array_length(lotto3)=3),
 doubles jsonb NOT NULL CHECK(jsonb_typeof(doubles)='array' AND jsonb_array_length(doubles)=2),
 de jsonb NOT NULL CHECK(jsonb_typeof(de)='object'),
 model text NOT NULL,source_last_date date NOT NULL,
 source_draws integer NOT NULL CHECK(source_draws=500),
 lock_payload jsonb NOT NULL,locked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(prediction_date,region,station)
);
CREATE OR REPLACE FUNCTION kq247_xs_vps.prevent_locked_snapshot_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'KQ247_LOCKED_SNAPSHOT_IS_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS kq247_vps_immutable_snapshot ON kq247_xs_vps.locked_daily_snapshots;
CREATE TRIGGER kq247_vps_immutable_snapshot BEFORE UPDATE OR DELETE ON
 kq247_xs_vps.locked_daily_snapshots FOR EACH ROW
 EXECUTE FUNCTION kq247_xs_vps.prevent_locked_snapshot_changes();
