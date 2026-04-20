"""add_generation_attempt_ownership

Revision ID: 20260301_0001
Revises: 20260227_0001
Create Date: 2026-03-01

Add monotonic generation attempt ownership columns:
- generations.attempt_id
- provider_submissions.generation_attempt_id
"""
from alembic import op
import sqlalchemy as sa


revision = "20260301_0001"
down_revision = "20260227_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generations",
        sa.Column("attempt_id", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "provider_submissions",
        sa.Column("generation_attempt_id", sa.Integer(), nullable=True),
    )

    # Backfill attempts for existing data.
    # started_at implies at least one attempted submit.
    op.execute(
        sa.text(
            """
            UPDATE generations
            SET attempt_id = 1
            WHERE attempt_id = 0
              AND started_at IS NOT NULL
            """
        )
    )

    # Infer attempts from submission retry_attempt history.
    op.execute(
        sa.text(
            """
            WITH per_generation AS (
                SELECT generation_id, COALESCE(MAX(retry_attempt), 0) + 1 AS inferred_attempt_id
                FROM provider_submissions
                WHERE generation_id IS NOT NULL
                GROUP BY generation_id
            )
            UPDATE generations AS g
            SET attempt_id = GREATEST(g.attempt_id, pg.inferred_attempt_id)
            FROM per_generation AS pg
            WHERE g.id = pg.generation_id
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE provider_submissions
            SET generation_attempt_id = COALESCE(retry_attempt, 0) + 1
            WHERE generation_id IS NOT NULL
            """
        )
    )

    # PostgreSQL can keep deferred FK trigger events pending in this transaction
    # after the backfill updates above. Force them to run before CREATE INDEX.
    op.execute(sa.text("SET CONSTRAINTS ALL IMMEDIATE"))

    op.create_index(
        "ix_generations_attempt_id",
        "generations",
        ["attempt_id"],
        unique=False,
    )
    op.create_index(
        "idx_submission_generation_attempt_id_submitted",
        "provider_submissions",
        ["generation_id", "generation_attempt_id", "submitted_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "idx_submission_generation_attempt_id_submitted",
        table_name="provider_submissions",
    )
    op.drop_index("ix_generations_attempt_id", table_name="generations")
    op.drop_column("provider_submissions", "generation_attempt_id")
    op.drop_column("generations", "attempt_id")
