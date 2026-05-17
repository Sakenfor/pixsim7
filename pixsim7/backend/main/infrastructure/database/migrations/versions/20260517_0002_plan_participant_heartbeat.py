"""plan participant liveness — last_heartbeat_at

Adds ``dev_meta.plan_participants.last_heartbeat_at`` (plan
``plan-participant-liveness``, checkpoint ``liveness-signal``).

The column is a distinct liveness signal from ``last_seen_at``:
``last_seen_at`` advances only on real work logging, whereas
``last_heartbeat_at`` is additionally advanced by cheap pings
(agent-context fetch). Staleness / "is this agent still here?" is
derived from ``max(last_heartbeat_at, last_seen_at)`` vs a TTL — see
``api/v1/plans/helpers.py:participant_is_stale``.

Existing rows are backfilled from ``last_seen_at`` so no participant
spuriously appears stale immediately after deploy. ``server_default``
mirrors the sibling ``first_seen_at`` / ``last_seen_at`` columns; the
ORM always supplies a value via ``default_factory``.

Index ``ix_dev_meta_plan_participants_last_heartbeat_at`` matches the
SQLModel ``index=True`` naming so autogenerate stays quiet, and serves
the cross-plan active-agent roster (later checkpoint).

Revision ID: 20260517_0002
Revises: 20260517_0001
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa


revision = "20260517_0002"
down_revision = "20260517_0001"
branch_labels = None
depends_on = None

_SCHEMA = "dev_meta"
_TABLE = "plan_participants"
_COLUMN = "last_heartbeat_at"
_INDEX = "ix_dev_meta_plan_participants_last_heartbeat_at"


def upgrade() -> None:
    op.add_column(
        _TABLE,
        sa.Column(
            _COLUMN,
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        schema=_SCHEMA,
    )
    # Backfill so a working participant isn't instantly "stale" post-deploy.
    op.execute(
        f"UPDATE {_SCHEMA}.{_TABLE} SET {_COLUMN} = last_seen_at"
    )
    op.create_index(
        _INDEX,
        _TABLE,
        [_COLUMN],
        unique=False,
        schema=_SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(_INDEX, table_name=_TABLE, schema=_SCHEMA)
    op.drop_column(_TABLE, _COLUMN, schema=_SCHEMA)
