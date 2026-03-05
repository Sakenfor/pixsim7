"""Add analyzer modality/task-family metadata columns.

Revision ID: 20260303_0002
Revises: 20260303_0001
Create Date: 2026-03-03

Adds:
- analyzer_definitions.input_modality
- analyzer_definitions.task_family
"""

from alembic import op
import sqlalchemy as sa


revision = "20260303_0002"
down_revision = "20260303_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "analyzer_definitions",
        sa.Column("input_modality", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "analyzer_definitions",
        sa.Column("task_family", sa.String(length=32), nullable=True),
    )

    op.execute(
        """
        UPDATE analyzer_definitions
        SET input_modality = CASE
            WHEN target = 'prompt' THEN 'text'
            WHEN lower(analyzer_id) LIKE '%video%' THEN 'video'
            WHEN lower(analyzer_id) LIKE '%audio%' THEN 'audio'
            WHEN lower(analyzer_id) LIKE '%multi%' THEN 'multimodal'
            ELSE 'image'
        END
        WHERE input_modality IS NULL
        """
    )

    op.execute(
        """
        UPDATE analyzer_definitions
        SET task_family = CASE
            WHEN kind = 'parser' OR target = 'prompt' THEN 'parse'
            WHEN lower(analyzer_id) LIKE '%ocr%' THEN 'ocr'
            WHEN lower(analyzer_id) LIKE '%caption%' THEN 'caption'
            WHEN lower(analyzer_id) LIKE '%moderation%' THEN 'moderation'
            WHEN lower(analyzer_id) LIKE '%embed%' THEN 'embedding'
            WHEN lower(analyzer_id) LIKE '%detect%' THEN 'detection'
            WHEN lower(analyzer_id) LIKE '%tag%' THEN 'tag'
            ELSE 'custom'
        END
        WHERE task_family IS NULL
        """
    )

    op.alter_column("analyzer_definitions", "input_modality", nullable=False)
    op.alter_column("analyzer_definitions", "task_family", nullable=False)

    op.create_index(
        op.f("ix_analyzer_definitions_input_modality"),
        "analyzer_definitions",
        ["input_modality"],
        unique=False,
    )
    op.create_index(
        op.f("ix_analyzer_definitions_task_family"),
        "analyzer_definitions",
        ["task_family"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_analyzer_definitions_task_family"), table_name="analyzer_definitions")
    op.drop_index(op.f("ix_analyzer_definitions_input_modality"), table_name="analyzer_definitions")
    op.drop_column("analyzer_definitions", "task_family")
    op.drop_column("analyzer_definitions", "input_modality")
