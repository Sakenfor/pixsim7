"""add phases column to plan_registry

Ordered list of child plan IDs representing plan phases.
Follows the same JSON column pattern as depends_on, companions, etc.

Revision ID: 20260329_0002
Revises: 20260329_0001
Create Date: 2026-03-29
"""
import sqlalchemy as sa
from alembic import op

revision = '20260329_0002'
down_revision = '20260329_0001'
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    op.add_column(
        "plan_registry",
        sa.Column("phases", sa.JSON(), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("plan_registry", "phases", schema=SCHEMA)
