"""add prompt block intent fields

Revision ID: 20251226_2105
Revises: b971466cd208
Create Date: 2025-12-26 21:05:00.000000

Adds intent metadata to prompt blocks and version-block links.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "20251226_2105"
down_revision = "b971466cd208"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return table_name in inspect(conn).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()

    block_table = None
    if _table_exists(conn, "prompt_blocks"):
        block_table = "prompt_blocks"
    elif _table_exists(conn, "action_blocks"):
        block_table = "action_blocks"

    if block_table:
        op.add_column(
            block_table,
            sa.Column(
                "default_intent",
                sa.String(length=20),
                nullable=True,
                comment="Default intent for this block",
            ),
        )
        op.add_column(
            block_table,
            sa.Column(
                "intent_by_operation",
                sa.JSON(),
                nullable=False,
                server_default="{}",
                comment="Per-operation intent overrides",
            ),
        )

    if _table_exists(conn, "prompt_version_blocks"):
        op.add_column(
            "prompt_version_blocks",
            sa.Column(
                "intent_override",
                sa.String(length=20),
                nullable=True,
                comment="Override block intent for this usage",
            ),
        )


def downgrade() -> None:
    conn = op.get_bind()

    block_table = None
    if _table_exists(conn, "prompt_blocks"):
        block_table = "prompt_blocks"
    elif _table_exists(conn, "action_blocks"):
        block_table = "action_blocks"

    if _table_exists(conn, "prompt_version_blocks"):
        op.drop_column("prompt_version_blocks", "intent_override")

    if block_table:
        op.drop_column(block_table, "intent_by_operation")
        op.drop_column(block_table, "default_intent")
