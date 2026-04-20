"""Compatibility shim for legacy revision 20260402_0004.

Some databases were migrated while a now-reverted migration with revision
``20260402_0004`` existed. Re-introducing the revision ID as a no-op keeps
those databases resolvable and allows normal upgrades to continue.

Revision ID: 20260402_0004
Revises: 20260401_0001
Create Date: 2026-04-03
"""
from __future__ import annotations


revision = "20260402_0004"
down_revision = "20260401_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Compatibility-only revision: intentionally no schema changes.
    pass


def downgrade() -> None:
    # Compatibility-only revision: intentionally no schema changes.
    pass
