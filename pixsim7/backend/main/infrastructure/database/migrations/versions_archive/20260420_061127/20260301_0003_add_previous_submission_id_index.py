"""Add index on provider_submissions.previous_submission_id.

Revision ID: 20260301_0003
Revises: 20260301_0002
Create Date: 2026-03-01

The self-referential FK on previous_submission_id causes a sequential scan
of the entire provider_submissions table (~107k rows) on every cascade
delete, taking ~9 seconds per deletion. Adding an index brings this to
sub-millisecond.
"""

from __future__ import annotations

from alembic import op
from sqlalchemy import text


revision = "20260301_0003"
down_revision = "20260301_0002"
branch_labels = None
depends_on = None


def _index_exists(index_name: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND indexname = :index_name
            LIMIT 1
            """
        ),
        {"index_name": index_name},
    ).first()
    return row is not None


def upgrade() -> None:
    if not _index_exists("ix_provider_submissions_previous_submission_id"):
        op.create_index(
            "ix_provider_submissions_previous_submission_id",
            "provider_submissions",
            ["previous_submission_id"],
        )


def downgrade() -> None:
    op.drop_index(
        "ix_provider_submissions_previous_submission_id",
        table_name="provider_submissions",
    )
