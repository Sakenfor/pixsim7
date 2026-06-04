"""add assets.storage_root_id — per-asset storage tier/root placement

Media storage tiering: the main file (``stored_key``) can live on a named
storage root other than the default local one (e.g. an S3/MinIO ``archive``
reachable over ZeroTier). ``stored_key`` stays root-agnostic; the physical
location is ``roots[storage_root_id] + stored_key``.

NULL means the implicit ``local`` (hot) root — so existing rows need no
backfill and tiering is a no-op until a second root is configured. The plain
btree index supports "everything on root X" queries (reporting / rebalancing /
the relocate-videos mover).

See plan ``media-storage-tiering``.

Revision ID: 20260604_0002
Revises: 20260604_0001
Create Date: 2026-06-04
"""
from alembic import op


revision = "20260604_0002"
down_revision = "20260604_0001"
branch_labels = None
depends_on = None

_INDEX = "ix_assets_storage_root_id"


def upgrade() -> None:
    op.execute(
        "ALTER TABLE assets ADD COLUMN IF NOT EXISTS storage_root_id VARCHAR(64)"
    )
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {_INDEX} ON assets (storage_root_id)"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX}")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS storage_root_id")
