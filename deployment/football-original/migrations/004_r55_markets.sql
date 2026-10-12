CREATE TABLE IF NOT EXISTS football_market_cache (
fixture_id bigint PRIMARY KEY,
kickoff timestamptz NOT NULL,
league text NOT NULL,
country text NOT NULL DEFAULT '',
home text NOT NULL,
away text NOT NULL,
markets jsonb NOT NULL DEFAULT '[]'::jsonb,
bookmakers jsonb NOT NULL DEFAULT '[]'::jsonb,
source text NOT NULL,
source_updated_at timestamptz,
fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_r55_market_kickoff ON football_market_cache(kickoff);
CREATE TABLE IF NOT EXISTS football_feed_quota(
day date NOT NULL,
source text NOT NULL,
calls integer NOT NULL DEFAULT 0,
PRIMARY KEY(day,source)
);
CREATE TABLE IF NOT EXISTS football_feed_runs(
id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
date date NOT NULL,
provider text NOT NULL,
state text NOT NULL,
fixture_count integer NOT NULL DEFAULT 0,
odds_count integer NOT NULL DEFAULT 0,
market_count integer NOT NULL DEFAULT 0,
quota_remaining integer,
reason text,
started_at timestamptz NOT NULL DEFAULT now(),
finished_at timestamptz
);