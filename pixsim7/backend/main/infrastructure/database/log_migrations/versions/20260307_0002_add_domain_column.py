"""Add domain column to log_entries for per-domain filtering.

Revision ID: 20260307_0002
Revises: 20260307_0001
Create Date: 2026-03-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260307_0002"
down_revision = "20260307_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("log_entries", sa.Column("domain", sa.String(30), nullable=True))
    op.create_index("idx_logs_domain_timestamp", "log_entries", ["domain", "timestamp"])


def downgrade() -> None:
    op.drop_index("idx_logs_domain_timestamp", table_name="log_entries")
    op.drop_column("log_entries", "domain")
