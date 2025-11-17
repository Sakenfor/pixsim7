"""Add generated_action_blocks table for cached action prompts."""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251116_1905_add_generated_action_blocks"
down_revision = "20251116_1600_add_game_worlds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "generated_action_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("block_id", sa.String(length=128), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="single_state"),
        sa.Column("block_json", sa.JSON(), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=True),
        sa.Column("previous_block_id", sa.String(length=128), nullable=True),
        sa.Column("reference_asset_id", sa.Integer(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("block_id", name="uq_generated_action_blocks_block_id"),
    )
    op.create_index(
        "ix_generated_action_blocks_block_id",
        "generated_action_blocks",
        ["block_id"],
        unique=False,
    )
    op.create_index(
        "ix_generated_action_blocks_previous_block_id",
        "generated_action_blocks",
        ["previous_block_id"],
        unique=False,
    )
    op.create_index(
        "ix_generated_action_blocks_reference_asset_id",
        "generated_action_blocks",
        ["reference_asset_id"],
        unique=False,
    )
    op.create_index(
        "ix_generated_action_blocks_created_at",
        "generated_action_blocks",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_generated_action_blocks_created_at", table_name="generated_action_blocks")
    op.drop_index("ix_generated_action_blocks_reference_asset_id", table_name="generated_action_blocks")
    op.drop_index("ix_generated_action_blocks_previous_block_id", table_name="generated_action_blocks")
    op.drop_index("ix_generated_action_blocks_block_id", table_name="generated_action_blocks")
    op.drop_table("generated_action_blocks")
