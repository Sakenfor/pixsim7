"""Add plan participants ledger table.

Revision ID: 20260321_0006
"""

from alembic import op
import sqlalchemy as sa


revision = "20260321_0006"
down_revision = "20260321_0005"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("plan_participants", schema=SCHEMA):
        op.create_table(
            "plan_participants",
            sa.Column("id", sa.Uuid, primary_key=True),
            sa.Column("plan_id", sa.String(length=120), nullable=False),
            sa.Column("role", sa.String(length=32), nullable=False),
            sa.Column("principal_type", sa.String(length=16), nullable=True),
            sa.Column("agent_id", sa.String(length=120), nullable=True),
            sa.Column("agent_type", sa.String(length=64), nullable=True),
            sa.Column("profile_id", sa.String(length=120), nullable=True),
            sa.Column("run_id", sa.String(length=120), nullable=True),
            sa.Column("session_id", sa.String(length=120), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=True),
            sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("touches", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("last_action", sa.String(length=64), nullable=True),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["plan_id"], [f"{SCHEMA}.plan_registry.id"]),
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_participant_plan_role_last_seen",
            "plan_participants",
            ["plan_id", "role", "last_seen_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "idx_plan_participant_agent_last_seen",
            "plan_participants",
            ["agent_id", "last_seen_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_participants_plan_id",
            "plan_participants",
            ["plan_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_participants_role",
            "plan_participants",
            ["role"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_participants_agent_id",
            "plan_participants",
            ["agent_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_participants_profile_id",
            "plan_participants",
            ["profile_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_participants_run_id",
            "plan_participants",
            ["run_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_participants_session_id",
            "plan_participants",
            ["session_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_participants_user_id",
            "plan_participants",
            ["user_id"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_participants_first_seen_at",
            "plan_participants",
            ["first_seen_at"],
            schema=SCHEMA,
        )
        op.create_index(
            "ix_dev_meta_plan_participants_last_seen_at",
            "plan_participants",
            ["last_seen_at"],
            schema=SCHEMA,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("plan_participants", schema=SCHEMA):
        op.drop_table("plan_participants", schema=SCHEMA)

