"""add_log_entries_table

Revision ID: 6f23b5e5a7ba
Revises: 1105simplifylineage
Create Date: 2025-11-13 00:19:23.243009

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = '6f23b5e5a7ba'
down_revision = '1105simplifylineage'
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import text

    # Create log_entries table
    op.create_table(
        'log_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('level', sa.String(length=20), nullable=False),
        sa.Column('service', sa.String(length=50), nullable=False),
        sa.Column('env', sa.String(length=20), nullable=False, server_default='dev'),
        sa.Column('msg', sa.Text(), nullable=True),

        # Correlation fields
        sa.Column('request_id', sa.String(length=100), nullable=True),
        sa.Column('job_id', sa.Integer(), nullable=True),
        sa.Column('submission_id', sa.Integer(), nullable=True),
        sa.Column('artifact_id', sa.Integer(), nullable=True),
        sa.Column('provider_job_id', sa.String(length=255), nullable=True),

        # Context fields
        sa.Column('provider_id', sa.String(length=50), nullable=True),
        sa.Column('operation_type', sa.String(length=50), nullable=True),
        sa.Column('stage', sa.String(length=50), nullable=True),
        sa.Column('user_id', sa.Integer(), nullable=True),

        # Error fields
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('error_type', sa.String(length=100), nullable=True),

        # Performance fields
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('attempt', sa.Integer(), nullable=True),

        # Additional context
        sa.Column('extra', sa.JSON(), nullable=True),

        # Metadata
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),

        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for efficient querying
    op.create_index('idx_logs_job_stage', 'log_entries', ['job_id', 'stage'])
    op.create_index('idx_logs_job_timestamp', 'log_entries', ['job_id', 'timestamp'])
    op.create_index('idx_logs_service_level_timestamp', 'log_entries', ['service', 'level', 'timestamp'])
    op.create_index('idx_logs_provider_timestamp', 'log_entries', ['provider_id', 'timestamp'])
    op.create_index('idx_logs_stage_timestamp', 'log_entries', ['stage', 'timestamp'])

    # Single-column indexes
    op.create_index(op.f('ix_log_entries_timestamp'), 'log_entries', ['timestamp'])
    op.create_index(op.f('ix_log_entries_level'), 'log_entries', ['level'])
    op.create_index(op.f('ix_log_entries_service'), 'log_entries', ['service'])
    op.create_index(op.f('ix_log_entries_request_id'), 'log_entries', ['request_id'])
    op.create_index(op.f('ix_log_entries_job_id'), 'log_entries', ['job_id'])
    op.create_index(op.f('ix_log_entries_submission_id'), 'log_entries', ['submission_id'])
    op.create_index(op.f('ix_log_entries_artifact_id'), 'log_entries', ['artifact_id'])
    op.create_index(op.f('ix_log_entries_provider_job_id'), 'log_entries', ['provider_job_id'])
    op.create_index(op.f('ix_log_entries_provider_id'), 'log_entries', ['provider_id'])
    op.create_index(op.f('ix_log_entries_stage'), 'log_entries', ['stage'])
    op.create_index(op.f('ix_log_entries_user_id'), 'log_entries', ['user_id'])

    # Convert to TimescaleDB hypertable (only if TimescaleDB extension is available)
    # This will fail gracefully if not using TimescaleDB
    bind = op.get_bind()
    try:
        # Check if TimescaleDB extension exists
        result = bind.execute(text(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')"
        ))
        has_timescaledb = result.scalar()

        if has_timescaledb:
            # Convert to hypertable (partitioned by timestamp)
            bind.execute(text(
                "SELECT create_hypertable('log_entries', 'timestamp', if_not_exists => TRUE)"
            ))

            # Set retention policy (auto-delete logs older than 90 days)
            bind.execute(text(
                "SELECT add_retention_policy('log_entries', INTERVAL '90 days', if_not_exists => TRUE)"
            ))

            # Enable compression (compress data older than 7 days)
            bind.execute(text("""
                ALTER TABLE log_entries SET (
                    timescaledb.compress,
                    timescaledb.compress_segmentby = 'service,level'
                )
            """))
            bind.execute(text(
                "SELECT add_compression_policy('log_entries', INTERVAL '7 days', if_not_exists => TRUE)"
            ))

            print("✅ TimescaleDB hypertable created with retention and compression policies")
        else:
            print("ℹ️  TimescaleDB not detected, log_entries created as regular table")
    except Exception as e:
        print(f"⚠️  Could not configure TimescaleDB (this is OK if not using TimescaleDB): {e}")


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_log_entries_user_id'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_stage'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_provider_id'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_provider_job_id'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_artifact_id'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_submission_id'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_job_id'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_request_id'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_service'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_level'), table_name='log_entries')
    op.drop_index(op.f('ix_log_entries_timestamp'), table_name='log_entries')

    # Drop composite indexes
    op.drop_index('idx_logs_stage_timestamp', table_name='log_entries')
    op.drop_index('idx_logs_provider_timestamp', table_name='log_entries')
    op.drop_index('idx_logs_service_level_timestamp', table_name='log_entries')
    op.drop_index('idx_logs_job_timestamp', table_name='log_entries')
    op.drop_index('idx_logs_job_stage', table_name='log_entries')

    # Drop table
    op.drop_table('log_entries')
