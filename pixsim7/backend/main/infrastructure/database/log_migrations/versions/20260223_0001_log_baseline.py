"""Log DB baseline — stamp existing log_entries table.

The log_entries table was originally created by DBLogHandler.auto_create
and the channel column was added manually. This migration establishes
the Alembic version chain for the log database so future schema changes
can be tracked properly.

Revision ID: 20260223_0001
Revises: None
Create Date: 2026-02-23
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260223_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Table already exists with all columns including channel.
    # This is a stamp-only migration to establish the baseline.
    pass


def downgrade() -> None:
    pass
