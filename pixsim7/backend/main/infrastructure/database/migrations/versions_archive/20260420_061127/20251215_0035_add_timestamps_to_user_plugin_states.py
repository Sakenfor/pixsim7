"""add timestamps to user_plugin_states

Revision ID: 20251215_0035
Revises: 20251215_0027
Create Date: 2025-12-15 00:35:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers
revision = '20251215_0035'
down_revision = 'add_user_plugin_states'  # Must come after table creation
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add created_at and updated_at columns to user_plugin_states"""
    # Add created_at column with default to current timestamp
    op.add_column('user_plugin_states',
        sa.Column('created_at', sa.DateTime(timezone=True),
                  nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP'))
    )

    # Add updated_at column with default to current timestamp
    op.add_column('user_plugin_states',
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  nullable=False,
                  server_default=sa.text('CURRENT_TIMESTAMP'))
    )


def downgrade() -> None:
    """Remove created_at and updated_at columns from user_plugin_states"""
    op.drop_column('user_plugin_states', 'updated_at')
    op.drop_column('user_plugin_states', 'created_at')
