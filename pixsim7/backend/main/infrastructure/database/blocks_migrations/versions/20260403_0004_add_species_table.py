"""Add species table to blocks database.

DB-backed species vocabulary entries for the species authoring contract.
Stores anatomy_map, word_lists, modifier_roles as JSONB.
Modifiers are computed at hydration time (not stored).

Revision ID: 20260403_0004
Revises: 20260314_0003
Create Date: 2026-04-03
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "20260403_0004"
down_revision = "20260314_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "species",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("category", sa.String(64), nullable=False, server_default=""),
        sa.Column("anatomy_map", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("movement_verbs", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("pronoun_set", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("default_stance", sa.String(200), nullable=False, server_default="standing"),
        sa.Column("keywords", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("visual_priority", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("render_template", sa.Text(), nullable=False, server_default=""),
        sa.Column("word_lists", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("modifier_roles", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(50), nullable=False, server_default="system"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_species_category", "species", ["category"])


def downgrade() -> None:
    op.drop_index("ix_species_category", table_name="species")
    op.drop_table("species")
