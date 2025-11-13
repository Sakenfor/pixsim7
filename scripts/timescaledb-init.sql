-- TimescaleDB Initialization Script
-- Automatically run when TimescaleDB container starts for the first time

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Note: The log_entries table will be created by Alembic migrations
-- This script just ensures TimescaleDB extension is available

-- After running migrations, convert log_entries to hypertable with:
-- SELECT create_hypertable('log_entries', 'timestamp', if_not_exists => TRUE);

-- Optional: Set up retention policy (uncomment after table is created)
-- SELECT add_retention_policy('log_entries', INTERVAL '90 days', if_not_exists => TRUE);

-- Optional: Enable compression (uncomment after table is created)
-- ALTER TABLE log_entries SET (
--   timescaledb.compress,
--   timescaledb.compress_segmentby = 'service,level'
-- );
-- SELECT add_compression_policy('log_entries', INTERVAL '7 days', if_not_exists => TRUE);
