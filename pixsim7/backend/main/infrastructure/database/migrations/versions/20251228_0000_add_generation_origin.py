"""add origin field to generations table

Track whether generation was created locally, synced from provider, or backfilled.

Revision ID: 20251228_0000
Revises: 20251227_0000
Create Date: 2025-12-28
"""
from alembic import op
import sqlalchemy as sa

revision = '20251228_0000'
down_revision = '20251227_0000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create generation_origin enum (follows existing pattern)
    generation_origin_enum = sa.Enum(
        'local', 'sync', 'migration',
        name='generation_origin_enum'
    )
    generation_origin_enum.create(op.get_bind(), checkfirst=True)

    # Add column with native_enum=False (matches enum_column pattern)
    op.add_column(
        'generations',
        sa.Column(
            'origin',
            sa.Enum(
                'local', 'sync', 'migration',
                name='generation_origin_enum',
                native_enum=False
            ),
            nullable=False,
            server_default='local'
        )
    )

    # Index for filtering by origin
    op.create_index('ix_generations_origin', 'generations', ['origin'])


def downgrade() -> None:
    op.drop_index('ix_generations_origin', table_name='generations')
    op.drop_column('generations', 'origin')
    sa.Enum(name='generation_origin_enum').drop(op.get_bind(), checkfirst=True)
