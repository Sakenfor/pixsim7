"""drop_action_blocks_table

Revision ID: 20260407_0001
Revises: 20260406_0001
Create Date: 2026-04-07

Legacy PromptBlock model retired — all runtime block composition now uses
BlockPrimitive in the separate pixsim7_blocks database.  Cross-domain FKs
(character_usage, prompt_version_blocks) were dropped in earlier migrations.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260407_0001"
down_revision = "20260406_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    table_names = set(inspector.get_table_names())

    if "action_blocks" not in table_names:
        return

    op.drop_table("action_blocks")

    # Clean up the enum type created for the default_intent column.
    op.execute(sa.text("DROP TYPE IF EXISTS prompt_block_intent_enum"))


def downgrade() -> None:
    # Intentionally not recreating the table — the model has been removed
    # from the codebase.  Restore from backup if a rollback is needed.
    pass
