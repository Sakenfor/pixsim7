"""Backfill prompt_family_tag from PromptFamily.tags JSON.

Copies existing PromptFamily.tags (List[str] of slugs) into the new
prompt_family_tag join table.  Tag slugs that already exist in the tag
table are linked; unknown slugs are silently skipped (they will be
created and linked on the next write via TagAssignment).

Revision ID: 20260402_0006
Revises: 20260402_0005
Create Date: 2026-04-02
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260402_0006"
down_revision = "20260402_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Insert a row for every (family_id, tag_id) pair where:
    # - the family has a non-empty JSON tags array
    # - each slug from that array matches a row in the tag table
    # ON CONFLICT DO NOTHING handles families that were already written
    # through the new code path before this migration ran.
    bind.execute(sa.text("""
        INSERT INTO prompt_family_tag (family_id, tag_id, created_at)
        SELECT
            pf.id,
            t.id,
            NOW()
        FROM prompt_families pf
        CROSS JOIN LATERAL jsonb_array_elements_text(pf.tags::jsonb) AS tag_slug
        JOIN tag t ON t.slug = tag_slug
        WHERE pf.tags IS NOT NULL
          AND pf.tags::text <> '[]'
          AND pf.tags::text <> 'null'
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    # Remove all rows that were seeded from the JSON field.
    # We identify them by matching slugs still present in the JSON array.
    op.get_bind().execute(sa.text("""
        DELETE FROM prompt_family_tag pft
        USING prompt_families pf, tag t
        WHERE pft.family_id = pf.id
          AND pft.tag_id = t.id
          AND pf.tags::jsonb ? t.slug
    """))
