"""fix_circular_dependencies_with_deferrable_constraints

Revision ID: d1d65acf1153
Revises: 1118genpromptconfig
Create Date: 2025-11-18 13:18:27.775745

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = 'd1d65acf1153'
down_revision = '1118genpromptconfig'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Fix circular foreign key dependencies by making them DEFERRABLE.

    Circular dependencies:
    1. GameScene.entry_node_id ↔ GameSceneNode.scene_id
    2. Asset.source_generation_id ↔ Generation.asset_id

    DEFERRABLE INITIALLY DEFERRED allows insertions in any order,
    with constraint validation postponed until transaction commit.
    """

    # ===== 1. GameScene ↔ GameSceneNode Cycle =====

    # Drop and recreate game_scenes.entry_node_id FK as deferrable
    op.execute("ALTER TABLE game_scenes DROP CONSTRAINT IF EXISTS game_scenes_entry_node_id_fkey")
    op.execute("""
        ALTER TABLE game_scenes
        ADD CONSTRAINT game_scenes_entry_node_id_fkey
        FOREIGN KEY (entry_node_id) REFERENCES game_scene_nodes(id)
        DEFERRABLE INITIALLY DEFERRED
    """)

    # Drop and recreate game_scene_nodes.scene_id FK as deferrable
    op.execute("ALTER TABLE game_scene_nodes DROP CONSTRAINT IF EXISTS game_scene_nodes_scene_id_fkey")
    op.execute("""
        ALTER TABLE game_scene_nodes
        ADD CONSTRAINT game_scene_nodes_scene_id_fkey
        FOREIGN KEY (scene_id) REFERENCES game_scenes(id)
        DEFERRABLE INITIALLY DEFERRED
    """)

    # ===== 2. Asset ↔ Generation Cycle =====

    # Drop and recreate assets.source_generation_id FK as deferrable
    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_source_generation_id_fkey")
    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS fk_assets_source_generation_id")
    op.execute("""
        ALTER TABLE assets
        ADD CONSTRAINT assets_source_generation_id_fkey
        FOREIGN KEY (source_generation_id) REFERENCES generations(id)
        DEFERRABLE INITIALLY DEFERRED
    """)

    # Drop and recreate generations.asset_id FK as deferrable
    op.execute("ALTER TABLE generations DROP CONSTRAINT IF EXISTS generations_asset_id_fkey")
    op.execute("""
        ALTER TABLE generations
        ADD CONSTRAINT generations_asset_id_fkey
        FOREIGN KEY (asset_id) REFERENCES assets(id)
        DEFERRABLE INITIALLY DEFERRED
    """)


def downgrade() -> None:
    """
    Revert deferrable constraints back to immediate constraints.

    ⚠️ WARNING: This may fail if there are pending circular insertions!
    Only run this if you're certain there are no transactions relying on deferred checks.
    """

    # ===== 1. GameScene ↔ GameSceneNode =====

    op.execute("ALTER TABLE game_scenes DROP CONSTRAINT IF EXISTS game_scenes_entry_node_id_fkey")
    op.execute("""
        ALTER TABLE game_scenes
        ADD CONSTRAINT game_scenes_entry_node_id_fkey
        FOREIGN KEY (entry_node_id) REFERENCES game_scene_nodes(id)
    """)

    op.execute("ALTER TABLE game_scene_nodes DROP CONSTRAINT IF EXISTS game_scene_nodes_scene_id_fkey")
    op.execute("""
        ALTER TABLE game_scene_nodes
        ADD CONSTRAINT game_scene_nodes_scene_id_fkey
        FOREIGN KEY (scene_id) REFERENCES game_scenes(id)
    """)

    # ===== 2. Asset ↔ Generation =====

    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_source_generation_id_fkey")
    op.execute("""
        ALTER TABLE assets
        ADD CONSTRAINT assets_source_generation_id_fkey
        FOREIGN KEY (source_generation_id) REFERENCES generations(id)
    """)

    op.execute("ALTER TABLE generations DROP CONSTRAINT IF EXISTS generations_asset_id_fkey")
    op.execute("""
        ALTER TABLE generations
        ADD CONSTRAINT generations_asset_id_fkey
        FOREIGN KEY (asset_id) REFERENCES assets(id)
    """)

