"""Add plan review graph tables (rounds, nodes, links).

Revision ID: 20260321_0004
"""
from alembic import op
import sqlalchemy as sa

revision = "20260321_0004"
down_revision = "20260321_0003"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("plan_review_rounds", schema=SCHEMA):
        op.create_table(
            "plan_review_rounds",
            sa.Column("id", sa.Uuid, primary_key=True),
            sa.Column("plan_id", sa.String(length=120), nullable=False),
            sa.Column("round_number", sa.Integer(), nullable=False),
            sa.Column("review_revision", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("conclusion", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["plan_id"], [f"{SCHEMA}.plan_registry.id"]),
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_round_plan_round",
            "plan_review_rounds",
            ["plan_id", "round_number"],
            unique=True,
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_round_plan_status",
            "plan_review_rounds",
            ["plan_id", "status"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_rounds_plan_id",
            "plan_review_rounds",
            ["plan_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_rounds_round_number",
            "plan_review_rounds",
            ["round_number"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_rounds_review_revision",
            "plan_review_rounds",
            ["review_revision"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_rounds_status",
            "plan_review_rounds",
            ["status"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_rounds_created_at",
            "plan_review_rounds",
            ["created_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_rounds_updated_at",
            "plan_review_rounds",
            ["updated_at"],
            schema=SCHEMA,
        )

    if not inspector.has_table("plan_review_nodes", schema=SCHEMA):
        op.create_table(
            "plan_review_nodes",
            sa.Column("id", sa.Uuid, primary_key=True),
            sa.Column("plan_id", sa.String(length=120), nullable=False),
            sa.Column("round_id", sa.Uuid, nullable=False),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("author_role", sa.String(length=32), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("severity", sa.String(length=16), nullable=True),
            sa.Column("plan_anchor", sa.JSON(), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("created_by", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["plan_id"], [f"{SCHEMA}.plan_registry.id"]),
            sa.ForeignKeyConstraint(["round_id"], [f"{SCHEMA}.plan_review_rounds.id"]),
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_node_round_created",
            "plan_review_nodes",
            ["round_id", "created_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_node_plan_kind",
            "plan_review_nodes",
            ["plan_id", "kind"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_nodes_plan_id",
            "plan_review_nodes",
            ["plan_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_nodes_round_id",
            "plan_review_nodes",
            ["round_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_nodes_kind",
            "plan_review_nodes",
            ["kind"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_nodes_author_role",
            "plan_review_nodes",
            ["author_role"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_nodes_severity",
            "plan_review_nodes",
            ["severity"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_nodes_created_at",
            "plan_review_nodes",
            ["created_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_nodes_updated_at",
            "plan_review_nodes",
            ["updated_at"],
            schema=SCHEMA,
        )

    if not inspector.has_table("plan_review_links", schema=SCHEMA):
        op.create_table(
            "plan_review_links",
            sa.Column("id", sa.Uuid, primary_key=True),
            sa.Column("plan_id", sa.String(length=120), nullable=False),
            sa.Column("round_id", sa.Uuid, nullable=False),
            sa.Column("source_node_id", sa.Uuid, nullable=False),
            sa.Column("target_node_id", sa.Uuid, nullable=True),
            sa.Column("relation", sa.String(length=32), nullable=False),
            sa.Column("source_anchor", sa.JSON(), nullable=True),
            sa.Column("target_anchor", sa.JSON(), nullable=True),
            sa.Column("target_plan_anchor", sa.JSON(), nullable=True),
            sa.Column("quote", sa.Text(), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("created_by", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["plan_id"], [f"{SCHEMA}.plan_registry.id"]),
            sa.ForeignKeyConstraint(["round_id"], [f"{SCHEMA}.plan_review_rounds.id"]),
            sa.ForeignKeyConstraint(["source_node_id"], [f"{SCHEMA}.plan_review_nodes.id"]),
            sa.ForeignKeyConstraint(["target_node_id"], [f"{SCHEMA}.plan_review_nodes.id"]),
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_link_source_created",
            "plan_review_links",
            ["source_node_id", "created_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_link_target_created",
            "plan_review_links",
            ["target_node_id", "created_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_review_link_plan_round",
            "plan_review_links",
            ["plan_id", "round_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_links_plan_id",
            "plan_review_links",
            ["plan_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_links_round_id",
            "plan_review_links",
            ["round_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_links_source_node_id",
            "plan_review_links",
            ["source_node_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_links_target_node_id",
            "plan_review_links",
            ["target_node_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_links_relation",
            "plan_review_links",
            ["relation"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_review_links_created_at",
            "plan_review_links",
            ["created_at"],
            schema=SCHEMA,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("plan_review_links", schema=SCHEMA):
        op.drop_table("plan_review_links", schema=SCHEMA)
    if inspector.has_table("plan_review_nodes", schema=SCHEMA):
        op.drop_table("plan_review_nodes", schema=SCHEMA)
    if inspector.has_table("plan_review_rounds", schema=SCHEMA):
        op.drop_table("plan_review_rounds", schema=SCHEMA)
