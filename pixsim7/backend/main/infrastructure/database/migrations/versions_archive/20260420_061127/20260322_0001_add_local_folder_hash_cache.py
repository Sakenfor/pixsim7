"""Add local_folder_hash_cache table for persisting client-side SHA-256 hashes.

Revision ID: 20260322_0001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260322_0001"
down_revision = "20260321_0007"
branch_labels = None
depends_on = None

TABLE = "local_folder_hash_cache"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if TABLE in inspector.get_table_names():
        return

    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.String(255), nullable=False),
        sa.Column("manifest", JSONB, nullable=False, server_default=sa.text("'[]'")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_lfhc_user_folder", TABLE, ["user_id", "folder_id"], unique=True)
    op.create_index("ix_lfhc_user_id", TABLE, ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_lfhc_user_id", table_name=TABLE)
    op.drop_index("ix_lfhc_user_folder", table_name=TABLE)
    op.drop_table(TABLE)
