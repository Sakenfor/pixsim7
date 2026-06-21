"""provider_account_grants — targeted, capped sharing of generation slots

Lets an account owner share generation slots with one named recipient as
stackable rules: ``(provider, model?, slots)``, optionally pinned to a single
account. Complements the all-or-nothing ``is_private=False`` public share.

* provider_id (required) — which provider's slots are shared
* model (optional) — a specific model; NULL = all models
* account_id (optional) — pin to one account; NULL = pool across the owner's
  accounts for the provider

A live rule (``revoked_at IS NULL``) widens visibility of the owner's matching
accounts to the recipient; the per-rule concurrency cap is enforced at
selection time.

No data backfill (no existing grants).

See chat exploration "share provider generation slots".

Revision ID: 20260621_0001
Revises: 20260619_0001
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa


revision = "20260621_0001"
down_revision = "20260619_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["provider_accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "owner_user_id", "recipient_user_id", "provider_id", "model", "account_id",
            name="uq_provider_account_grant_rule",
        ),
    )
    op.create_index(
        "ix_provider_account_grants_owner_user_id",
        "provider_account_grants",
        ["owner_user_id"],
    )
    op.create_index(
        "ix_provider_account_grants_recipient_user_id",
        "provider_account_grants",
        ["recipient_user_id"],
    )
    op.create_index(
        "ix_provider_account_grants_provider_id",
        "provider_account_grants",
        ["provider_id"],
    )
    op.create_index(
        "ix_provider_account_grants_account_id",
        "provider_account_grants",
        ["account_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_provider_account_grants_account_id",
        table_name="provider_account_grants",
    )
    op.drop_index(
        "ix_provider_account_grants_provider_id",
        table_name="provider_account_grants",
    )
    op.drop_index(
        "ix_provider_account_grants_recipient_user_id",
        table_name="provider_account_grants",
    )
    op.drop_index(
        "ix_provider_account_grants_owner_user_id",
        table_name="provider_account_grants",
    )
    op.drop_table("provider_account_grants")
