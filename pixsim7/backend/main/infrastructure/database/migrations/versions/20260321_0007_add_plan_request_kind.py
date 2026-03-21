"""Add kind column to plan_review_requests (PlanRequest generalization).

Revision ID: 20260321_0007
"""

from alembic import op
import sqlalchemy as sa


revision = "20260321_0007"
down_revision = "20260321_0006"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
TABLE = "plan_review_requests"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns(TABLE, schema=SCHEMA)}

    if "kind" not in columns:
        op.add_column(
            TABLE,
            sa.Column("kind", sa.String(32), nullable=False, server_default="review"),
            schema=SCHEMA,
        )
        op.create_index(
            f"ix_{SCHEMA}_{TABLE}_kind",
            TABLE,
            ["kind"],
            schema=SCHEMA,
        )


def downgrade() -> None:
    op.drop_index(f"ix_{SCHEMA}_{TABLE}_kind", table_name=TABLE, schema=SCHEMA)
    op.drop_column(TABLE, "kind", schema=SCHEMA)
