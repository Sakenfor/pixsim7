"""Add composite index on entity_audit (domain, plan_id, timestamp).

Optimises the per-plan events query which now uses
  WHERE domain='plan' AND (entity_id = :id OR plan_id = :id)
  ORDER BY timestamp DESC

Revision ID: 20260401_0001
Revises: 20260331_0001
Create Date: 2026-04-01
"""
from alembic import op


revision = "20260401_0001"
down_revision = "20260331_0001"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
TABLE = "entity_audit"
INDEX_NAME = "idx_entity_audit_domain_plan_id_ts"


def upgrade() -> None:
    op.create_index(
        INDEX_NAME,
        TABLE,
        ["domain", "plan_id", "timestamp"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name=TABLE, schema=SCHEMA)
