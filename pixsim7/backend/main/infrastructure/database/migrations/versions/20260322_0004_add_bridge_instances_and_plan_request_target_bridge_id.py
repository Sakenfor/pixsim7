"""Add bridge_instances table and target_bridge_id to plan_review_requests.

Revision ID: 20260322_0004
Revises: 20260322_0003
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260322_0004"
down_revision = "20260322_0003"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def _columns(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {c["name"] for c in inspector.get_columns(table_name, schema=SCHEMA)}


def _indexes(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name, schema=SCHEMA)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("bridge_instances", schema=SCHEMA):
        op.create_table(
            "bridge_instances",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("agent_id", sa.String(length=120), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("agent_type", sa.String(length=64), nullable=False, server_default="unknown"),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="online"),
            sa.Column("connected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("disconnected_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            schema=SCHEMA,
        )
        op.create_index(
            "idx_bridge_instances_agent_id",
            "bridge_instances",
            ["agent_id"],
            unique=True,
            schema=SCHEMA,
        )
        op.create_index(
            "idx_bridge_instances_user_status",
            "bridge_instances",
            ["user_id", "status"],
            schema=SCHEMA,
        )
        op.create_index(
            "idx_bridge_instances_last_seen",
            "bridge_instances",
            ["last_seen_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_bridge_instances_user_id",
            "bridge_instances",
            ["user_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_bridge_instances_status",
            "bridge_instances",
            ["status"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_bridge_instances_connected_at",
            "bridge_instances",
            ["connected_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_bridge_instances_last_seen_at",
            "bridge_instances",
            ["last_seen_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_bridge_instances_disconnected_at",
            "bridge_instances",
            ["disconnected_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_bridge_instances_created_at",
            "bridge_instances",
            ["created_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_bridge_instances_updated_at",
            "bridge_instances",
            ["updated_at"],
            schema=SCHEMA,
        )

    if inspector.has_table("plan_review_requests", schema=SCHEMA):
        cols = _columns(inspector, "plan_review_requests")
        if "target_bridge_id" not in cols:
            op.add_column(
                "plan_review_requests",
                sa.Column("target_bridge_id", sa.String(length=120), nullable=True),
                schema=SCHEMA,
            )
        idx_names = _indexes(inspector, "plan_review_requests")
        if "ix_dev_meta_plan_review_requests_target_bridge_id" not in idx_names:
            op.create_index(
                "ix_dev_meta_plan_review_requests_target_bridge_id",
                "plan_review_requests",
                ["target_bridge_id"],
                schema=SCHEMA,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("plan_review_requests", schema=SCHEMA):
        cols = _columns(inspector, "plan_review_requests")
        if "target_bridge_id" in cols:
            op.drop_column("plan_review_requests", "target_bridge_id", schema=SCHEMA)

    if inspector.has_table("bridge_instances", schema=SCHEMA):
        op.drop_table("bridge_instances", schema=SCHEMA)
