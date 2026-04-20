"""promote run_context out of raw_params into its own Generation column

Historically ``generations.raw_params.generation_config.run_context`` carried
batch/chain bookkeeping (run_id, item_index, block_template_id, roll_seed,
slot_results, selected_block_ids, assembled_prompt, guidance_plan, ...) which
was read directly from the nested raw_params blob by
``_upsert_generation_batch_manifest`` and the Pixverse guidance injection.

Promoting it to a first-class column makes batch-manifest creation and
retry-from-canonical possible without digging into raw_params every time.
Backfills existing rows so the new reader can stop falling back to raw_params
after this migration lands.

Revision ID: 20260419_0003
Revises: 20260419_0002
Create Date: 2026-04-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260419_0003"
down_revision = "20260419_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Add the column (nullable — most generations have no run_context).
    op.add_column(
        "generations",
        sa.Column(
            "run_context",
            sa.dialects.postgresql.JSONB() if bind.dialect.name == "postgresql" else sa.JSON(),
            nullable=True,
        ),
    )

    # 2. Backfill from raw_params.generation_config.run_context when present.
    #    raw_params is JSON; PG auto-casts to JSONB on assignment.  The
    #    IS NOT NULL filter skips rows where the path doesn't exist.  Non-
    #    object values (unlikely but possible in legacy data) are let through
    #    — the reader already had to tolerate whatever raw_params carried.
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                """
                UPDATE generations
                SET run_context = (raw_params -> 'generation_config' -> 'run_context')
                WHERE run_context IS NULL
                  AND raw_params IS NOT NULL
                  AND (raw_params -> 'generation_config' -> 'run_context') IS NOT NULL
                """
            )
        )


def downgrade() -> None:
    op.drop_column("generations", "run_context")
