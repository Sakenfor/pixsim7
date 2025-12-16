"""add user_plugin_states table

Revision ID: add_user_plugin_states
Revises: add_plugin_catalog
Create Date: 2025-12-15 01:01:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'add_user_plugin_states'
down_revision = 'add_plugin_catalog'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create user_plugin_states table"""
    op.create_table(
        'user_plugin_states',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('plugin_id', sa.String(length=100), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('settings', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('enabled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('disabled_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'plugin_id', name='uq_user_plugin')
    )
    op.create_index(op.f('ix_user_plugin_states_user_id'), 'user_plugin_states', ['user_id'], unique=False)
    op.create_index(op.f('ix_user_plugin_states_plugin_id'), 'user_plugin_states', ['plugin_id'], unique=False)
    op.create_index(op.f('ix_user_plugin_states_workspace_id'), 'user_plugin_states', ['workspace_id'], unique=False)


def downgrade() -> None:
    """Drop user_plugin_states table"""
    op.drop_index(op.f('ix_user_plugin_states_workspace_id'), table_name='user_plugin_states')
    op.drop_index(op.f('ix_user_plugin_states_plugin_id'), table_name='user_plugin_states')
    op.drop_index(op.f('ix_user_plugin_states_user_id'), table_name='user_plugin_states')
    op.drop_table('user_plugin_states')
