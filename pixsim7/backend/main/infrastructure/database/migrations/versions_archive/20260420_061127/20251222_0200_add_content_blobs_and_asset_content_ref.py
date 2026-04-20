"""add content blobs and asset content reference

Revision ID: 20251222_0200
Revises: 20251222_0100
Create Date: 2025-12-22 02:00:00.000000

Adds:
- content_blobs table for global content hashes
- assets.content_id foreign key
- assets.logical_size_bytes for quota accounting
"""
from alembic import op
import sqlalchemy as sa


revision = "20251222_0200"
down_revision = "20251222_0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_blobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(length=64), nullable=True),
        sa.Column("stored_key", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "idx_content_blobs_sha256",
        "content_blobs",
        ["sha256"],
        unique=True,
    )

    op.add_column(
        "assets",
        sa.Column("content_id", sa.Integer(), sa.ForeignKey("content_blobs.id"), nullable=True),
    )
    op.add_column(
        "assets",
        sa.Column("logical_size_bytes", sa.Integer(), nullable=True),
    )
    op.create_index("idx_assets_content_id", "assets", ["content_id"])

    # Backfill content blobs and references (best-effort).
    op.execute(
        """
        INSERT INTO content_blobs (sha256, size_bytes, mime_type, created_at)
        SELECT DISTINCT sha256, file_size_bytes, mime_type, NOW()
        FROM assets
        WHERE sha256 IS NOT NULL
        ON CONFLICT (sha256) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE assets AS a
        SET content_id = c.id
        FROM content_blobs c
        WHERE a.sha256 = c.sha256 AND a.content_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE assets
        SET logical_size_bytes = file_size_bytes
        WHERE logical_size_bytes IS NULL AND file_size_bytes IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("idx_assets_content_id", table_name="assets")
    op.drop_column("assets", "logical_size_bytes")
    op.drop_column("assets", "content_id")
    op.drop_index("idx_content_blobs_sha256", table_name="content_blobs")
    op.drop_table("content_blobs")
