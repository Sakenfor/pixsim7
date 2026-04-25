"""Promote prompt_version_id soft FKs to real FKs with ON DELETE SET NULL.

Closes the orphan class discovered during the prompt_versions dedup: three
tables stored prompt_version_id as a plain UUID column with no FK constraint,
so concurrent writes during a dedup/migration could create dangling references
with nothing in PG to block them.

Tables / columns promoted:
    - assets.prompt_version_id
    - generation_batch_item_manifests.prompt_version_id
    - character_usage.prompt_version_id

All three use ON DELETE SET NULL: deleting a prompt_version nulls the
provenance pointer on these downstream rows (it never cascade-deletes the
asset / manifest / usage record, which owns its own primary data).

Prereq: no orphan rows for any of these columns. Run
    python tools/backfill_dedup_prompt_versions.py --verify
first; migration will fail if orphans exist because PG validates the new
FK against existing data.

Revision ID: 20260424_0002
Revises: 20260424_0001
Create Date: 2026-04-24
"""
from __future__ import annotations

from alembic import op


revision = "20260424_0002"
down_revision = "20260424_0001"
branch_labels = None
depends_on = None


_PROMOTIONS = [
    ("assets", "fk_assets_prompt_version_id"),
    ("generation_batch_item_manifests", "fk_gen_batch_manifest_prompt_version_id"),
    ("character_usage", "fk_character_usage_prompt_version_id"),
]


def upgrade() -> None:
    for table, constraint in _PROMOTIONS:
        op.create_foreign_key(
            constraint,
            source_table=table,
            referent_table="prompt_versions",
            local_cols=["prompt_version_id"],
            remote_cols=["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    for table, constraint in _PROMOTIONS:
        op.drop_constraint(constraint, table, type_="foreignkey")
