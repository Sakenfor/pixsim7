"""Rename bridge_instances.agent_id to bridge_client_id.

The column was misnamed — it holds the bridge's client identity
(e.g. "shared-40de2327"), not an agent profile ID. Bridges are shared
dispatchers, not 1:1 with agent profiles.

Revision ID: 20260326_0001
Revises: 20260325_0002
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260326_0001"
down_revision = "20260325_0002"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
TABLE = "bridge_instances"


def upgrade() -> None:
    # Rename column
    op.alter_column(
        TABLE,
        "agent_id",
        new_column_name="bridge_client_id",
        schema=SCHEMA,
    )
    # Rename index to match
    op.drop_index("idx_bridge_instances_agent_id", table_name=TABLE, schema=SCHEMA)
    op.create_index(
        "idx_bridge_instances_bridge_client_id",
        TABLE,
        ["bridge_client_id"],
        unique=True,
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("idx_bridge_instances_bridge_client_id", table_name=TABLE, schema=SCHEMA)
    op.create_index(
        "idx_bridge_instances_agent_id",
        TABLE,
        ["bridge_client_id"],
        unique=True,
        schema=SCHEMA,
    )
    op.alter_column(
        TABLE,
        "bridge_client_id",
        new_column_name="agent_id",
        schema=SCHEMA,
    )
