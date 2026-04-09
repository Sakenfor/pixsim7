"""Add first-class account routing rule columns.

Revision ID: 20260409_0001
Revises: 20260407_0001
Create Date: 2026-04-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260409_0001"
down_revision = "20260407_0001"
branch_labels = None
depends_on = None

TABLE = "provider_accounts"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())
    if TABLE not in table_names:
        return

    existing_columns = {col["name"] for col in inspector.get_columns(TABLE)}

    if "routing_allow_patterns" not in existing_columns:
        op.add_column(TABLE, sa.Column("routing_allow_patterns", sa.JSON(), nullable=True))
    if "routing_deny_patterns" not in existing_columns:
        op.add_column(TABLE, sa.Column("routing_deny_patterns", sa.JSON(), nullable=True))
    if "routing_priority_overrides" not in existing_columns:
        op.add_column(TABLE, sa.Column("routing_priority_overrides", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())
    if TABLE not in table_names:
        return

    existing_columns = {col["name"] for col in inspector.get_columns(TABLE)}
    if "routing_priority_overrides" in existing_columns:
        op.drop_column(TABLE, "routing_priority_overrides")
    if "routing_deny_patterns" in existing_columns:
        op.drop_column(TABLE, "routing_deny_patterns")
    if "routing_allow_patterns" in existing_columns:
        op.drop_column(TABLE, "routing_allow_patterns")

