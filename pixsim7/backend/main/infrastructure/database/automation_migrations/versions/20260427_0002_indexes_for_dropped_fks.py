"""Add indexes on cross-DB ref columns where FK was dropped.

Plan: automation-package-extraction Phase 2c.

The FK-drop in 20260427_0003 (main DB chain) removed the implicit index that
PostgreSQL adds to support FK lookups. The model annotations now declare
`index=True` on these columns, but the underlying indexes don't exist yet.

Index targets (3, all Integer columns previously FK'd to users.id /
provider_accounts.id):
    execution_loops.user_id
    execution_loop_history.user_id
    execution_loop_history.account_id

Also drops one pre-existing stale index discovered by alembic check:
    pairing_requests.expires_at — present in live DB but absent from current
    SQLModel.metadata; predates Phase 2 (verified against clean main).

Revision ID: 20260427_0002
Revises: 20260427_0001
Create Date: 2026-04-27
"""
from __future__ import annotations

from alembic import op


revision = "20260427_0002"
down_revision = "20260427_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_execution_loops_user_id", "execution_loops", ["user_id"]
    )
    op.create_index(
        "ix_execution_loop_history_user_id", "execution_loop_history", ["user_id"]
    )
    op.create_index(
        "ix_execution_loop_history_account_id", "execution_loop_history", ["account_id"]
    )
    op.drop_index("ix_pairing_requests_expires_at", "pairing_requests")


def downgrade() -> None:
    op.create_index(
        "ix_pairing_requests_expires_at", "pairing_requests", ["expires_at"]
    )
    op.drop_index("ix_execution_loop_history_account_id", "execution_loop_history")
    op.drop_index("ix_execution_loop_history_user_id", "execution_loop_history")
    op.drop_index("ix_execution_loops_user_id", "execution_loops")
