"""Add ad_last_seen_at to android_devices for sliding-window ad-session timeout.

Pre-existing semantics: `ad_session_started_at` was set on first ad detection
and never refreshed; the session-timeout check compared `now` against it. After
a long watching streak, the first poll without an ad would always exceed the
60s tolerance and immediately end the session — there was effectively zero
"between-ads" tolerance once a session was older than 60s.

Fix: keep `ad_session_started_at` as the start anchor (existing consumers in
api/v1/automation.py and workers/automation.py only check `is not None`) and
add `ad_last_seen_at`, refreshed on every detection, used as the sliding-window
timeout anchor.

Revision ID: 20260510_0001
Revises: 20260427_0002
Create Date: 2026-05-10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260510_0001"
down_revision = "20260427_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "android_devices",
        sa.Column("ad_last_seen_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("android_devices", "ad_last_seen_at")
