"""Add scope metadata columns to chat_sessions.

Revision ID: 20260323_0003
Revises: 20260323_0002
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260323_0003"
down_revision = "20260323_0002"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
TABLE = "chat_sessions"


def _columns(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {c["name"] for c in inspector.get_columns(table_name, schema=SCHEMA)}


def _indexes(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name, schema=SCHEMA)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table(TABLE, schema=SCHEMA):
        return

    cols = _columns(inspector, TABLE)
    if "scope_key" not in cols:
        op.add_column(
            TABLE,
            sa.Column("scope_key", sa.String(length=255), nullable=True),
            schema=SCHEMA,
        )
    if "last_plan_id" not in cols:
        op.add_column(
            TABLE,
            sa.Column("last_plan_id", sa.String(length=120), nullable=True),
            schema=SCHEMA,
        )
    if "last_contract_id" not in cols:
        op.add_column(
            TABLE,
            sa.Column("last_contract_id", sa.String(length=120), nullable=True),
            schema=SCHEMA,
        )

    idx = _indexes(inspector, TABLE)
    if "ix_dev_meta_chat_sessions_scope_key" not in idx:
        op.create_index(
            "ix_dev_meta_chat_sessions_scope_key",
            TABLE,
            ["scope_key"],
            schema=SCHEMA,
        )
    if "ix_dev_meta_chat_sessions_last_plan_id" not in idx:
        op.create_index(
            "ix_dev_meta_chat_sessions_last_plan_id",
            TABLE,
            ["last_plan_id"],
            schema=SCHEMA,
        )
    if "ix_dev_meta_chat_sessions_last_contract_id" not in idx:
        op.create_index(
            "ix_dev_meta_chat_sessions_last_contract_id",
            TABLE,
            ["last_contract_id"],
            schema=SCHEMA,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table(TABLE, schema=SCHEMA):
        return

    idx = _indexes(inspector, TABLE)
    if "ix_dev_meta_chat_sessions_last_contract_id" in idx:
        op.drop_index("ix_dev_meta_chat_sessions_last_contract_id", table_name=TABLE, schema=SCHEMA)
    if "ix_dev_meta_chat_sessions_last_plan_id" in idx:
        op.drop_index("ix_dev_meta_chat_sessions_last_plan_id", table_name=TABLE, schema=SCHEMA)
    if "ix_dev_meta_chat_sessions_scope_key" in idx:
        op.drop_index("ix_dev_meta_chat_sessions_scope_key", table_name=TABLE, schema=SCHEMA)

    cols = _columns(inspector, TABLE)
    if "last_contract_id" in cols:
        op.drop_column(TABLE, "last_contract_id", schema=SCHEMA)
    if "last_plan_id" in cols:
        op.drop_column(TABLE, "last_plan_id", schema=SCHEMA)
    if "scope_key" in cols:
        op.drop_column(TABLE, "scope_key", schema=SCHEMA)
