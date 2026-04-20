"""Add run_id and plan_id columns to entity_audit.

Revision ID: 20260325_0002
Revises: 20260325_0001
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260325_0002"
down_revision = "20260325_0001"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
TABLE = "entity_audit"


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column("run_id", sa.String(120), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        TABLE,
        sa.Column("plan_id", sa.String(120), nullable=True),
        schema=SCHEMA,
    )
    op.create_index("idx_entity_audit_run_id", TABLE, ["run_id"], schema=SCHEMA)
    op.create_index("idx_entity_audit_plan_id", TABLE, ["plan_id"], schema=SCHEMA)


def downgrade() -> None:
    op.drop_index("idx_entity_audit_plan_id", table_name=TABLE, schema=SCHEMA)
    op.drop_index("idx_entity_audit_run_id", table_name=TABLE, schema=SCHEMA)
    op.drop_column(TABLE, "plan_id", schema=SCHEMA)
    op.drop_column(TABLE, "run_id", schema=SCHEMA)
