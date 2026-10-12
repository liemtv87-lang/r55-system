CREATE TABLE IF NOT EXISTS football_snapshots (
  day date PRIMARY KEY,
  payload jsonb NOT NULL,
  source text NOT NULL CHECK (source = 'bongdalu-r55'),
  locked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS football_compact_stats (
  scope text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS football_final_results (
  fixture_id bigint PRIMARY KEY,
  home_score integer NOT NULL CHECK (home_score BETWEEN 0 AND 30),
  away_score integer NOT NULL CHECK (away_score BETWEEN 0 AND 30),
  fixture_status text NOT NULL CHECK (fixture_status = 'FT'),
  source text NOT NULL CHECK (source = 'bongdalu-ft-verified'),
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS r55_job_lock (
  job text PRIMARY KEY,
  owner text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_r55_finals_fetched ON football_final_results(fetched_at);
