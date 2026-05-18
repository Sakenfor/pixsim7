"""chat_tabs.icon + chat_tabs.subtitle — agent-set tab identity

Adds two nullable columns to ``dev_meta.chat_tabs`` (plan
``plan-participant-liveness``, checkpoint ``agent-freeform-tab-identity``):

* ``icon``     — an ``@lib/icons`` IconName the agent picks freely via the
                  ``set_tab_identity`` MCP tool (constrained to the existing
                  icon set client-side, stored as a plain short string).
* ``subtitle`` — a secondary line rendered under the tab title in the slot
                  that otherwise shows the profile name.

Both are agent-driven and optional, so the columns are nullable with no
server_default and no backfill: existing tabs simply have no agent-set
identity until the agent sets one (the UI falls back to the profile label
/ default glyph). Never auto-copied from the plan or agent profile.

Revision ID: 20260518_0001
Revises: 20260517_0002
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa


revision = "20260518_0001"
down_revision = "20260517_0002"
branch_labels = None
depends_on = None

_SCHEMA = "dev_meta"
_TABLE = "chat_tabs"


def upgrade() -> None:
    op.add_column(
        _TABLE,
        sa.Column("icon", sa.String(length=50), nullable=True),
        schema=_SCHEMA,
    )
    op.add_column(
        _TABLE,
        sa.Column("subtitle", sa.String(length=255), nullable=True),
        schema=_SCHEMA,
    )


def downgrade() -> None:
    op.drop_column(_TABLE, "subtitle", schema=_SCHEMA)
    op.drop_column(_TABLE, "icon", schema=_SCHEMA)
