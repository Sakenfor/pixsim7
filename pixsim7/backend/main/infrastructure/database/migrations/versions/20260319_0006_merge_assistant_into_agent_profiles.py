"""Merge assistant definition fields into agent_profiles and seed defaults.

Revision ID: 20260319_0006
Revises: 20260319_0005
Create Date: 2026-03-19
"""
from __future__ import annotations

from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op

revision = "20260319_0006"
down_revision = "20260319_0005"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    # Add assistant-profile columns to agent_profiles
    op.add_column("agent_profiles", sa.Column("icon", sa.String(50), nullable=True), schema=SCHEMA)
    op.add_column("agent_profiles", sa.Column("system_prompt", sa.Text, nullable=True), schema=SCHEMA)
    op.add_column("agent_profiles", sa.Column("model_id", sa.String(100), nullable=True), schema=SCHEMA)
    op.add_column("agent_profiles", sa.Column("method", sa.String(20), nullable=True), schema=SCHEMA)
    op.add_column("agent_profiles", sa.Column("audience", sa.String(20), nullable=False, server_default="user"), schema=SCHEMA)
    op.add_column("agent_profiles", sa.Column("allowed_contracts", sa.JSON, nullable=True), schema=SCHEMA)
    op.add_column("agent_profiles", sa.Column("config", sa.JSON, nullable=True), schema=SCHEMA)
    op.add_column("agent_profiles", sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("false")), schema=SCHEMA)

    # Rename `instructions` → `system_prompt` (migrate data)
    # The new `system_prompt` column was just added; copy from instructions if it exists
    op.execute(
        f"UPDATE {SCHEMA}.agent_profiles SET system_prompt = instructions WHERE instructions IS NOT NULL AND system_prompt IS NULL"
    )
    op.drop_column("agent_profiles", "instructions", schema=SCHEMA)

    # Seed default assistant profiles (previously in assistant_definitions table)
    now = datetime.now(timezone.utc).isoformat()
    profiles = sa.table(
        "agent_profiles",
        sa.column("id", sa.String),
        sa.column("user_id", sa.Integer),
        sa.column("label", sa.String),
        sa.column("description", sa.Text),
        sa.column("icon", sa.String),
        sa.column("agent_type", sa.String),
        sa.column("system_prompt", sa.Text),
        sa.column("audience", sa.String),
        sa.column("status", sa.String),
        sa.column("is_default", sa.Boolean),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
        schema=SCHEMA,
    )
    op.bulk_insert(profiles, [
        {
            "id": "assistant:general",
            "user_id": 0,
            "label": "General Assistant",
            "description": "All-purpose assistant with full tool access",
            "icon": "messageSquare",
            "agent_type": "assistant",
            "system_prompt": None,
            "audience": "user",
            "status": "active",
            "is_default": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "assistant:code-helper",
            "user_id": 0,
            "label": "Code Helper",
            "description": "Dev-focused assistant with access to plans and codegen tools",
            "icon": "code",
            "agent_type": "assistant",
            "system_prompt": "You are a senior software engineer. Be precise, suggest code, and reference specific files.",
            "audience": "dev",
            "status": "active",
            "is_default": False,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "assistant:creative",
            "user_id": 0,
            "label": "Creative Director",
            "description": "Helps with generation prompts, asset curation, and visual direction",
            "icon": "sparkles",
            "agent_type": "assistant",
            "system_prompt": "You are a creative director. Focus on visual aesthetics, prompt craft, and artistic direction.",
            "audience": "user",
            "status": "active",
            "is_default": False,
            "created_at": now,
            "updated_at": now,
        },
        {
            "id": "assistant:quick",
            "user_id": 0,
            "label": "Quick Chat",
            "description": "Fast, concise responses. No tools — pure text chat.",
            "icon": "zap",
            "agent_type": "assistant",
            "system_prompt": "Be extremely concise. Answer in 1-2 sentences when possible.",
            "audience": "user",
            "status": "active",
            "is_default": False,
            "created_at": now,
            "updated_at": now,
        },
    ])


def downgrade() -> None:
    # Remove seeded profiles
    op.execute(
        f"DELETE FROM {SCHEMA}.agent_profiles WHERE id IN ('assistant:general', 'assistant:code-helper', 'assistant:creative', 'assistant:quick')"
    )
    # Re-add instructions column
    op.add_column("agent_profiles", sa.Column("instructions", sa.Text, nullable=True), schema=SCHEMA)
    op.execute(f"UPDATE {SCHEMA}.agent_profiles SET instructions = system_prompt WHERE system_prompt IS NOT NULL")
    # Drop added columns
    op.drop_column("agent_profiles", "is_default", schema=SCHEMA)
    op.drop_column("agent_profiles", "config", schema=SCHEMA)
    op.drop_column("agent_profiles", "allowed_contracts", schema=SCHEMA)
    op.drop_column("agent_profiles", "audience", schema=SCHEMA)
    op.drop_column("agent_profiles", "method", schema=SCHEMA)
    op.drop_column("agent_profiles", "model_id", schema=SCHEMA)
    op.drop_column("agent_profiles", "system_prompt", schema=SCHEMA)
    op.drop_column("agent_profiles", "icon", schema=SCHEMA)
