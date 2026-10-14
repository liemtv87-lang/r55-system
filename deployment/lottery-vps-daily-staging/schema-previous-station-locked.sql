-- Dedicated new independent station snapshot family. No overwrite of old MB locks.
CREATE SCHEMA IF NOT EXISTS kq247_xs_vps;
CREATE TABLE IF NOT EXISTS kq247_xs_vps.previous_station_locked (
 region text NOT NULL CHECK(region IN ('mb','mt','mn')),
 station text NOT NULL CHECK(length(station)>0),
 source_date date NOT NULL,
 predicted_for date NOT NULL,
 source_digest text NOT NULL CHECK(length(source_digest)=64),
 source_prizes integer NOT NULL CHECK(source_prizes IN (18,27)),
 source_positions integer NOT NULL CHECK(source_positions IN (82,107)),
 payload jsonb NOT NULL,
 locked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(region,station,source_date),
 CHECK(predicted_for>source_date),
 CHECK(jsonb_typeof(payload->'lotto3')='array' AND jsonb_array_length(payload->'lotto3')=3),
 CHECK(jsonb_typeof(payload->'doubles')='array' AND jsonb_array_length(payload->'doubles')=2),
 CHECK(jsonb_typeof(payload->'dan50')='array' AND jsonb_array_length(payload->'dan50')=50),
 CHECK(jsonb_typeof(payload->'dan60')='array' AND jsonb_array_length(payload->'dan60')=60),
 CHECK(jsonb_typeof(payload->'dan75')='array' AND jsonb_array_length(payload->'dan75')=75),
 CHECK(jsonb_typeof(payload->'three_digit')='array' AND jsonb_array_length(payload->'three_digit')=500),
 CHECK(payload->>'sourceDate'=source_date::text),
 CHECK(payload->>'region'=region),
 CHECK(payload->>'station'=station),
 CHECK(payload->>'previousForecastsUsed'='false'),
 CHECK(payload->>'exclusionsValidated'='true')
);
CREATE OR REPLACE FUNCTION kq247_xs_vps.deny_previous_station_mutation()
RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN
 RAISE EXCEPTION 'PREVIOUS_STATION_SNAPSHOT_IS_IMMUTABLE';
END $f$;
DROP TRIGGER IF EXISTS prevent_previous_station_locked_change ON kq247_xs_vps.previous_station_locked;
CREATE TRIGGER prevent_previous_station_locked_change
 BEFORE UPDATE OR DELETE ON kq247_xs_vps.previous_station_locked FOR EACH ROW
 EXECUTE FUNCTION kq247_xs_vps.deny_previous_station_mutation();
CREATE OR REPLACE VIEW kq247_xs_vps.latest_previous_station_locked
WITH (security_barrier=true) AS
SELECT DISTINCT ON(region,station) region,station,source_date,predicted_for,
 source_prizes,source_positions,payload,locked_at
FROM kq247_xs_vps.previous_station_locked
WHERE payload->>'allPrizesUsed'='true'
  AND payload->>'exclusionsValidated'='true'
ORDER BY region,station,source_date DESC;
