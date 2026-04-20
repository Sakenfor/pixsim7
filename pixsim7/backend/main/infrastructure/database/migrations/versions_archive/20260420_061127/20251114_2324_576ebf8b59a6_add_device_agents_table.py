"""add_device_agents_table

Revision ID: 576ebf8b59a6
Revises: a1b2c3d4e5f6
Create Date: 2025-11-14 23:24:41.781806

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '576ebf8b59a6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create device_agents table
    op.create_table('device_agents',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('agent_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('host', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('port', sa.Integer(), nullable=False),
    sa.Column('api_port', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
    sa.Column('is_enabled', sa.Boolean(), nullable=False),
    sa.Column('last_heartbeat', sa.DateTime(), nullable=True),
    sa.Column('version', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=True),
    sa.Column('os_info', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_device_agents_agent_id'), 'device_agents', ['agent_id'], unique=True)
    op.create_index(op.f('ix_device_agents_id'), 'device_agents', ['id'], unique=False)
    op.create_index(op.f('ix_device_agents_status'), 'device_agents', ['status'], unique=False)
    op.create_index(op.f('ix_device_agents_user_id'), 'device_agents', ['user_id'], unique=False)

    # Add agent_id foreign key to android_devices
    op.add_column('android_devices', sa.Column('agent_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_android_devices_agent_id'), 'android_devices', ['agent_id'], unique=False)
    op.create_foreign_key(None, 'android_devices', 'device_agents', ['agent_id'], ['id'])


def downgrade() -> None:
    # Remove agent_id foreign key from android_devices
    op.drop_constraint(None, 'android_devices', type_='foreignkey')
    op.drop_index(op.f('ix_android_devices_agent_id'), table_name='android_devices')
    op.drop_column('android_devices', 'agent_id')

    # Drop device_agents table
    op.drop_index(op.f('ix_device_agents_user_id'), table_name='device_agents')
    op.drop_index(op.f('ix_device_agents_status'), table_name='device_agents')
    op.drop_index(op.f('ix_device_agents_id'), table_name='device_agents')
    op.drop_index(op.f('ix_device_agents_agent_id'), table_name='device_agents')
    op.drop_table('device_agents')
