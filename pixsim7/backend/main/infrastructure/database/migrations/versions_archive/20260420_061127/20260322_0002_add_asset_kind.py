"""Add asset_kind column for categorizing asset purpose.

Revision ID: 20260322_0002
"""

from alembic import op
import sqlalchemy as sa

revision = "20260322_0002"
down_revision = "20260322_0001"
branch_labels = None
depends_on = None

TABLE = "assets"
COLUMN = "asset_kind"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns(TABLE)}

    if COLUMN not in columns:
        op.add_column(
            TABLE,
            sa.Column(COLUMN, sa.String(32), nullable=False, server_default="content"),
        )
        op.create_index(f"ix_{TABLE}_{COLUMN}", TABLE, [COLUMN])


def downgrade() -> None:
    op.drop_index(f"ix_{TABLE}_{COLUMN}", table_name=TABLE)
    op.drop_column(TABLE, COLUMN)
