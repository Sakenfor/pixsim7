"""Add hotspot_regions to game_scene_nodes.

Revision ID: 20260227_0001
Revises: 20260224_0002
Create Date: 2026-02-27

Adds a JSONB column to game_scene_nodes to store clickable rect2d overlay
regions for point-and-click adventure game interactions.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260227_0001'
down_revision = '20260224_0002'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'game_scene_nodes',
        sa.Column('hotspot_regions', postgresql.JSONB(), nullable=True),
    )


def downgrade():
    op.drop_column('game_scene_nodes', 'hotspot_regions')
