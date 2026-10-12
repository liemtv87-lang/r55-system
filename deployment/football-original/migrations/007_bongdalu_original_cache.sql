-- Local cache for ORIGINAL Bongdalu R55 algorithm port. No Supabase runtime calls.
CREATE TABLE IF NOT EXISTS ops_runtime_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS ops_runtime_expiry ON ops_runtime_state(expires_at);
CREATE TABLE IF NOT EXISTS football_external_history_cache (
  source text NOT NULL,
  cache_key text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (source,cache_key)
);
CREATE INDEX IF NOT EXISTS football_external_cache_expiry ON football_external_history_cache(expires_at);