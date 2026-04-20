"""add asset versioning tables and columns

Adds git-like versioning for assets:
- AssetVersionFamily table to group versions
- version_family_id, version_number, parent_asset_id columns on assets
- Constraints to ensure version consistency

Revision ID: 20251229_0000
Revises: 20251228_0000
Create Date: 2025-12-29
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

revision = '20251229_0000'
down_revision = '20251228_0000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration: add asset versioning tables and columns"""

    # Create asset_version_families table
    op.create_table(
        'asset_version_families',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text('gen_random_uuid()')
        ),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=False, server_default='[]'),
        # head_asset_id FK added after assets columns exist
        sa.Column('head_asset_id', sa.Integer(), nullable=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.text('now()')
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(),
            nullable=False,
            server_default=sa.text('now()')
        ),
    )
    op.create_index(
        'idx_avf_user_updated',
        'asset_version_families',
        ['user_id', 'updated_at']
    )

    # Add versioning columns to assets table
    op.add_column(
        'assets',
        sa.Column('version_family_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.add_column(
        'assets',
        sa.Column('version_number', sa.Integer(), nullable=True)
    )
    op.add_column(
        'assets',
        sa.Column('parent_asset_id', sa.Integer(), nullable=True)
    )
    op.add_column(
        'assets',
        sa.Column(
            'version_message',
            sqlmodel.sql.sqltypes.AutoString(length=500),
            nullable=True
        )
    )

    # Add foreign key from assets to asset_version_families (ON DELETE SET NULL)
    op.create_foreign_key(
        'fk_asset_version_family',
        'assets',
        'asset_version_families',
        ['version_family_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Add self-referential foreign key for parent_asset_id (ON DELETE SET NULL)
    op.create_foreign_key(
        'fk_asset_parent_version',
        'assets',
        'assets',
        ['parent_asset_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Now add FK from asset_version_families to assets for head_asset_id
    op.create_foreign_key(
        'fk_avf_head_asset',
        'asset_version_families',
        'assets',
        ['head_asset_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Create unique partial index for version numbers within a family
    op.execute("""
        CREATE UNIQUE INDEX idx_asset_version_family_number
        ON assets (version_family_id, version_number)
        WHERE version_family_id IS NOT NULL
    """)

    # Create partial index for parent asset lookups
    op.execute("""
        CREATE INDEX idx_asset_parent_version
        ON assets (parent_asset_id)
        WHERE parent_asset_id IS NOT NULL
    """)

    # Add CHECK constraint: if in a family, must have version_number
    op.execute("""
        ALTER TABLE assets ADD CONSTRAINT chk_version_consistency
        CHECK (version_family_id IS NULL OR version_number IS NOT NULL)
    """)

    # Add CHECK constraint: version_number must be positive
    op.execute("""
        ALTER TABLE assets ADD CONSTRAINT chk_version_positive
        CHECK (version_number IS NULL OR version_number > 0)
    """)


def downgrade() -> None:
    """Revert migration: remove asset versioning tables and columns

    WARNING: This will remove all version family data!
    """
    # Drop CHECK constraints
    op.execute('ALTER TABLE assets DROP CONSTRAINT IF EXISTS chk_version_positive')
    op.execute('ALTER TABLE assets DROP CONSTRAINT IF EXISTS chk_version_consistency')

    # Drop indexes
    op.drop_index('idx_asset_parent_version', table_name='assets')
    op.drop_index('idx_asset_version_family_number', table_name='assets')

    # Drop foreign keys
    op.drop_constraint('fk_avf_head_asset', 'asset_version_families', type_='foreignkey')
    op.drop_constraint('fk_asset_parent_version', 'assets', type_='foreignkey')
    op.drop_constraint('fk_asset_version_family', 'assets', type_='foreignkey')

    # Drop columns from assets
    op.drop_column('assets', 'version_message')
    op.drop_column('assets', 'parent_asset_id')
    op.drop_column('assets', 'version_number')
    op.drop_column('assets', 'version_family_id')

    # Drop asset_version_families table
    op.drop_index('idx_avf_user_updated', table_name='asset_version_families')
    op.drop_table('asset_version_families')
