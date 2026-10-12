CREATE TABLE IF NOT EXISTS football_final_results (
 fixture_id bigint PRIMARY KEY,
 home_score integer NOT NULL CHECK(home_score>=0),
 away_score integer NOT NULL CHECK(away_score>=0),
 fixture_status text NOT NULL CHECK(fixture_status IN ('FT','AET','PEN')),
 source text NOT NULL DEFAULT 'api-football',
 fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_r55_finals_fetched ON football_final_results(fetched_at);