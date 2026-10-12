CREATE TABLE IF NOT EXISTS r55_native_runs (
  job_key text PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL DEFAULT false,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_r55_native_jobs_completed ON r55_native_runs(completed_at);
