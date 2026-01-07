"""Make hotspot action first-class

Revision ID: 20260104_0005
Revises: 20260104_0004
Create Date: 2026-01-04

This migration:
1. Adds game_hotspots.action JSON column
2. Backfills action from meta.action or linked_scene_id
3. Drops linked_scene_id
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260104_0005'
down_revision = '20260104_0004'
branch_labels = None
depends_on = None


def upgrade():
    # Skip if table doesn't exist (table created separately via model)
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'game_hotspots')"
    ))
    table_exists = result.scalar()

    if not table_exists:
        # Table doesn't exist - skip migration (will be created by SQLModel)
        return

    # Check if action column already exists
    result = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_name = 'game_hotspots' AND column_name = 'action'
        )
    """))
    action_exists = result.scalar()

    if not action_exists:
        op.add_column('game_hotspots', sa.Column('action', sa.JSON(), nullable=True))

        # Backfill from meta.action if present
        op.execute("""
            UPDATE game_hotspots
            SET action = meta->'action'
            WHERE action IS NULL
            AND meta IS NOT NULL
            AND meta->'action' IS NOT NULL
        """)

    # Check if linked_scene_id column exists before trying to drop
    result = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_name = 'game_hotspots' AND column_name = 'linked_scene_id'
        )
    """))
    linked_scene_exists = result.scalar()

    if linked_scene_exists:
        # Backfill from linked_scene_id (legacy)
        op.execute("""
            UPDATE game_hotspots
            SET action = json_build_object('type', 'play_scene', 'scene_id', linked_scene_id)
            WHERE action IS NULL
            AND linked_scene_id IS NOT NULL
        """)

        # Try to drop constraint if exists
        try:
            op.drop_constraint(
                'fk_game_hotspots_linked_scene_id_game_scenes',
                'game_hotspots',
                type_='foreignkey',
            )
        except Exception:
            pass  # Constraint may not exist

        op.drop_column('game_hotspots', 'linked_scene_id')


def downgrade():
    op.add_column(
        'game_hotspots',
        sa.Column('linked_scene_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_game_hotspots_linked_scene_id_game_scenes',
        'game_hotspots',
        'game_scenes',
        ['linked_scene_id'],
        ['id'],
    )
    op.drop_column('game_hotspots', 'action')
