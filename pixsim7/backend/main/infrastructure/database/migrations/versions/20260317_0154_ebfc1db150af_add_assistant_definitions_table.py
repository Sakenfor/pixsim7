"""add assistant_definitions table

Revision ID: ebfc1db150af
Revises: 20260316_0013
Create Date: 2026-03-17 01:54:36.308213

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

# revision identifiers, used by Alembic
revision = 'ebfc1db150af'
down_revision = '20260316_0013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create assistant_definitions table."""
    op.create_table(
        'assistant_definitions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('assistant_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
        sa.Column('base_assistant_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('icon', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('model_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('method', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=True),
        sa.Column('system_prompt', sa.Text(), nullable=True),
        sa.Column('audience', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False, server_default='user'),
        sa.Column('allowed_contracts', sa.JSON(), nullable=True),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('owner_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('version', sa.Integer(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_assistant_definitions_assistant_id', 'assistant_definitions', ['assistant_id'], unique=True)
    op.create_index('ix_assistant_definitions_owner_user_id', 'assistant_definitions', ['owner_user_id'])
    op.create_index('ix_assistant_definitions_enabled', 'assistant_definitions', ['enabled'])
    op.create_index('ix_assistant_definitions_is_default', 'assistant_definitions', ['is_default'])


def downgrade() -> None:
    """Drop assistant_definitions table."""
    op.drop_index('ix_assistant_definitions_is_default', table_name='assistant_definitions')
    op.drop_index('ix_assistant_definitions_enabled', table_name='assistant_definitions')
    op.drop_index('ix_assistant_definitions_owner_user_id', table_name='assistant_definitions')
    op.drop_index('ix_assistant_definitions_assistant_id', table_name='assistant_definitions')
    op.drop_table('assistant_definitions')
