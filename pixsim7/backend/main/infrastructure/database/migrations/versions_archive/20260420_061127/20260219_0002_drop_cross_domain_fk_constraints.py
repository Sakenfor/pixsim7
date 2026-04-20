"""Drop cross-domain FK constraints (Phase 2 schema decoupling).

Removes 10 foreign key constraints that cross the game/main domain boundary.
The columns and indexes are preserved — only the FK enforcement is removed,
turning them into soft references.

Revision ID: 20260219_0002
Revises: 20260219_0001
Create Date: 2026-02-19
"""
from alembic import op


# revision identifiers, used by Alembic
revision = "20260219_0002"
down_revision = "20260219_0001"
branch_labels = None
depends_on = None

# All 10 cross-domain FK constraints to drop.
# Format: (constraint_name, source_table, source_columns, target_table, target_columns)
CROSS_DOMAIN_FKS = [
    # npc_memory.py user_id fields -> users.id
    ("npc_conversation_memories_user_id_fkey", "npc_conversation_memories", ["user_id"], "users", ["id"]),
    ("npc_conversation_topics_user_id_fkey", "npc_conversation_topics", ["user_id"], "users", ["id"]),
    ("npc_relationship_milestones_user_id_fkey", "npc_relationship_milestones", ["user_id"], "users", ["id"]),
    ("npc_personality_evolution_user_id_fkey", "npc_personality_evolution", ["user_id"], "users", ["id"]),
    ("npc_dialogue_analytics_user_id_fkey", "npc_dialogue_analytics", ["user_id"], "users", ["id"]),
    # character.py -> prompt_versions / action_blocks
    ("character_usage_prompt_version_id_fkey", "character_usage", ["prompt_version_id"], "prompt_versions", ["id"]),
    ("character_usage_action_block_id_fkey", "character_usage", ["action_block_id"], "action_blocks", ["id"]),
    # sequence.py (clip_sequence_entries) -> assets domain
    ("clip_sequence_entries_clip_id_fkey", "clip_sequence_entries", ["clip_id"], "asset_clips", ["id"]),
    ("clip_sequence_entries_asset_id_fkey", "clip_sequence_entries", ["asset_id"], "assets", ["id"]),
    ("clip_sequence_entries_branch_id_fkey", "clip_sequence_entries", ["branch_id"], "asset_branches", ["id"]),
]


def upgrade() -> None:
    """Drop 10 cross-domain FK constraints (game -> main)."""
    for constraint_name, source_table, _src_cols, _tgt_table, _tgt_cols in CROSS_DOMAIN_FKS:
        op.drop_constraint(constraint_name, source_table, type_="foreignkey")


def downgrade() -> None:
    """Re-create 10 cross-domain FK constraints.

    WARNING: This may fail if referential integrity has been violated
    since the FKs were dropped. Ensure data consistency before downgrading.
    """
    for constraint_name, source_table, src_cols, tgt_table, tgt_cols in CROSS_DOMAIN_FKS:
        op.create_foreign_key(
            constraint_name,
            source_table,
            tgt_table,
            src_cols,
            tgt_cols,
        )
