CREATE TABLE IF NOT EXISTS r55_fixture_history (
  day date NOT NULL,
  fixture_id text NOT NULL,
  status text NOT NULL,
  home_games int NOT NULL DEFAULT 0,
  away_games int NOT NULL DEFAULT 0,
  h2h_games int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, fixture_id)
);
CREATE INDEX IF NOT EXISTS r55_fixture_history_status_idx ON r55_fixture_history(day, status);
