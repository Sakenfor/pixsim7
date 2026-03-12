"""Add plan_registry and plan_events tables.

Revision ID: 20260312_0003
Revises: 20260312_0002
Create Date: 2026-03-12
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260312_0003"
down_revision = "20260312_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_registry",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'active'")),
        sa.Column("stage", sa.String(length=64), nullable=False, server_default=sa.text("'unknown'")),
        sa.Column("owner", sa.String(length=120), nullable=False, server_default=sa.text("'unassigned'")),
        sa.Column("revision", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("priority", sa.String(length=32), nullable=False, server_default=sa.text("'normal'")),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("scope", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("code_paths", sa.JSON(), nullable=True),
        sa.Column("companions", sa.JSON(), nullable=True),
        sa.Column("handoffs", sa.JSON(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("depends_on", sa.JSON(), nullable=True),
        sa.Column("manifest_hash", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_plan_registry_status"), "plan_registry", ["status"], unique=False)
    op.create_index(op.f("ix_plan_registry_stage"), "plan_registry", ["stage"], unique=False)
    op.create_index(op.f("ix_plan_registry_owner"), "plan_registry", ["owner"], unique=False)
    op.create_index(op.f("ix_plan_registry_created_at"), "plan_registry", ["created_at"], unique=False)

    op.create_table(
        "plan_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_id", sa.String(length=120), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("field", sa.String(length=64), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("commit_sha", sa.String(length=64), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["plan_id"], ["plan_registry.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_plan_events_plan_id"), "plan_events", ["plan_id"], unique=False)
    op.create_index(op.f("ix_plan_events_timestamp"), "plan_events", ["timestamp"], unique=False)
    op.create_index("idx_plan_event_plan_ts", "plan_events", ["plan_id", "timestamp"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_plan_event_plan_ts", table_name="plan_events")
    op.drop_index(op.f("ix_plan_events_timestamp"), table_name="plan_events")
    op.drop_index(op.f("ix_plan_events_plan_id"), table_name="plan_events")
    op.drop_table("plan_events")

    op.drop_index(op.f("ix_plan_registry_created_at"), table_name="plan_registry")
    op.drop_index(op.f("ix_plan_registry_owner"), table_name="plan_registry")
    op.drop_index(op.f("ix_plan_registry_stage"), table_name="plan_registry")
    op.drop_index(op.f("ix_plan_registry_status"), table_name="plan_registry")
    op.drop_table("plan_registry")
