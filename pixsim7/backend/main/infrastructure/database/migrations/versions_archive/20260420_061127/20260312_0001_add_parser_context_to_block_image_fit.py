"""Add parser_context_snapshot column to block_image_fits

Revision ID: 20260312_0001
Revises: 20260310_0005
Create Date: 2026-03-12

Adds a JSON column for persisting parser-provided primitive/op context
alongside fit records, enabling calibration and inspection of context-aware
scoring contributions.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = '20260312_0001'
down_revision = '20260310_0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'block_image_fits',
        sa.Column(
            'parser_context_snapshot',
            JSON,
            nullable=False,
            server_default='{}',
        ),
    )


def downgrade() -> None:
    op.drop_column('block_image_fits', 'parser_context_snapshot')
