"""Rename artifact_id to generation_id in log_entries.

The column was created with legacy naming before the codebase settled on
"generations" as the domain concept.  The column was never populated, so
no data migration is needed — just the column rename.

Revision ID: 20260307_0001
Revises: 20260223_0002
Create Date: 2026-03-07
"""

from __future__ import annotations

from alembic import op


revision = "20260307_0001"
down_revision = "20260223_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("log_entries", "artifact_id", new_column_name="generation_id")


def downgrade() -> None:
    op.alter_column("log_entries", "generation_id", new_column_name="artifact_id")
