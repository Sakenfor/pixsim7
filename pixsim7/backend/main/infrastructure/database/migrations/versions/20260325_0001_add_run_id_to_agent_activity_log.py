"""Add run_id column to agent_activity_log.

Revision ID: 20260325_0001
Revises: 20260323_0003
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260325_0001"
down_revision = "20260323_0003"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
TABLE = "agent_activity_log"


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column("run_id", sa.String(120), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_agent_log_run_id",
        TABLE,
        ["run_id"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("idx_agent_log_run_id", table_name=TABLE, schema=SCHEMA)
    op.drop_column(TABLE, "run_id", schema=SCHEMA)
