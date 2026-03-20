"""Add entity_audit table for unified mutation tracking.

Revision ID: 20260321_0001
"""
from alembic import op
import sqlalchemy as sa

revision = "20260321_0001"
down_revision = "20260320_0002"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("entity_audit", schema=SCHEMA):
        return

    op.create_table(
        "entity_audit",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("domain", sa.String(32), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_id", sa.String(120), nullable=False, index=True),
        sa.Column("entity_label", sa.String(255), nullable=True),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("field", sa.String(64), nullable=True),
        sa.Column("old_value", sa.Text, nullable=True),
        sa.Column("new_value", sa.Text, nullable=True),
        sa.Column("actor", sa.String(120), nullable=False),
        sa.Column("commit_sha", sa.String(64), nullable=True),
        sa.Column("metadata", sa.JSON, nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_entity_audit_domain_ts",
        "entity_audit",
        ["domain", "timestamp"],
        schema=SCHEMA,
    )
    op.create_index(
        "idx_entity_audit_entity",
        "entity_audit",
        ["entity_type", "entity_id", "timestamp"],
        schema=SCHEMA,
    )
    op.create_index(
        "idx_entity_audit_actor_ts",
        "entity_audit",
        ["actor", "timestamp"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_table("entity_audit", schema=SCHEMA)
