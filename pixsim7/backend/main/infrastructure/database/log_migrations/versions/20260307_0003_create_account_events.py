"""Create account_events satellite table.

Revision ID: 20260307_0003
Revises: 20260307_0002
Create Date: 2026-03-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260307_0003"
down_revision = "20260307_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "account_events",
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("provider_id", sa.String(50), nullable=True),
        sa.Column("generation_id", sa.Integer, nullable=True),
        sa.Column("job_id", sa.Integer, nullable=True),
        sa.Column("cooldown_seconds", sa.Integer, nullable=True),
        sa.Column("credit_type", sa.String(30), nullable=True),
        sa.Column("credit_amount", sa.Integer, nullable=True),
        sa.Column("previous_status", sa.String(30), nullable=True),
        sa.Column("error_code", sa.String(100), nullable=True),
        sa.Column("attempt", sa.Integer, nullable=True),
        sa.Column("extra", sa.JSON, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # Indexes for common query patterns
    op.create_index(
        "idx_account_events_account_timestamp",
        "account_events",
        ["account_id", "timestamp"],
    )
    op.create_index(
        "idx_account_events_event_type_timestamp",
        "account_events",
        ["event_type", "timestamp"],
    )
    op.create_index(
        "idx_account_events_provider_timestamp",
        "account_events",
        ["provider_id", "timestamp"],
    )

    # TimescaleDB hypertable + policies (idempotent, skips on plain PG).
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM create_hypertable(
                    'account_events', 'timestamp',
                    if_not_exists => TRUE,
                    migrate_data => TRUE
                );
                PERFORM add_retention_policy(
                    'account_events',
                    drop_after => INTERVAL '90 days',
                    if_not_exists => TRUE
                );
                ALTER TABLE account_events
                    SET (timescaledb.compress,
                         timescaledb.compress_segmentby = 'account_id, event_type');
                PERFORM add_compression_policy(
                    'account_events',
                    compress_after => INTERVAL '7 days',
                    if_not_exists => TRUE
                );
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_index("idx_account_events_provider_timestamp", table_name="account_events")
    op.drop_index("idx_account_events_event_type_timestamp", table_name="account_events")
    op.drop_index("idx_account_events_account_timestamp", table_name="account_events")
    op.drop_table("account_events")
