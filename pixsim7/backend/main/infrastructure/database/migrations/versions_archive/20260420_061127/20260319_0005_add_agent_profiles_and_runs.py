"""Add agent_profiles and agent_runs tables.

Revision ID: 20260319_0005
Revises: 20260319_0004
Create Date: 2026-03-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260319_0005"
down_revision = "20260319_0004"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.create_table(
        "agent_profiles",
        sa.Column("id", sa.String(120), primary_key=True),
        sa.Column("user_id", sa.Integer, nullable=False, index=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("agent_type", sa.String(64), nullable=False, server_default="claude-cli"),
        sa.Column("instructions", sa.Text, nullable=True),
        sa.Column("default_scopes", sa.JSON, nullable=True),
        sa.Column("assigned_plans", sa.JSON, nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema=SCHEMA,
    )
    op.create_index("idx_agent_profiles_user", "agent_profiles", ["user_id"], schema=SCHEMA)
    op.create_index("idx_agent_profiles_status", "agent_profiles", ["status"], schema=SCHEMA)

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("profile_id", sa.String(120), sa.ForeignKey(f"{SCHEMA}.agent_profiles.id"), nullable=False, index=True),
        sa.Column("run_id", sa.String(120), nullable=False, index=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="running"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.JSON, nullable=True),
        sa.Column("token_jti", sa.String(64), nullable=True),
        schema=SCHEMA,
    )
    op.create_index("idx_agent_runs_profile", "agent_runs", ["profile_id"], schema=SCHEMA)
    op.create_index("idx_agent_runs_started", "agent_runs", ["started_at"], schema=SCHEMA)


def downgrade() -> None:
    op.drop_table("agent_runs", schema=SCHEMA)
    op.drop_table("agent_profiles", schema=SCHEMA)
