"""Clean up garbage has:* tags from legacy pipeline.

Older pipeline versions didn't validate roles against the registry,
producing tags like has:the_gorilla, has:adjust_expression_subtly, etc.

Valid has:* roles are: action, camera, character, setting, mood, romance
(matching the PromptRoleRegistry).

Deletes ~12K asset_tag assignments and ~370 orphan tag records.

Revision ID: 20260404_0001
Revises: 20260403_0001
Create Date: 2026-04-04
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260404_0001"
down_revision = "20260403_0001"
branch_labels = None
depends_on = None

VALID_HAS_ROLES = ("action", "camera", "character", "setting", "mood", "romance")


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Delete asset_tag assignments for garbage has:* tags
    conn.exec_driver_sql("""
        DELETE FROM asset_tag
        WHERE tag_id IN (
            SELECT id FROM tag
            WHERE namespace = 'has'
              AND name NOT IN ('action','camera','character','setting','mood','romance')
        )
    """)

    # 2. Delete orphan tag records (no remaining assignments)
    conn.exec_driver_sql("""
        DELETE FROM tag
        WHERE namespace = 'has'
          AND name NOT IN ('action','camera','character','setting','mood','romance')
          AND NOT EXISTS (
              SELECT 1 FROM asset_tag WHERE asset_tag.tag_id = tag.id
          )
    """)


def downgrade() -> None:
    # Data deletion — cannot be reversed
    pass
