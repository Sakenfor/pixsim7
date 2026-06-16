"""chat_sessions.icon + chat_sessions.subtitle — resume-parity tab identity

Mirrors the agent-set identity columns already on ``dev_meta.chat_tabs``
(see ``20260518_0001``) onto ``dev_meta.chat_sessions`` so the identity
survives the tab being closed (which deletes the ChatTab row). The resume
picker and ``buildResumedTab`` read these so a reopened session shows the
same icon / subtitle it had while live (plan ``agent-freeform-tab-identity``
— resume parity).

Both nullable, no server_default, no backfill: existing sessions simply have
no identity until the agent sets one via ``set_tab_identity`` (the UI falls
back to the engine glyph / profile label).

Revision ID: 20260613_0001
Revises: 20260612_0001
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa


revision = "20260613_0001"
down_revision = "20260612_0001"
branch_labels = None
depends_on = None

_SCHEMA = "dev_meta"
_TABLE = "chat_sessions"


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
