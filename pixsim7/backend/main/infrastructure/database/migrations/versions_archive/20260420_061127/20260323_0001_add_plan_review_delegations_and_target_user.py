"""Add plan_review_delegations table and target_user_id to plan_review_requests.

Revision ID: 20260323_0001
Revises: 20260322_0004
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260323_0001"
down_revision = "20260322_0004"
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

    if inspector.has_table("plan_review_requests", schema=SCHEMA):
        cols = _columns(inspector, "plan_review_requests")
        if "target_user_id" not in cols:
            op.add_column(
                "plan_review_requests",
                sa.Column("target_user_id", sa.Integer(), nullable=True),
                schema=SCHEMA,
            )

        idx_names = _indexes(inspector, "plan_review_requests")
        if "ix_dev_meta_plan_review_requests_target_user_id" not in idx_names:
            op.create_index(
                "ix_dev_meta_plan_review_requests_target_user_id",
                "plan_review_requests",
                ["target_user_id"],
                schema=SCHEMA,
            )

    if not inspector.has_table("plan_review_delegations", schema=SCHEMA):
        op.create_table(
            "plan_review_delegations",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("grantor_user_id", sa.Integer(), nullable=False),
            sa.Column("delegate_user_id", sa.Integer(), nullable=False),
            sa.Column("plan_id", sa.String(length=120), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
            sa.Column("allowed_profile_ids", sa.JSON(), nullable=True),
            sa.Column("allowed_bridge_ids", sa.JSON(), nullable=True),
            sa.Column("allowed_agent_ids", sa.JSON(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("revoked_by_user_id", sa.Integer(), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_delegation_delegate_status",
            "plan_review_delegations",
            ["delegate_user_id", "status"],
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_delegation_grantor_status",
            "plan_review_delegations",
            ["grantor_user_id", "status"],
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_delegation_plan_scope",
            "plan_review_delegations",
            ["plan_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_delegations_grantor_user_id",
            "plan_review_delegations",
            ["grantor_user_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_delegations_delegate_user_id",
            "plan_review_delegations",
            ["delegate_user_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_delegations_status",
            "plan_review_delegations",
            ["status"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_delegations_plan_id",
            "plan_review_delegations",
            ["plan_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_delegations_expires_at",
            "plan_review_delegations",
            ["expires_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_delegations_revoked_at",
            "plan_review_delegations",
            ["revoked_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_delegations_created_at",
            "plan_review_delegations",
            ["created_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_delegations_updated_at",
            "plan_review_delegations",
            ["updated_at"],
            schema=SCHEMA,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("plan_review_delegations", schema=SCHEMA):
        op.drop_table("plan_review_delegations", schema=SCHEMA)

    if inspector.has_table("plan_review_requests", schema=SCHEMA):
        cols = _columns(inspector, "plan_review_requests")
        if "target_user_id" in cols:
            op.drop_column("plan_review_requests", "target_user_id", schema=SCHEMA)
