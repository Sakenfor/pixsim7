"""Add reasoning_effort column to agent_profiles.

Promotes reasoning_effort from the generic config JSON blob to a
first-class field on the profile model.

Revision ID: 20260328_0002
Revises: 20260328_0001
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260328_0002"
down_revision = "20260328_0001"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
TABLE = "agent_profiles"


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column("reasoning_effort", sa.String(20), nullable=True),
        schema=SCHEMA,
    )
    # Migrate existing values from config JSON
    op.execute(
        f"""
        UPDATE {SCHEMA}.{TABLE}
        SET reasoning_effort = config->>'reasoning_effort'
        WHERE config->>'reasoning_effort' IS NOT NULL
          AND reasoning_effort IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column(TABLE, "reasoning_effort", schema=SCHEMA)
