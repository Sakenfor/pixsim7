"""Add dismissed column to plan_review_requests (PlanRequest).

Revision ID: 20260322_0003
"""

from alembic import op
import sqlalchemy as sa


revision = "20260322_0003"
down_revision = "20260322_0002"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
TABLE = "plan_review_requests"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns(TABLE, schema=SCHEMA)}

    if "dismissed" not in columns:
        op.add_column(
            TABLE,
            sa.Column("dismissed", sa.Boolean(), nullable=False, server_default="false"),
            schema=SCHEMA,
        )


def downgrade() -> None:
    op.drop_column(TABLE, "dismissed", schema=SCHEMA)
