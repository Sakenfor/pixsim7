"""add media ingestion fields

Revision ID: 20251217_0100
Revises: 20251217_0001
Create Date: 2025-12-17 01:00:00.000000

Add fields for media ingestion pipeline:
- ingest_status: Track ingestion state (pending/processing/completed/failed)
- ingest_error: Store error message if ingestion failed
- ingested_at: When ingestion completed successfully
- stored_key: Storage key for main file (e.g., "u/1/assets/123.mp4")
- thumbnail_key: Storage key for generated thumbnail
- preview_key: Storage key for preview/proxy image
- metadata_extracted_at: When metadata extraction completed
- thumbnail_generated_at: When thumbnail generation completed
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20251217_0100'
down_revision = '20251217_0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add ingestion tracking fields to assets table
    op.add_column(
        'assets',
        sa.Column(
            'ingest_status',
            sa.String(length=16),
            nullable=True,
            comment='Ingestion status: pending/processing/completed/failed'
        )
    )
    op.add_column(
        'assets',
        sa.Column(
            'ingest_error',
            sa.Text(),
            nullable=True,
            comment='Error message if ingestion failed'
        )
    )
    op.add_column(
        'assets',
        sa.Column(
            'ingested_at',
            sa.DateTime(),
            nullable=True,
            comment='When ingestion completed successfully'
        )
    )
    op.add_column(
        'assets',
        sa.Column(
            'stored_key',
            sa.String(length=512),
            nullable=True,
            comment='Storage key for main file'
        )
    )
    op.add_column(
        'assets',
        sa.Column(
            'thumbnail_key',
            sa.String(length=512),
            nullable=True,
            comment='Storage key for thumbnail'
        )
    )
    op.add_column(
        'assets',
        sa.Column(
            'preview_key',
            sa.String(length=512),
            nullable=True,
            comment='Storage key for preview image'
        )
    )
    op.add_column(
        'assets',
        sa.Column(
            'metadata_extracted_at',
            sa.DateTime(),
            nullable=True,
            comment='When metadata extraction completed'
        )
    )
    op.add_column(
        'assets',
        sa.Column(
            'thumbnail_generated_at',
            sa.DateTime(),
            nullable=True,
            comment='When thumbnail generation completed'
        )
    )

    # Create index on ingest_status for querying pending/failed assets
    op.create_index('idx_asset_ingest_status', 'assets', ['ingest_status'])


def downgrade() -> None:
    op.drop_index('idx_asset_ingest_status', table_name='assets')
    op.drop_column('assets', 'thumbnail_generated_at')
    op.drop_column('assets', 'metadata_extracted_at')
    op.drop_column('assets', 'preview_key')
    op.drop_column('assets', 'thumbnail_key')
    op.drop_column('assets', 'stored_key')
    op.drop_column('assets', 'ingested_at')
    op.drop_column('assets', 'ingest_error')
    op.drop_column('assets', 'ingest_status')
