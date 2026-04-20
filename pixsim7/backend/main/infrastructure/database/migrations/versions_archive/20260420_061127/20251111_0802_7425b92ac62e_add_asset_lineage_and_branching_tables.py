"""Add asset lineage and branching tables

Revision ID: 7425b92ac62e
Revises: 14b1bebe4be1
Create Date: 2025-11-11 08:02:12.508428

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '7425b92ac62e'
down_revision = '14b1bebe4be1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum for OperationType if not exists
    operationtype_enum = postgresql.ENUM(
        'text_to_video', 'image_to_video', 'video_extend', 'video_transition', 'fusion',
        name='operationtype'
    )
    bind = op.get_bind()
    if not bind.dialect.has_type(bind, 'operationtype'):  # type: ignore[attr-defined]
        operationtype_enum.create(bind)

    # asset_lineage table
    op.create_table(
        'asset_lineage',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('child_asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False, index=True),
        sa.Column('parent_asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False, index=True),
        sa.Column('parent_role', sqlmodel.sql.sqltypes.AutoString(length=32), nullable=False),
        sa.Column('operation_type', sa.Enum('text_to_video', 'image_to_video', 'video_extend', 'video_transition', 'fusion', name='operationtype'), nullable=False),
        sa.Column('operation_job_id', sa.Integer(), sa.ForeignKey('jobs.id'), nullable=True),
        sa.Column('parent_start_time', sa.Float(), nullable=True),
        sa.Column('parent_end_time', sa.Float(), nullable=True),
        sa.Column('parent_frame', sa.Integer(), nullable=True),
        sa.Column('transformation', sa.JSON(), nullable=True),
        sa.Column('sequence_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('idx_lineage_child', 'asset_lineage', ['child_asset_id'])
    op.create_index('idx_lineage_parent', 'asset_lineage', ['parent_asset_id'])
    op.create_index('idx_lineage_operation', 'asset_lineage', ['operation_type'])
    op.create_index('idx_lineage_child_full', 'asset_lineage', ['child_asset_id', 'sequence_order'])

    # asset_branches table
    op.create_table(
        'asset_branches',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('source_asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False, index=True),
        sa.Column('branch_time', sa.Float(), nullable=False),
        sa.Column('branch_frame', sa.Integer(), nullable=True),
        sa.Column('branch_name', sqlmodel.sql.sqltypes.AutoString(length=128), nullable=True),
        sa.Column('branch_description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('branch_tag', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
        sa.Column('branch_type', sqlmodel.sql.sqltypes.AutoString(length=32), nullable=False, server_default='manual'),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('game_metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('idx_branch_source_time', 'asset_branches', ['source_asset_id', 'branch_time'])
    op.create_index('idx_branch_tag', 'asset_branches', ['branch_tag'])

    # asset_branch_variants table
    op.create_table(
        'asset_branch_variants',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('branch_id', sa.Integer(), sa.ForeignKey('asset_branches.id'), nullable=False, index=True),
        sa.Column('variant_asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False, index=True),
        sa.Column('variant_name', sqlmodel.sql.sqltypes.AutoString(length=128), nullable=False),
        sa.Column('variant_description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('variant_tag', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
        sa.Column('weight', sa.Float(), nullable=False, server_default='1.0'),
        sa.Column('conditions', sa.JSON(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('idx_branch_variant_unique', 'asset_branch_variants', ['branch_id', 'variant_asset_id'], unique=True)
    op.create_index('idx_branch_variant_tag', 'asset_branch_variants', ['variant_tag'])

    # asset_clips table
    op.create_table(
        'asset_clips',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('source_asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False, index=True),
        sa.Column('start_time', sa.Float(), nullable=False),
        sa.Column('end_time', sa.Float(), nullable=False),
        sa.Column('start_frame', sa.Integer(), nullable=True),
        sa.Column('end_frame', sa.Integer(), nullable=True),
        sa.Column('clip_name', sqlmodel.sql.sqltypes.AutoString(length=128), nullable=False),
        sa.Column('clip_tag', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=True),
        sa.Column('clip_asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=True),
        sa.Column('playback_metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('idx_clip_source', 'asset_clips', ['source_asset_id', 'start_time'])
    op.create_index('idx_clip_tag', 'asset_clips', ['clip_tag'])


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_index('idx_clip_tag', table_name='asset_clips')
    op.drop_index('idx_clip_source', table_name='asset_clips')
    op.drop_table('asset_clips')

    op.drop_index('idx_branch_variant_tag', table_name='asset_branch_variants')
    op.drop_index('idx_branch_variant_unique', table_name='asset_branch_variants')
    op.drop_table('asset_branch_variants')

    op.drop_index('idx_branch_tag', table_name='asset_branches')
    op.drop_index('idx_branch_source_time', table_name='asset_branches')
    op.drop_table('asset_branches')

    op.drop_index('idx_lineage_child_full', table_name='asset_lineage')
    op.drop_index('idx_lineage_operation', table_name='asset_lineage')
    op.drop_index('idx_lineage_parent', table_name='asset_lineage')
    op.drop_index('idx_lineage_child', table_name='asset_lineage')
    op.drop_table('asset_lineage')

    # Drop enum type
    operationtype_enum = postgresql.ENUM(
        'text_to_video', 'image_to_video', 'video_extend', 'video_transition', 'fusion',
        name='operationtype'
    )
    bind = op.get_bind()
    try:
        operationtype_enum.drop(bind, checkfirst=True)
    except Exception:
        pass
