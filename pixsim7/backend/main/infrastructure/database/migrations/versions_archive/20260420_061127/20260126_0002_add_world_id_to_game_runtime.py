"""
Revision ID: 20260126_0002
Revises: 20260126_0001
Create Date: 2026-01-26

Add world_id to runtime game entities for world scoping.
"""
from alembic import op
import sqlalchemy as sa


revision = "20260126_0002"
down_revision = "20260126_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("game_scenes", sa.Column("world_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_game_scenes_world_id",
        "game_scenes",
        "game_worlds",
        ["world_id"],
        ["id"],
    )
    op.create_index(op.f("ix_game_scenes_world_id"), "game_scenes", ["world_id"], unique=False)

    op.add_column("game_locations", sa.Column("world_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_game_locations_world_id",
        "game_locations",
        "game_worlds",
        ["world_id"],
        ["id"],
    )
    op.create_index(op.f("ix_game_locations_world_id"), "game_locations", ["world_id"], unique=False)

    op.add_column("game_npcs", sa.Column("world_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_game_npcs_world_id",
        "game_npcs",
        "game_worlds",
        ["world_id"],
        ["id"],
    )
    op.create_index(op.f("ix_game_npcs_world_id"), "game_npcs", ["world_id"], unique=False)

    op.add_column("game_items", sa.Column("world_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_game_items_world_id",
        "game_items",
        "game_worlds",
        ["world_id"],
        ["id"],
    )
    op.create_index(op.f("ix_game_items_world_id"), "game_items", ["world_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_game_items_world_id"), table_name="game_items")
    op.drop_constraint("fk_game_items_world_id", "game_items", type_="foreignkey")
    op.drop_column("game_items", "world_id")

    op.drop_index(op.f("ix_game_npcs_world_id"), table_name="game_npcs")
    op.drop_constraint("fk_game_npcs_world_id", "game_npcs", type_="foreignkey")
    op.drop_column("game_npcs", "world_id")

    op.drop_index(op.f("ix_game_locations_world_id"), table_name="game_locations")
    op.drop_constraint("fk_game_locations_world_id", "game_locations", type_="foreignkey")
    op.drop_column("game_locations", "world_id")

    op.drop_index(op.f("ix_game_scenes_world_id"), table_name="game_scenes")
    op.drop_constraint("fk_game_scenes_world_id", "game_scenes", type_="foreignkey")
    op.drop_column("game_scenes", "world_id")
