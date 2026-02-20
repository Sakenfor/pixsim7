"""Game schema baseline stamp.

No DDL — game tables already exist from the main migration chain.
This revision serves as the starting point for the independent game
migration chain. Stamp with:

    alembic -c alembic_game.ini stamp game_baseline

Revision ID: game_baseline
Revises:
Create Date: 2026-02-19
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic
revision = "game_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Baseline stamp — no DDL changes."""
    pass


def downgrade() -> None:
    """Baseline stamp — nothing to revert."""
    pass
