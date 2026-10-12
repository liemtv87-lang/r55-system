CREATE TABLE IF NOT EXISTS football_r55_native_state(
 key text PRIMARY KEY,
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_football_r55_state_updated ON football_r55_native_state(updated_at);