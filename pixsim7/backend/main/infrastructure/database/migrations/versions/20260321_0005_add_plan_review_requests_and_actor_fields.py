"""Add plan review requests and actor attribution fields.

Revision ID: 20260321_0005
"""

from alembic import op
import sqlalchemy as sa


revision = "20260321_0005"
down_revision = "20260321_0004"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def _columns(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {c["name"] for c in inspector.get_columns(table_name, schema=SCHEMA)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("plan_review_rounds", schema=SCHEMA):
        cols = _columns(inspector, "plan_review_rounds")
        if "actor_principal_type" not in cols:
            op.add_column(
                "plan_review_rounds",
                sa.Column("actor_principal_type", sa.String(length=16), nullable=True),
                schema=SCHEMA,
            )
        if "actor_agent_id" not in cols:
            op.add_column(
                "plan_review_rounds",
                sa.Column("actor_agent_id", sa.String(length=120), nullable=True),
                schema=SCHEMA,
            )
        if "actor_run_id" not in cols:
            op.add_column(
                "plan_review_rounds",
                sa.Column("actor_run_id", sa.String(length=120), nullable=True),
                schema=SCHEMA,
            )
        if "actor_user_id" not in cols:
            op.add_column(
                "plan_review_rounds",
                sa.Column("actor_user_id", sa.Integer(), nullable=True),
                schema=SCHEMA,
            )

    if inspector.has_table("plan_review_nodes", schema=SCHEMA):
        cols = _columns(inspector, "plan_review_nodes")
        if "actor_principal_type" not in cols:
            op.add_column(
                "plan_review_nodes",
                sa.Column("actor_principal_type", sa.String(length=16), nullable=True),
                schema=SCHEMA,
            )
        if "actor_agent_id" not in cols:
            op.add_column(
                "plan_review_nodes",
                sa.Column("actor_agent_id", sa.String(length=120), nullable=True),
                schema=SCHEMA,
            )
        if "actor_run_id" not in cols:
            op.add_column(
                "plan_review_nodes",
                sa.Column("actor_run_id", sa.String(length=120), nullable=True),
                schema=SCHEMA,
            )
        if "actor_user_id" not in cols:
            op.add_column(
                "plan_review_nodes",
                sa.Column("actor_user_id", sa.Integer(), nullable=True),
                schema=SCHEMA,
            )

    if not inspector.has_table("plan_review_requests", schema=SCHEMA):
        op.create_table(
            "plan_review_requests",
            sa.Column("id", sa.Uuid, primary_key=True),
            sa.Column("plan_id", sa.String(length=120), nullable=False),
            sa.Column("round_id", sa.Uuid, nullable=True),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("target_agent_id", sa.String(length=120), nullable=True),
            sa.Column("target_agent_type", sa.String(length=64), nullable=True),
            sa.Column("requested_by", sa.String(length=120), nullable=True),
            sa.Column("requested_by_principal_type", sa.String(length=16), nullable=True),
            sa.Column("requested_by_agent_id", sa.String(length=120), nullable=True),
            sa.Column("requested_by_run_id", sa.String(length=120), nullable=True),
            sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("resolution_note", sa.Text(), nullable=True),
            sa.Column("resolved_node_id", sa.Uuid, nullable=True),
            sa.Column("resolved_by", sa.String(length=120), nullable=True),
            sa.Column("resolved_by_principal_type", sa.String(length=16), nullable=True),
            sa.Column("resolved_by_agent_id", sa.String(length=120), nullable=True),
            sa.Column("resolved_by_run_id", sa.String(length=120), nullable=True),
            sa.Column("resolved_by_user_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["plan_id"], [f"{SCHEMA}.plan_registry.id"]),
            sa.ForeignKeyConstraint(["round_id"], [f"{SCHEMA}.plan_review_rounds.id"]),
            sa.ForeignKeyConstraint(["resolved_node_id"], [f"{SCHEMA}.plan_review_nodes.id"]),
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_request_plan_status",
            "plan_review_requests",
            ["plan_id", "status"],
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_request_plan_created",
            "plan_review_requests",
            ["plan_id", "created_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_requests_plan_id",
            "plan_review_requests",
            ["plan_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_requests_round_id",
            "plan_review_requests",
            ["round_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_requests_status",
            "plan_review_requests",
            ["status"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_requests_resolved_node_id",
            "plan_review_requests",
            ["resolved_node_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_requests_created_at",
            "plan_review_requests",
            ["created_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_requests_updated_at",
            "plan_review_requests",
            ["updated_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_requests_resolved_at",
            "plan_review_requests",
            ["resolved_at"],
            schema=SCHEMA,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("plan_review_requests", schema=SCHEMA):
        op.drop_table("plan_review_requests", schema=SCHEMA)

    if inspector.has_table("plan_review_nodes", schema=SCHEMA):
        cols = _columns(inspector, "plan_review_nodes")
        if "actor_user_id" in cols:
            op.drop_column("plan_review_nodes", "actor_user_id", schema=SCHEMA)
        if "actor_run_id" in cols:
            op.drop_column("plan_review_nodes", "actor_run_id", schema=SCHEMA)
        if "actor_agent_id" in cols:
            op.drop_column("plan_review_nodes", "actor_agent_id", schema=SCHEMA)
        if "actor_principal_type" in cols:
            op.drop_column("plan_review_nodes", "actor_principal_type", schema=SCHEMA)

    if inspector.has_table("plan_review_rounds", schema=SCHEMA):
        cols = _columns(inspector, "plan_review_rounds")
        if "actor_user_id" in cols:
            op.drop_column("plan_review_rounds", "actor_user_id", schema=SCHEMA)
        if "actor_run_id" in cols:
            op.drop_column("plan_review_rounds", "actor_run_id", schema=SCHEMA)
        if "actor_agent_id" in cols:
            op.drop_column("plan_review_rounds", "actor_agent_id", schema=SCHEMA)
        if "actor_principal_type" in cols:
            op.drop_column("plan_review_rounds", "actor_principal_type", schema=SCHEMA)
