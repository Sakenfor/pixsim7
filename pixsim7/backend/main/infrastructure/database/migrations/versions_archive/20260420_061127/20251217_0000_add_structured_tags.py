"""add structured hierarchical tags

Revision ID: 20251217_0000
Revises: 20251216_0000_add_client_tracking_to_user_sessions
Create Date: 2025-12-17 00:00:00.000000

Replace string-based tags with structured hierarchical tags supporting:
- Namespaced tags (e.g., character:alice, location:tokyo)
- Hierarchy via parent_tag_id
- Aliasing via canonical_tag_id
- Extensibility via meta jsonb field
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251217_0000'
down_revision = '20251216_0000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create tag table
    op.create_table(
        'tag',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('namespace', sa.String(length=64), nullable=False, comment='Tag namespace (normalized lowercase)'),
        sa.Column('name', sa.String(length=128), nullable=False, comment='Tag name (normalized lowercase)'),
        sa.Column('slug', sa.String(length=196), nullable=False, comment='Unique slug: namespace:name'),
        sa.Column('display_name', sa.String(length=256), nullable=True, comment='Display name preserving original casing'),
        sa.Column('parent_tag_id', sa.Integer(), nullable=True, comment='Parent tag for hierarchy'),
        sa.Column('canonical_tag_id', sa.Integer(), nullable=True, comment='Canonical tag if this is an alias'),
        sa.Column('meta', sa.JSON(), nullable=True, comment='Plugin/provider metadata (extensibility)'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['parent_tag_id'], ['tag.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['canonical_tag_id'], ['tag.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for tag
    op.create_index('idx_tag_slug_unique', 'tag', ['slug'], unique=True)
    op.create_index('idx_tag_namespace', 'tag', ['namespace'])
    op.create_index('idx_tag_parent', 'tag', ['parent_tag_id'])
    op.create_index('idx_tag_canonical', 'tag', ['canonical_tag_id'])
    op.create_index('idx_tag_created', 'tag', ['created_at'])

    # Create asset_tag join table
    op.create_table(
        'asset_tag',
        sa.Column('asset_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tag.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('asset_id', 'tag_id')
    )

    # Create indexes for asset_tag
    op.create_index('idx_asset_tag_asset', 'asset_tag', ['asset_id'])
    op.create_index('idx_asset_tag_tag', 'asset_tag', ['tag_id'])
    op.create_index('idx_asset_tag_created', 'asset_tag', ['created_at'])


def downgrade() -> None:
    # Drop asset_tag table and indexes
    op.drop_index('idx_asset_tag_created', table_name='asset_tag')
    op.drop_index('idx_asset_tag_tag', table_name='asset_tag')
    op.drop_index('idx_asset_tag_asset', table_name='asset_tag')
    op.drop_table('asset_tag')

    # Drop tag table and indexes
    op.drop_index('idx_tag_created', table_name='tag')
    op.drop_index('idx_tag_canonical', table_name='tag')
    op.drop_index('idx_tag_parent', table_name='tag')
    op.drop_index('idx_tag_namespace', table_name='tag')
    op.drop_index('idx_tag_slug_unique', table_name='tag')
    op.drop_table('tag')
