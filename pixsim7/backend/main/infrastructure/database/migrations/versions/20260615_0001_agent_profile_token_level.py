"""agent_profiles.token_level — per-profile privilege level for minted tokens

Adds ``dev_meta.agent_profiles.token_level`` so a profile can opt into minting
*admin* session tokens instead of the default *basic* agent token. The actual
elevation is gated at mint time on the caller being an admin (see
``mint_profile_token``); this column just records the chosen default.

Non-null with a ``basic`` server_default so every existing profile keeps the
current (safe) behavior with no backfill.

Revision ID: 20260615_0001
Revises: 20260614_0001
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa


revision = "20260615_0001"
down_revision = "20260614_0001"
branch_labels = None
depends_on = None

_SCHEMA = "dev_meta"
_TABLE = "agent_profiles"


def upgrade() -> None:
    op.add_column(
        _TABLE,
        sa.Column(
            "token_level",
            sa.String(length=16),
            nullable=False,
            server_default="basic",
        ),
        schema=_SCHEMA,
    )


def downgrade() -> None:
    op.drop_column(_TABLE, "token_level", schema=_SCHEMA)
