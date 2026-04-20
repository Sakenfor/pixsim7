"""Add analyzer_presets table.

Revision ID: 20260111_0002
Revises: 20260111_0001
Create Date: 2026-01-11
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260111_0002"
down_revision = "20260111_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "analyzer_presets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("analyzer_id", sa.String(length=100), nullable=False),
        sa.Column("preset_id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_user_id", "analyzer_id", "preset_id", name="uq_analyzer_preset_owner"),
    )

    op.create_index(op.f("ix_analyzer_presets_analyzer_id"), "analyzer_presets", ["analyzer_id"], unique=False)
    op.create_index(op.f("ix_analyzer_presets_preset_id"), "analyzer_presets", ["preset_id"], unique=False)
    op.create_index(op.f("ix_analyzer_presets_owner_user_id"), "analyzer_presets", ["owner_user_id"], unique=False)
    op.create_index(op.f("ix_analyzer_presets_approved_by_user_id"), "analyzer_presets", ["approved_by_user_id"], unique=False)
    op.create_index(op.f("ix_analyzer_presets_status"), "analyzer_presets", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_analyzer_presets_status"), table_name="analyzer_presets")
    op.drop_index(op.f("ix_analyzer_presets_approved_by_user_id"), table_name="analyzer_presets")
    op.drop_index(op.f("ix_analyzer_presets_owner_user_id"), table_name="analyzer_presets")
    op.drop_index(op.f("ix_analyzer_presets_preset_id"), table_name="analyzer_presets")
    op.drop_index(op.f("ix_analyzer_presets_analyzer_id"), table_name="analyzer_presets")
    op.drop_table("analyzer_presets")
