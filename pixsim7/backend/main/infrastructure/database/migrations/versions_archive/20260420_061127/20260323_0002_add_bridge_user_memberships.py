"""Add bridge_user_memberships table for user-scoped bridge machine history.

Revision ID: 20260323_0002
Revises: 20260323_0001
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260323_0002"
down_revision = "20260323_0001"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def _indexes(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name, schema=SCHEMA)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("bridge_user_memberships", schema=SCHEMA):
        op.create_table(
            "bridge_user_memberships",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("bridge_client_id", sa.String(length=120), nullable=False),
            sa.Column("bridge_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("agent_type", sa.String(length=64), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="online"),
            sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_connected_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
            sa.Column("last_disconnected_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            schema=SCHEMA,
        )

    idx_names = _indexes(inspector, "bridge_user_memberships")
    if "idx_bridge_user_memberships_user_bridge" not in idx_names:
        op.create_index(
            "idx_bridge_user_memberships_user_bridge",
            "bridge_user_memberships",
            ["user_id", "bridge_client_id"],
            unique=True,
            schema=SCHEMA,
        )
    if "idx_bridge_user_memberships_user_status" not in idx_names:
        op.create_index(
            "idx_bridge_user_memberships_user_status",
            "bridge_user_memberships",
            ["user_id", "status"],
            schema=SCHEMA,
        )
    if "idx_bridge_user_memberships_user_last_seen" not in idx_names:
        op.create_index(
            "idx_bridge_user_memberships_user_last_seen",
            "bridge_user_memberships",
            ["user_id", "last_seen_at"],
            schema=SCHEMA,
        )
    if "idx_bridge_user_memberships_bridge_client_id" not in idx_names:
        op.create_index(
            "idx_bridge_user_memberships_bridge_client_id",
            "bridge_user_memberships",
            ["bridge_client_id"],
            schema=SCHEMA,
        )
    if "idx_bridge_user_memberships_bridge_id" not in idx_names:
        op.create_index(
            "idx_bridge_user_memberships_bridge_id",
            "bridge_user_memberships",
            ["bridge_id"],
            schema=SCHEMA,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("bridge_user_memberships", schema=SCHEMA):
        op.drop_table("bridge_user_memberships", schema=SCHEMA)

