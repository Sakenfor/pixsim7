"""resource_grants — generalize provider_account_grants into a shared primitive

Replaces ``provider_account_grants`` (provider-slot-only) with a generic
``resource_grants`` table: one owner→recipient, scoped (JSON), capped, revocable
grant that backs any resource type. ``resource_type='provider_slots'`` is wired
today; ``bridge`` / ``review`` are reserved for the agent-profiles roadmap.

The old table was empty (no live grants), so this drops and recreates rather
than migrating data. Scope is a JSON blob keyed by a canonical ``scope_key``
(sha256) so the uniqueness constraint survives JSON scopes.

See plan ``agent-profiles-v1`` (bridge-delegation generalization) and the
"share provider generation slots" exploration.

Revision ID: 20260621_0003
Revises: 20260621_0002
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa


revision = "20260621_0003"
down_revision = "20260621_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the provider-specific predecessor (empty — no data migration).
    op.drop_index("ix_provider_account_grants_account_id", table_name="provider_account_grants")
    op.drop_index("ix_provider_account_grants_provider_id", table_name="provider_account_grants")
    op.drop_index("ix_provider_account_grants_recipient_user_id", table_name="provider_account_grants")
    op.drop_index("ix_provider_account_grants_owner_user_id", table_name="provider_account_grants")
    op.drop_table("provider_account_grants")

    op.create_table(
        "resource_grants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("recipient_user_id", sa.Integer(), nullable=False),
        sa.Column("resource_type", sa.String(length=40), nullable=False),
        sa.Column("scope", sa.JSON(), nullable=False),
        sa.Column("scope_key", sa.String(length=64), nullable=False),
        sa.Column("cap", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "owner_user_id", "recipient_user_id", "resource_type", "scope_key",
            name="uq_resource_grant_owner_recipient_scope",
        ),
    )
    op.create_index("ix_resource_grants_owner_user_id", "resource_grants", ["owner_user_id"])
    op.create_index("ix_resource_grants_recipient_user_id", "resource_grants", ["recipient_user_id"])
    op.create_index("ix_resource_grants_resource_type", "resource_grants", ["resource_type"])
    op.create_index("ix_resource_grants_scope_key", "resource_grants", ["scope_key"])


def downgrade() -> None:
    op.drop_index("ix_resource_grants_scope_key", table_name="resource_grants")
    op.drop_index("ix_resource_grants_resource_type", table_name="resource_grants")
    op.drop_index("ix_resource_grants_recipient_user_id", table_name="resource_grants")
    op.drop_index("ix_resource_grants_owner_user_id", table_name="resource_grants")
    op.drop_table("resource_grants")

    op.create_table(
        "provider_account_grants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("recipient_user_id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.String(length=50), nullable=False),
        sa.Column("model", sa.String(length=200), nullable=True),
        sa.Column("account_id", sa.Integer(), nullable=True),
        sa.Column("slot_limit", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["provider_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "owner_user_id", "recipient_user_id", "provider_id", "model", "account_id",
            name="uq_provider_account_grant_rule",
        ),
    )
    op.create_index("ix_provider_account_grants_owner_user_id", "provider_account_grants", ["owner_user_id"])
    op.create_index("ix_provider_account_grants_recipient_user_id", "provider_account_grants", ["recipient_user_id"])
    op.create_index("ix_provider_account_grants_provider_id", "provider_account_grants", ["provider_id"])
    op.create_index("ix_provider_account_grants_account_id", "provider_account_grants", ["account_id"])
