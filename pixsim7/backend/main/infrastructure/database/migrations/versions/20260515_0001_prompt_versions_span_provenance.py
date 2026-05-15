"""prompt_versions.span_provenance for op-derived span metadata

Phase 2b of plan:op-runtime-span-popover. Captures which spans in
prompt_text were inserted via the runtime op executor (Adjust tab in
the span popover) so later passes can identify op-derived spans
without re-deriving from text alone — re-tweak (next session would
know which params produced this span), and the (b) live-blocks
decision gate (graduate the entries to live op markers).

Shape (each list entry):

    {
      "start_pos": int,        # char offset into prompt_text
      "end_pos": int,
      "source_op": str,        # op_id, e.g. "scene.relation.place"
      "op_params": dict,
      "op_refs": dict,         # values are cross-DB entity refs:
                               #   "asset:<id>" | "character_instance:<id>"
                               #   | "role:<concept>" | "symbol:<token>"
      "signature_id": str | null,
      "block_id": str          # resolved variant from pixsim7_blocks DB.
                               # Soft cross-DB ref, no FK (same pattern
                               # as PromptVersionBlock.block_id).
    }

NULL means "no op-derived spans" — matches prompt_analysis NULL semantics.

Revision ID: 20260515_0001
Revises: 20260514_0002
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa


revision = "20260515_0001"
down_revision = "20260514_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prompt_versions",
        sa.Column("span_provenance", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("prompt_versions", "span_provenance")
