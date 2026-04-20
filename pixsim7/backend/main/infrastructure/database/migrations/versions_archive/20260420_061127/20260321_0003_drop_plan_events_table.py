"""Drop plan_events table — replaced by entity_audit.

Revision ID: 20260321_0003
"""
from alembic import op
import sqlalchemy as sa

revision = "20260321_0003"
down_revision = "20260321_0002"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("plan_events", schema=SCHEMA):
        return
    op.drop_table("plan_events", schema=SCHEMA)


def downgrade() -> None:
    pass  # Not restoring — data lives in entity_audit now
