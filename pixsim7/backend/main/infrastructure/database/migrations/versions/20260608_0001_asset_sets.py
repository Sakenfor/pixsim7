"""asset_set + asset_set_member — backend-native asset collections

Replaces the localStorage-only ``useAssetSetStore`` with server-persisted
sets so they can drive server-side queries (relocation include/exclude,
gallery filter-by-set, smart-set resolution).

``asset_set`` is user-owned (ASSET_SET_POLICY); ``kind`` is manual|smart.
Manual sets hold explicit members in ``asset_set_member`` (position-ordered);
smart sets carry a saved ``filters`` JSON blob and no member rows.

No data backfill — there are no existing backend rows, and the old
localStorage sets are intentionally not migrated (no existing users).

Both tables live in the default schema alongside ``assets`` / ``tag``.

See plan ``asset-sets-backend`` (checkpoint s1).

Revision ID: 20260608_0001
Revises: 20260604_0002
Create Date: 2026-06-08
"""
from alembic import op
import sqlalchemy as sa


revision = "20260608_0001"
down_revision = "20260604_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset_set",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="manual"),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("filters", sa.JSON(), nullable=True),
        sa.Column("max_results", sa.Integer(), nullable=True),
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_asset_set_user_id", "asset_set", ["user_id"])
    op.create_index("ix_asset_set_kind", "asset_set", ["kind"])
    op.create_index("ix_asset_set_is_shared", "asset_set", ["is_shared"])
    op.create_index("ix_asset_set_created_at", "asset_set", ["created_at"])

    op.create_table(
        "asset_set_member",
        sa.Column("set_id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["set_id"], ["asset_set.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("set_id", "asset_id"),
    )
    op.create_index("ix_asset_set_member_set_id", "asset_set_member", ["set_id"])
    op.create_index("ix_asset_set_member_asset_id", "asset_set_member", ["asset_id"])
    op.create_index("ix_asset_set_member_position", "asset_set_member", ["position"])


def downgrade() -> None:
    op.drop_index("ix_asset_set_member_position", table_name="asset_set_member")
    op.drop_index("ix_asset_set_member_asset_id", table_name="asset_set_member")
    op.drop_index("ix_asset_set_member_set_id", table_name="asset_set_member")
    op.drop_table("asset_set_member")

    op.drop_index("ix_asset_set_created_at", table_name="asset_set")
    op.drop_index("ix_asset_set_is_shared", table_name="asset_set")
    op.drop_index("ix_asset_set_kind", table_name="asset_set")
    op.drop_index("ix_asset_set_user_id", table_name="asset_set")
    op.drop_table("asset_set")
