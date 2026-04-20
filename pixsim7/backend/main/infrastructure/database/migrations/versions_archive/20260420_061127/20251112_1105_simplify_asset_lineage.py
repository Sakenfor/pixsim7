"""Simplify asset lineage schema - preserve temporal metadata.

Renames parent_role → relation_type for clarity.
Removes: transformation (JSON), operation_job_id (job tracking).
Preserves: parent_start_time, parent_end_time, parent_frame (needed for paused video generation).

Revision ID: 1105simplifylineage
Revises: 2330addema
Create Date: 2025-11-12 11:05:00
"""
from alembic import op
import sqlalchemy as sa

revision = '1105simplifylineage'
down_revision = '2330addema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # Preserve branching tables (asset_branches, asset_branch_variants, asset_clips)
    # We only simplify asset_lineage; do NOT drop existing branch-related tables.

    # Simplify asset_lineage: recreate minimal schema if legacy columns present
    if 'asset_lineage' in inspector.get_table_names():
        cols = {c['name'] for c in inspector.get_columns('asset_lineage')}
        legacy_markers = {'parent_start_time', 'transformation', 'operation_job_id'}
        if legacy_markers & cols:
            # Drop any auto-generated indexes first (from old SQLModel index=True)
            try:
                op.drop_index('ix_asset_lineage_child_asset_id', 'asset_lineage')
            except:
                pass
            try:
                op.drop_index('ix_asset_lineage_parent_asset_id', 'asset_lineage')
            except:
                pass

            # Rename old table
            op.rename_table('asset_lineage', 'asset_lineage_legacy')
            # Create new simplified table (keeping useful temporal/frame metadata)
            # Note: Don't use index=True here to avoid conflicts with explicitly named indexes below
            op.create_table(
                'asset_lineage',
                sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
                sa.Column('child_asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False),
                sa.Column('parent_asset_id', sa.Integer(), sa.ForeignKey('assets.id'), nullable=False),
                sa.Column('relation_type', sa.String(length=32), nullable=False),
                sa.Column('operation_type', sa.String(length=32), nullable=True),
                sa.Column('sequence_order', sa.Integer(), nullable=False, server_default='0'),
                # Preserve temporal metadata (needed for paused video generation, clips, etc.)
                sa.Column('parent_start_time', sa.Float(), nullable=True),
                sa.Column('parent_end_time', sa.Float(), nullable=True),
                sa.Column('parent_frame', sa.Integer(), nullable=True),
                sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
            )
            # Copy data including temporal metadata
            copy_cols = []
            # Try to copy all relevant columns
            essential = ['child_asset_id', 'parent_asset_id', 'parent_role']
            optional = ['operation_type', 'sequence_order', 'parent_start_time', 'parent_end_time', 'parent_frame', 'created_at']

            if all(c in cols for c in essential):
                copy_cols = essential.copy()
                for c in optional:
                    if c in cols:
                        copy_cols.append(c)

            if copy_cols:
                select_list = ', '.join(copy_cols)
                insert_list = []
                for c in copy_cols:
                    if c == 'parent_role':
                        insert_list.append('relation_type')
                    else:
                        insert_list.append(c)
                insert_cols = ', '.join(insert_list)
                op.execute(f"INSERT INTO asset_lineage ({insert_cols}) SELECT {select_list} FROM asset_lineage_legacy")
            # Drop legacy table
            op.drop_table('asset_lineage_legacy')

    # Keep existing enum if present; lineage now stores operation_type as string but
    # other legacy components may still rely on the enum. We won't drop it here.

    # Indexes for simplified table
    if 'asset_lineage' in inspector.get_table_names():
        # Use IF NOT EXISTS pattern guarded by inspector
        existing_indexes = {ix['name'] for ix in inspector.get_indexes('asset_lineage')}
        if 'idx_lineage_child' not in existing_indexes:
            op.create_index('idx_lineage_child', 'asset_lineage', ['child_asset_id'])
        if 'idx_lineage_parent' not in existing_indexes:
            op.create_index('idx_lineage_parent', 'asset_lineage', ['parent_asset_id'])
        if 'idx_lineage_child_parent' not in existing_indexes:
            op.create_index('idx_lineage_child_parent', 'asset_lineage', ['child_asset_id', 'parent_asset_id'])
        if 'idx_lineage_operation' not in existing_indexes:
            op.create_index('idx_lineage_operation', 'asset_lineage', ['operation_type'])


def downgrade() -> None:
    # Downgrade: rename relation_type back to parent_role (preserving temporal data)
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if 'asset_lineage' in inspector.get_table_names():
        op.rename_table('asset_lineage', 'asset_lineage_new')
        op.create_table(
            'asset_lineage',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('child_asset_id', sa.Integer(), nullable=False),
            sa.Column('parent_asset_id', sa.Integer(), nullable=False),
            sa.Column('parent_role', sa.String(length=32), nullable=False),
            sa.Column('operation_type', sa.String(length=32), nullable=True),
            sa.Column('sequence_order', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('parent_start_time', sa.Float(), nullable=True),
            sa.Column('parent_end_time', sa.Float(), nullable=True),
            sa.Column('parent_frame', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        )
        # Copy data back
        op.execute("INSERT INTO asset_lineage (child_asset_id,parent_asset_id,parent_role,operation_type,sequence_order,parent_start_time,parent_end_time,parent_frame,created_at) SELECT child_asset_id,parent_asset_id,relation_type,operation_type,sequence_order,parent_start_time,parent_end_time,parent_frame,created_at FROM asset_lineage_new")
        op.drop_table('asset_lineage_new')