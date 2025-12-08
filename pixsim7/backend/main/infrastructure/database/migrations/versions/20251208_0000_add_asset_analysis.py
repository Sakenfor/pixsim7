"""add asset analysis table and provider_submissions.analysis_id

Revision ID: a1b2c3d4e5f8
Revises: 20251203_0000_add_device_last_used_at
Create Date: 2025-12-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f8'
down_revision = '20251203_0000_add_device_last_used_at'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create analyzer_type enum
    analyzer_type_enum = sa.Enum(
        'face_detection', 'scene_tagging', 'content_moderation',
        'object_detection', 'ocr', 'caption', 'embedding', 'custom',
        name='analyzer_type_enum'
    )
    analyzer_type_enum.create(op.get_bind(), checkfirst=True)

    # Create analysis_status enum
    analysis_status_enum = sa.Enum(
        'pending', 'processing', 'completed', 'failed', 'cancelled',
        name='analysis_status_enum'
    )
    analysis_status_enum.create(op.get_bind(), checkfirst=True)

    # Create asset_analyses table
    op.create_table(
        'asset_analyses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('analyzer_type', sa.Enum(
            'face_detection', 'scene_tagging', 'content_moderation',
            'object_detection', 'ocr', 'caption', 'embedding', 'custom',
            name='analyzer_type_enum', native_enum=False
        ), nullable=False),
        sa.Column('analyzer_version', sa.String(50), nullable=True),
        sa.Column('provider_id', sa.String(50), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=True),
        sa.Column('params', sa.JSON(), nullable=True),
        sa.Column('status', sa.Enum(
            'pending', 'processing', 'completed', 'failed', 'cancelled',
            name='analysis_status_enum', native_enum=False
        ), nullable=False, server_default='pending'),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes
    op.create_index('idx_analysis_asset_type', 'asset_analyses', ['asset_id', 'analyzer_type'])
    op.create_index('idx_analysis_user_status', 'asset_analyses', ['user_id', 'status', 'created_at'])
    op.create_index('idx_analysis_status_created', 'asset_analyses', ['status', 'created_at'])
    op.create_index('ix_asset_analyses_user_id', 'asset_analyses', ['user_id'])
    op.create_index('ix_asset_analyses_asset_id', 'asset_analyses', ['asset_id'])
    op.create_index('ix_asset_analyses_provider_id', 'asset_analyses', ['provider_id'])
    op.create_index('ix_asset_analyses_priority', 'asset_analyses', ['priority'])
    op.create_index('ix_asset_analyses_created_at', 'asset_analyses', ['created_at'])

    # Add analysis_id column to provider_submissions (nullable FK parallel to generation_id)
    op.add_column(
        'provider_submissions',
        sa.Column('analysis_id', sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        'fk_provider_submissions_analysis_id',
        'provider_submissions',
        'asset_analyses',
        ['analysis_id'],
        ['id']
    )
    op.create_index(
        'ix_provider_submissions_analysis_id',
        'provider_submissions',
        ['analysis_id']
    )


def downgrade() -> None:
    # Drop analysis_id from provider_submissions
    op.drop_index('ix_provider_submissions_analysis_id', table_name='provider_submissions')
    op.drop_constraint('fk_provider_submissions_analysis_id', 'provider_submissions', type_='foreignkey')
    op.drop_column('provider_submissions', 'analysis_id')

    # Drop asset_analyses table and indexes
    op.drop_index('ix_asset_analyses_created_at', table_name='asset_analyses')
    op.drop_index('ix_asset_analyses_priority', table_name='asset_analyses')
    op.drop_index('ix_asset_analyses_provider_id', table_name='asset_analyses')
    op.drop_index('ix_asset_analyses_asset_id', table_name='asset_analyses')
    op.drop_index('ix_asset_analyses_user_id', table_name='asset_analyses')
    op.drop_index('idx_analysis_status_created', table_name='asset_analyses')
    op.drop_index('idx_analysis_user_status', table_name='asset_analyses')
    op.drop_index('idx_analysis_asset_type', table_name='asset_analyses')
    op.drop_table('asset_analyses')

    # Drop enums
    sa.Enum(name='analysis_status_enum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='analyzer_type_enum').drop(op.get_bind(), checkfirst=True)
