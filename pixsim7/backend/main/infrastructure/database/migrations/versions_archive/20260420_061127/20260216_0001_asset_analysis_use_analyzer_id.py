"""Migrate asset analyses to analyzer_id/model_id contract.

Revision ID: 20260216_0001
Revises: 20260215_0002
Create Date: 2026-02-16

Replaces legacy asset analysis columns:
- analyzer_type -> analyzer_id
- analyzer_version -> model_id
"""

from alembic import op
import sqlalchemy as sa


revision = "20260216_0001"
down_revision = "20260215_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "asset_analyses",
        sa.Column("analyzer_id", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "asset_analyses",
        sa.Column("model_id", sa.String(length=100), nullable=True),
    )

    op.execute(
        """
        UPDATE asset_analyses
        SET
            analyzer_id = CASE analyzer_type::text
                WHEN 'face_detection' THEN 'asset:face-detection'
                WHEN 'scene_tagging' THEN 'asset:scene-tagging'
                WHEN 'content_moderation' THEN 'asset:content-moderation'
                WHEN 'object_detection' THEN 'asset:object-detection'
                WHEN 'ocr' THEN 'asset:ocr'
                WHEN 'caption' THEN 'asset:caption'
                WHEN 'embedding' THEN 'asset:embedding'
                WHEN 'custom' THEN 'asset:custom'
                ELSE 'asset:custom'
            END,
            model_id = analyzer_version
        WHERE analyzer_id IS NULL
        """
    )

    op.alter_column("asset_analyses", "analyzer_id", nullable=False)

    op.execute("DROP INDEX IF EXISTS idx_analysis_asset_type")
    op.create_index(
        "ix_asset_analyses_analyzer_id",
        "asset_analyses",
        ["analyzer_id"],
        unique=False,
    )
    op.create_index(
        "idx_analysis_asset_analyzer",
        "asset_analyses",
        ["asset_id", "analyzer_id"],
        unique=False,
    )

    op.drop_column("asset_analyses", "analyzer_type")
    op.drop_column("asset_analyses", "analyzer_version")
    op.execute("DROP TYPE IF EXISTS analyzer_type_enum")


def downgrade() -> None:
    analyzer_type_enum = sa.Enum(
        "face_detection",
        "scene_tagging",
        "content_moderation",
        "object_detection",
        "ocr",
        "caption",
        "embedding",
        "custom",
        name="analyzer_type_enum",
    )
    analyzer_type_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "asset_analyses",
        sa.Column(
            "analyzer_type",
            sa.Enum(
                "face_detection",
                "scene_tagging",
                "content_moderation",
                "object_detection",
                "ocr",
                "caption",
                "embedding",
                "custom",
                name="analyzer_type_enum",
                native_enum=False,
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "asset_analyses",
        sa.Column("analyzer_version", sa.String(length=50), nullable=True),
    )

    op.execute(
        """
        UPDATE asset_analyses
        SET
            analyzer_type = CASE analyzer_id
                WHEN 'asset:face-detection' THEN 'face_detection'
                WHEN 'asset:scene-tagging' THEN 'scene_tagging'
                WHEN 'asset:content-moderation' THEN 'content_moderation'
                WHEN 'asset:object-detection' THEN 'object_detection'
                WHEN 'asset:ocr' THEN 'ocr'
                WHEN 'asset:caption' THEN 'caption'
                WHEN 'asset:embedding' THEN 'embedding'
                WHEN 'asset:custom' THEN 'custom'
                ELSE 'custom'
            END,
            analyzer_version = model_id
        WHERE analyzer_type IS NULL
        """
    )

    op.alter_column("asset_analyses", "analyzer_type", nullable=False)

    op.drop_index("idx_analysis_asset_analyzer", table_name="asset_analyses")
    op.drop_index("ix_asset_analyses_analyzer_id", table_name="asset_analyses")
    op.create_index(
        "idx_analysis_asset_type",
        "asset_analyses",
        ["asset_id", "analyzer_type"],
        unique=False,
    )

    op.drop_column("asset_analyses", "analyzer_id")
    op.drop_column("asset_analyses", "model_id")
