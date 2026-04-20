"""Add analyzer_definitions table.

Revision ID: 20260111_0001
Revises: 20260110_0002
Create Date: 2026-01-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260111_0001"
down_revision = "20260110_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analyzer_definitions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("analyzer_id", sa.String(length=100), nullable=False),
        sa.Column("base_analyzer_id", sa.String(length=100), nullable=True),
        sa.Column("preset_id", sa.String(length=100), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("target", sa.String(length=20), nullable=False),
        sa.Column("provider_id", sa.String(length=50), nullable=True),
        sa.Column("model_id", sa.String(length=100), nullable=True),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("source_plugin_id", sa.String(length=100), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_legacy", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("analyzer_id"),
    )

    op.create_index(op.f("ix_analyzer_definitions_analyzer_id"), "analyzer_definitions", ["analyzer_id"], unique=False)
    op.create_index(
        op.f("ix_analyzer_definitions_base_analyzer_id"),
        "analyzer_definitions",
        ["base_analyzer_id"],
        unique=False,
    )
    op.create_index(op.f("ix_analyzer_definitions_kind"), "analyzer_definitions", ["kind"], unique=False)
    op.create_index(op.f("ix_analyzer_definitions_target"), "analyzer_definitions", ["target"], unique=False)
    op.create_index(op.f("ix_analyzer_definitions_enabled"), "analyzer_definitions", ["enabled"], unique=False)
    op.create_index(op.f("ix_analyzer_definitions_is_default"), "analyzer_definitions", ["is_default"], unique=False)
    op.create_index(op.f("ix_analyzer_definitions_created_by_user_id"), "analyzer_definitions", ["created_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_analyzer_definitions_created_by_user_id"), table_name="analyzer_definitions")
    op.drop_index(op.f("ix_analyzer_definitions_is_default"), table_name="analyzer_definitions")
    op.drop_index(op.f("ix_analyzer_definitions_enabled"), table_name="analyzer_definitions")
    op.drop_index(op.f("ix_analyzer_definitions_target"), table_name="analyzer_definitions")
    op.drop_index(op.f("ix_analyzer_definitions_kind"), table_name="analyzer_definitions")
    op.drop_index(op.f("ix_analyzer_definitions_analyzer_id"), table_name="analyzer_definitions")
    op.drop_index(op.f("ix_analyzer_definitions_base_analyzer_id"), table_name="analyzer_definitions")
    op.drop_table("analyzer_definitions")
