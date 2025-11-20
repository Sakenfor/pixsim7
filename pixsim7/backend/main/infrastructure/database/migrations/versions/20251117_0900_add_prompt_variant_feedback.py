"""add_prompt_variant_feedback_table

Revision ID: 9a0b1c3d4e5f
Revises: 7ed0db0fe547
Create Date: 2025-11-17 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "9a0b1c3d4e5f"
down_revision = "7ed0db0fe547"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration: add_prompt_variant_feedback_table"""
    op.create_table(
        "prompt_variant_feedback",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "prompt_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("prompt_versions.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "output_asset_id",
            sa.Integer(),
            sa.ForeignKey("assets.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "input_asset_ids",
            sa.JSON(),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "generation_artifact_id",
            sa.Integer(),
            sa.ForeignKey("generation_artifacts.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("user_rating", sa.Integer(), nullable=True),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column(
            "is_favorite",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "notes",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
            index=True,
        ),
    )
    op.create_index(
        "idx_prompt_variant_feedback_version_asset",
        "prompt_variant_feedback",
        ["prompt_version_id", "output_asset_id"],
        unique=True,
    )
    op.create_index(
        "idx_prompt_variant_feedback_user",
        "prompt_variant_feedback",
        ["user_id"],
    )


def downgrade() -> None:
    """Revert migration: add_prompt_variant_feedback_table"""
    op.drop_index(
        "idx_prompt_variant_feedback_user",
        table_name="prompt_variant_feedback",
    )
    op.drop_index(
        "idx_prompt_variant_feedback_version_asset",
        table_name="prompt_variant_feedback",
    )
    op.drop_table("prompt_variant_feedback")

