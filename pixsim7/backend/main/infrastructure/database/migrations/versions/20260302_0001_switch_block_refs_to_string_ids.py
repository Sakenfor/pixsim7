"""Switch block reference columns from UUIDs to canonical string block IDs.

Revision ID: 20260302_0001
Revises: 20260301_0005
Create Date: 2026-03-02

Converts:
- block_image_fits.block_id           UUID -> VARCHAR(200)
- character_usage.action_block_id     UUID -> VARCHAR(200)

This aligns main-db references with BlockPrimitive.block_id (cross-db canonical ID).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260302_0001"
down_revision = "20260301_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # block_image_fits.block_id previously referenced action_blocks.id (UUID).
    # Drop FK before type change; we now store canonical string block IDs.
    op.execute(
        "ALTER TABLE block_image_fits "
        "DROP CONSTRAINT IF EXISTS block_image_fits_block_id_fkey"
    )
    op.alter_column(
        "block_image_fits",
        "block_id",
        existing_type=postgresql.UUID(as_uuid=True),
        type_=sa.String(length=200),
        existing_nullable=False,
        postgresql_using="block_id::text",
    )

    # character_usage.action_block_id is a soft reference; convert to string.
    op.alter_column(
        "character_usage",
        "action_block_id",
        existing_type=postgresql.UUID(as_uuid=True),
        type_=sa.String(length=200),
        existing_nullable=True,
        postgresql_using="action_block_id::text",
    )


def downgrade() -> None:
    # WARNING: downgrade assumes all values are UUID-formatted strings.
    op.alter_column(
        "character_usage",
        "action_block_id",
        existing_type=sa.String(length=200),
        type_=postgresql.UUID(as_uuid=True),
        existing_nullable=True,
        postgresql_using="NULLIF(action_block_id, '')::uuid",
    )

    op.alter_column(
        "block_image_fits",
        "block_id",
        existing_type=sa.String(length=200),
        type_=postgresql.UUID(as_uuid=True),
        existing_nullable=False,
        postgresql_using="block_id::uuid",
    )
    op.execute(
        "ALTER TABLE block_image_fits "
        "DROP CONSTRAINT IF EXISTS block_image_fits_block_id_fkey"
    )
    op.create_foreign_key(
        "block_image_fits_block_id_fkey",
        "block_image_fits",
        "action_blocks",
        ["block_id"],
        ["id"],
    )
