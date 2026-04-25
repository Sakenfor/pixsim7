"""Add UNIQUE (prompt_hash, family_id) NULLS NOT DISTINCT on prompt_versions

Closes a race where concurrent batch generations for identical prompt text
each raced past the SELECT-by-hash dedup check in PromptAnalysisService
and inserted their own PromptVersion row. With this constraint plus the
IntegrityError retry in analyze_and_attach_version, duplicate inserts
collapse into one winner and concurrent callers all return the same
prompt_version_id.

NULLS NOT DISTINCT (PG15+) is required because one-off generations (no
PromptFamily) have family_id = NULL, and the classic UNIQUE treats each
NULL as distinct — which is the exact case where the batch race fires.

Prereq: run tools/backfill_dedup_prompt_versions.py --apply BEFORE upgrading,
or this migration will fail on existing duplicate rows. See
docs/data-migration-convention.md for the split between schema migrations
(here) and data backfills (tools/).

Revision ID: 20260424_0001
Revises: 20260420_9900
Create Date: 2026-04-24
"""
from __future__ import annotations

from alembic import op


revision = "20260424_0001"
down_revision = "20260420_9900"
branch_labels = None
depends_on = None


CONSTRAINT_NAME = "uq_prompt_versions_hash_family"


def upgrade() -> None:
    op.execute(
        f"""
        ALTER TABLE prompt_versions
        ADD CONSTRAINT {CONSTRAINT_NAME}
        UNIQUE NULLS NOT DISTINCT (prompt_hash, family_id)
        """
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE prompt_versions DROP CONSTRAINT {CONSTRAINT_NAME}")
