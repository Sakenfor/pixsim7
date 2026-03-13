"""Create game_hotspots table.

The GameHotspot model existed but the CREATE TABLE migration was never written.
Later migrations (20260104_0005, 20260104_0006) already guard with table_exists
checks, so this migration is safe to run on databases where the table was
manually created.

Revision ID: 20260313_0004
Revises: 20260313_0003
Create Date: 2026-03-13
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260313_0004"
down_revision = "20260313_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Guard: skip if the table already exists (some envs may have created it manually)
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'game_hotspots')"
    ))
    if result.scalar():
        return

    op.create_table(
        "game_hotspots",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("scope", sa.String(32), nullable=False),
        sa.Column("world_id", sa.Integer, sa.ForeignKey("game_worlds.id"), nullable=True, index=True),
        sa.Column("location_id", sa.Integer, sa.ForeignKey("game_locations.id"), nullable=True, index=True),
        sa.Column("scene_id", sa.Integer, sa.ForeignKey("game_scenes.id"), nullable=True, index=True),
        sa.Column("hotspot_id", sa.String(128), nullable=False),
        sa.Column("target", sa.JSON, nullable=True),
        sa.Column("action", sa.JSON, nullable=True),
        sa.Column("meta", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now(), index=True),
    )


def downgrade() -> None:
    op.drop_table("game_hotspots")
