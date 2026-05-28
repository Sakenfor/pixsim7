"""backfill_applied — applied-state ledger for one-shot data backfills

Append-only record of which ``tools/backfill_*.py`` scripts have been run with
``--apply`` and when/by whom. Stamped by the script itself (see
``services/diagnostics/applied_ledger.record_backfill_applied``) so it captures
every apply path — diagnostics runner, agent Bash, or a human CLI alike —
unlike ``diagnostic_runs`` which only sees runner-launched runs and includes
dry-runs. This table is the authoritative answer to "has this backfill run?"
(the alembic-revision analogy for data migrations). Schema-only per the
data-migration convention.

Model: ``pixsim7.backend.main.domain.diagnostics.BackfillApplied``.

Revision ID: 20260528_0002
Revises: 20260528_0001
Create Date: 2026-05-28
"""
import sqlalchemy as sa
from alembic import op


revision = "20260528_0002"
down_revision = "20260528_0001"
branch_labels = None
depends_on = None

_TABLE = "backfill_applied"


def upgrade() -> None:
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("script_path", sa.String(length=512), nullable=False),
        sa.Column("git_sha", sa.String(length=40), nullable=True),
        sa.Column("script_sha256", sa.String(length=64), nullable=True),
        sa.Column("applied_by", sa.String(length=128), nullable=False),
        sa.Column("rows_affected", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "applied_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_backfill_applied_script_path"), _TABLE, ["script_path"])
    op.create_index(op.f("ix_backfill_applied_applied_at"), _TABLE, ["applied_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_backfill_applied_applied_at"), table_name=_TABLE)
    op.drop_index(op.f("ix_backfill_applied_script_path"), table_name=_TABLE)
    op.drop_table(_TABLE)
