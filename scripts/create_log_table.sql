-- Drop existing table if it exists
DROP TABLE IF EXISTS log_entries CASCADE;

-- Create alembic version table if it doesn't exist
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Set the migration version
DELETE FROM alembic_version;
INSERT INTO alembic_version (version_num) VALUES ('6f23b5e5a7ba');

-- Create log_entries table WITHOUT primary key constraint initially
CREATE TABLE log_entries (
    id INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    level VARCHAR(20) NOT NULL,
    service VARCHAR(50) NOT NULL,
    env VARCHAR(20) NOT NULL DEFAULT 'dev',
    msg TEXT,

    -- Correlation fields
    request_id VARCHAR(100),
    job_id INTEGER,
    submission_id INTEGER,
    artifact_id INTEGER,
    provider_job_id VARCHAR(255),

    -- Context fields
    provider_id VARCHAR(50),
    operation_type VARCHAR(50),
    stage VARCHAR(50),
    user_id INTEGER,

    -- Error fields
    error TEXT,
    error_type VARCHAR(100),

    -- Performance fields
    duration_ms INTEGER,
    attempt INTEGER,

    -- Additional context
    extra JSONB,

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create sequence for id
CREATE SEQUENCE log_entries_id_seq;
ALTER TABLE log_entries ALTER COLUMN id SET DEFAULT nextval('log_entries_id_seq');
ALTER SEQUENCE log_entries_id_seq OWNED BY log_entries.id;

-- Convert to TimescaleDB hypertable (must be done before adding primary key)
SELECT create_hypertable('log_entries', 'timestamp', if_not_exists => TRUE);

-- Now add primary key that includes timestamp (required for TimescaleDB)
ALTER TABLE log_entries ADD CONSTRAINT pk_log_entries PRIMARY KEY (id, timestamp);

-- Create indexes for efficient querying
CREATE INDEX idx_logs_job_stage ON log_entries(job_id, stage);
CREATE INDEX idx_logs_job_timestamp ON log_entries(job_id, timestamp DESC);
CREATE INDEX idx_logs_service_level_timestamp ON log_entries(service, level, timestamp DESC);
CREATE INDEX idx_logs_provider_timestamp ON log_entries(provider_id, timestamp DESC);
CREATE INDEX idx_logs_stage_timestamp ON log_entries(stage, timestamp DESC);

-- Single-column indexes
CREATE INDEX ix_log_entries_timestamp ON log_entries(timestamp DESC);
CREATE INDEX ix_log_entries_level ON log_entries(level);
CREATE INDEX ix_log_entries_service ON log_entries(service);
CREATE INDEX ix_log_entries_request_id ON log_entries(request_id);
CREATE INDEX ix_log_entries_job_id ON log_entries(job_id);
CREATE INDEX ix_log_entries_submission_id ON log_entries(submission_id);
CREATE INDEX ix_log_entries_artifact_id ON log_entries(artifact_id);
CREATE INDEX ix_log_entries_provider_job_id ON log_entries(provider_job_id);
CREATE INDEX ix_log_entries_provider_id ON log_entries(provider_id);
CREATE INDEX ix_log_entries_stage ON log_entries(stage);
CREATE INDEX ix_log_entries_user_id ON log_entries(user_id);

-- Set retention policy (auto-delete logs older than 90 days)
SELECT add_retention_policy('log_entries', INTERVAL '90 days', if_not_exists => TRUE);

-- Enable compression (compress data older than 7 days)
ALTER TABLE log_entries SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'service,level'
);
SELECT add_compression_policy('log_entries', INTERVAL '7 days', if_not_exists => TRUE);
