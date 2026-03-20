"""Add audit_event_id column to notifications table.

Links notifications to their originating entity_audit entry.
Logical FK (no constraint) to keep the tables loosely coupled.

Revision ID: 20260321_0002
"""
from alembic import op
import sqlalchemy as sa

revision = "20260321_0002"
down_revision = "20260321_0001"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c["name"] for c in inspector.get_columns("notifications", schema=SCHEMA)]
    if "audit_event_id" in columns:
        return
    op.add_column(
        "notifications",
        sa.Column("audit_event_id", sa.Uuid, nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("notifications", "audit_event_id", schema=SCHEMA)
