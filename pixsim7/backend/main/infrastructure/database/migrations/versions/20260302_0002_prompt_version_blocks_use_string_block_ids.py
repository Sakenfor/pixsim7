"""Switch prompt_version_blocks.block_id to canonical string IDs.

Revision ID: 20260302_0002
Revises: 20260302_0001
Create Date: 2026-03-02

`prompt_version_blocks` now stores canonical primitive `block_id` strings.
This is a soft reference (no FK) because block primitives live in a separate DB.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260302_0002"
down_revision = "20260302_0001"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return table_name in sa.inspect(conn).get_table_names()


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not _table_exists(conn, "prompt_version_blocks"):
        return

    columns = {col["name"]: col for col in inspector.get_columns("prompt_version_blocks")}
    block_col = columns.get("block_id")
    if not block_col:
        return

    # Drop any legacy FK on block_id (action_blocks/prompt_blocks) first.
    for fk in inspector.get_foreign_keys("prompt_version_blocks"):
        constrained = fk.get("constrained_columns") or []
        if constrained == ["block_id"]:
            fk_name = fk.get("name")
            if fk_name:
                op.drop_constraint(fk_name, "prompt_version_blocks", type_="foreignkey")

    existing_type = block_col["type"]
    if isinstance(existing_type, sa.String):
        return

    op.alter_column(
        "prompt_version_blocks",
        "block_id",
        existing_type=existing_type,
        type_=sa.String(length=200),
        existing_nullable=bool(block_col.get("nullable", False)),
        postgresql_using="block_id::text",
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    if not _table_exists(conn, "prompt_version_blocks"):
        return

    columns = {col["name"]: col for col in inspector.get_columns("prompt_version_blocks")}
    block_col = columns.get("block_id")
    if not block_col:
        return

    existing_type = block_col["type"]
    if isinstance(existing_type, sa.String):
        op.alter_column(
            "prompt_version_blocks",
            "block_id",
            existing_type=existing_type,
            type_=postgresql.UUID(as_uuid=True),
            existing_nullable=bool(block_col.get("nullable", False)),
            postgresql_using="NULLIF(block_id, '')::uuid",
        )

    table_names = set(inspector.get_table_names())
    if "action_blocks" in table_names:
        has_block_fk = any(
            (fk.get("constrained_columns") or []) == ["block_id"]
            and fk.get("referred_table") == "action_blocks"
            for fk in inspector.get_foreign_keys("prompt_version_blocks")
        )
        if not has_block_fk:
            op.create_foreign_key(
                "prompt_version_blocks_block_id_fkey",
                "prompt_version_blocks",
                "action_blocks",
                ["block_id"],
                ["id"],
            )
