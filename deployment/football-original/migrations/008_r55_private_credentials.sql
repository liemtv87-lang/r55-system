CREATE TABLE IF NOT EXISTS football_runtime_credentials (
 name text PRIMARY KEY,
 secret text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE football_runtime_credentials IS 'Private server-side credentials for the R55 Telegram dispatcher; never expose through public APIs';