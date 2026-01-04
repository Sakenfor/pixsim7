"""Add hotspot scope and target definitions

Revision ID: 20260104_0006
Revises: 20260104_0005
Create Date: 2026-01-04

This migration:
1. Adds scope/target columns + optional world/scene refs
2. Backfills target from object_name and meta.rect2d
3. Drops object_name
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260104_0006'
down_revision = '20260104_0005'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('game_hotspots', sa.Column('scope', sa.String(length=32), nullable=True))
    op.add_column('game_hotspots', sa.Column('target', sa.JSON(), nullable=True))
    op.add_column('game_hotspots', sa.Column('world_id', sa.Integer(), nullable=True))
    op.add_column('game_hotspots', sa.Column('scene_id', sa.Integer(), nullable=True))

    op.create_foreign_key(
        'fk_game_hotspots_world_id_game_worlds',
        'game_hotspots',
        'game_worlds',
        ['world_id'],
        ['id'],
    )
    op.create_foreign_key(
        'fk_game_hotspots_scene_id_game_scenes',
        'game_hotspots',
        'game_scenes',
        ['scene_id'],
        ['id'],
    )

    op.alter_column('game_hotspots', 'location_id', nullable=True)

    op.execute("""
        UPDATE game_hotspots
        SET scope = 'location',
            target = jsonb_strip_nulls(
                jsonb_build_object(
                    'mesh',
                    CASE
                        WHEN object_name IS NOT NULL AND object_name <> ''
                        THEN jsonb_build_object('object_name', object_name)
                        ELSE NULL
                    END,
                    'rect2d',
                    CASE
                        WHEN meta IS NOT NULL AND meta::jsonb ? 'rect2d'
                        THEN meta::jsonb->'rect2d'
                        ELSE NULL
                    END
                )
            )
    """)

    op.alter_column('game_hotspots', 'scope', nullable=False)
    op.drop_column('game_hotspots', 'object_name')


def downgrade():
    op.add_column(
        'game_hotspots',
        sa.Column('object_name', sa.String(length=128), nullable=True),
    )
    op.execute("""
        UPDATE game_hotspots
        SET object_name = COALESCE(target::jsonb->'mesh'->>'object_name', '')
    """)

    op.drop_constraint(
        'fk_game_hotspots_scene_id_game_scenes',
        'game_hotspots',
        type_='foreignkey',
    )
    op.drop_constraint(
        'fk_game_hotspots_world_id_game_worlds',
        'game_hotspots',
        type_='foreignkey',
    )
    op.drop_column('game_hotspots', 'scene_id')
    op.drop_column('game_hotspots', 'world_id')
    op.drop_column('game_hotspots', 'target')
    op.drop_column('game_hotspots', 'scope')
