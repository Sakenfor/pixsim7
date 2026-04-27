"""Add vocabulary_candidate table for parser keyword harvesting.

Tracks keywords the parser matched against a role keyword list but
couldn't resolve to a structured ontology ID. Phase 1 of the vocabulary
learning loop — harvest only, no LLM/review yet.

Revision ID: 20260427_0001
Revises: 20260424_0002
Create Date: 2026-04-27
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260427_0001"
down_revision = "20260424_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vocabulary_candidate",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("term", sa.String(128), nullable=False, unique=True),
        sa.Column("inferred_role", sa.String(64), nullable=True),
        sa.Column("frequency", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_seen", sa.DateTime(), nullable=False),
        sa.Column("last_seen", sa.DateTime(), nullable=False),
        sa.Column("sample_contexts", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("proposed_tag", sa.String(128), nullable=True),
        sa.Column("proposed_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
    )
    op.create_index("ix_vocabulary_candidate_term", "vocabulary_candidate", ["term"], unique=True)
    op.create_index("ix_vocabulary_candidate_inferred_role", "vocabulary_candidate", ["inferred_role"])
    op.create_index("ix_vocabulary_candidate_frequency", "vocabulary_candidate", ["frequency"])
    op.create_index("ix_vocabulary_candidate_last_seen", "vocabulary_candidate", ["last_seen"])
    op.create_index("ix_vocabulary_candidate_status", "vocabulary_candidate", ["status"])


def downgrade() -> None:
    op.drop_index("ix_vocabulary_candidate_status", table_name="vocabulary_candidate")
    op.drop_index("ix_vocabulary_candidate_last_seen", table_name="vocabulary_candidate")
    op.drop_index("ix_vocabulary_candidate_frequency", table_name="vocabulary_candidate")
    op.drop_index("ix_vocabulary_candidate_inferred_role", table_name="vocabulary_candidate")
    op.drop_index("ix_vocabulary_candidate_term", table_name="vocabulary_candidate")
    op.drop_table("vocabulary_candidate")
