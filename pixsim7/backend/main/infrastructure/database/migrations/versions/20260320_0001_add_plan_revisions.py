"""Add immutable plan_revisions history table.

Revision ID: 20260320_0001
Revises: 20260319_0002
Create Date: 2026-03-20
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

import sqlalchemy as sa
from alembic import op


revision = "20260320_0001"
down_revision = "20260319_0006"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"


def _snapshot_ts(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("plan_revisions", schema=SCHEMA):
        return

    op.create_table(
        "plan_revisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.String(length=120), nullable=False),
        sa.Column("document_id", sa.String(length=120), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False, server_default="snapshot"),
        sa.Column("actor", sa.String(length=120), nullable=True),
        sa.Column("commit_sha", sa.String(length=64), nullable=True),
        sa.Column("changed_fields", sa.JSON(), nullable=True),
        sa.Column("restore_from_revision", sa.Integer(), nullable=True),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            [f"{SCHEMA}.plan_registry.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            [f"{SCHEMA}.documents.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema=SCHEMA,
    )

    op.create_index(
        "ix_plan_revisions_plan_id",
        "plan_revisions",
        ["plan_id"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_index(
        "ix_plan_revisions_revision",
        "plan_revisions",
        ["revision"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_index(
        "ix_plan_revisions_created_at",
        "plan_revisions",
        ["created_at"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_index(
        "idx_plan_revision_plan_rev",
        "plan_revisions",
        ["plan_id", "revision"],
        unique=True,
        schema=SCHEMA,
    )
    op.create_index(
        "idx_plan_revision_plan_created",
        "plan_revisions",
        ["plan_id", "created_at"],
        unique=False,
        schema=SCHEMA,
    )

    docs = sa.table(
        "documents",
        sa.column("id"),
        sa.column("doc_type"),
        sa.column("title"),
        sa.column("status"),
        sa.column("owner"),
        sa.column("summary"),
        sa.column("markdown"),
        sa.column("user_id"),
        sa.column("visibility"),
        sa.column("namespace"),
        sa.column("tags"),
        sa.column("extra"),
        sa.column("revision"),
        sa.column("created_at"),
        sa.column("updated_at"),
        schema=SCHEMA,
    )
    plans = sa.table(
        "plan_registry",
        sa.column("id"),
        sa.column("document_id"),
        sa.column("parent_id"),
        sa.column("stage"),
        sa.column("priority"),
        sa.column("scope"),
        sa.column("task_scope"),
        sa.column("plan_type"),
        sa.column("target"),
        sa.column("checkpoints"),
        sa.column("plan_path"),
        sa.column("code_paths"),
        sa.column("companions"),
        sa.column("handoffs"),
        sa.column("depends_on"),
        sa.column("manifest_hash"),
        sa.column("last_synced_at"),
        sa.column("created_at"),
        sa.column("updated_at"),
        schema=SCHEMA,
    )
    revisions = sa.Table(
        "plan_revisions",
        sa.MetaData(),
        sa.Column("id", sa.Uuid()),
        sa.Column("plan_id", sa.String(length=120)),
        sa.Column("document_id", sa.String(length=120)),
        sa.Column("revision", sa.Integer()),
        sa.Column("event_type", sa.String(length=64)),
        sa.Column("actor", sa.String(length=120)),
        sa.Column("commit_sha", sa.String(length=64)),
        sa.Column("changed_fields", sa.JSON()),
        sa.Column("restore_from_revision", sa.Integer()),
        sa.Column("snapshot", sa.JSON()),
        sa.Column("created_at", sa.DateTime()),
        schema=SCHEMA,
    )

    rows = bind.execute(
        sa.select(
            plans.c.id.label("plan_id"),
            plans.c.document_id,
            plans.c.parent_id,
            plans.c.stage,
            plans.c.priority,
            plans.c.scope,
            plans.c.task_scope,
            plans.c.plan_type,
            plans.c.target,
            plans.c.checkpoints,
            plans.c.plan_path,
            plans.c.code_paths,
            plans.c.companions,
            plans.c.handoffs,
            plans.c.depends_on,
            plans.c.manifest_hash,
            plans.c.last_synced_at,
            plans.c.created_at.label("plan_created_at"),
            plans.c.updated_at.label("plan_updated_at"),
            docs.c.id.label("doc_id"),
            docs.c.doc_type,
            docs.c.title,
            docs.c.status,
            docs.c.owner,
            docs.c.summary,
            docs.c.markdown,
            docs.c.user_id,
            docs.c.visibility,
            docs.c.namespace,
            docs.c.tags,
            docs.c.extra,
            docs.c.revision.label("doc_revision"),
            docs.c.created_at.label("doc_created_at"),
            docs.c.updated_at.label("doc_updated_at"),
        ).select_from(plans.join(docs, plans.c.document_id == docs.c.id))
    ).mappings().all()

    now = datetime.utcnow()
    for row in rows:
        created_at = (
            row["plan_updated_at"]
            or row["doc_updated_at"]
            or row["plan_created_at"]
            or row["doc_created_at"]
            or now
        )
        snapshot = {
            "doc": {
                "id": row["doc_id"],
                "doc_type": row["doc_type"],
                "title": row["title"],
                "status": row["status"],
                "owner": row["owner"],
                "summary": row["summary"],
                "markdown": row["markdown"],
                "user_id": row["user_id"],
                "visibility": row["visibility"],
                "namespace": row["namespace"],
                "tags": list(row["tags"] or []),
                "extra": row["extra"],
                "revision": row["doc_revision"],
                "created_at": _snapshot_ts(row["doc_created_at"]),
                "updated_at": _snapshot_ts(row["doc_updated_at"]),
            },
            "plan": {
                "id": row["plan_id"],
                "document_id": row["document_id"],
                "parent_id": row["parent_id"],
                "stage": row["stage"],
                "priority": row["priority"],
                "scope": row["scope"],
                "task_scope": row["task_scope"],
                "plan_type": row["plan_type"],
                "target": row["target"],
                "checkpoints": row["checkpoints"],
                "plan_path": row["plan_path"],
                "code_paths": list(row["code_paths"] or []),
                "companions": list(row["companions"] or []),
                "handoffs": list(row["handoffs"] or []),
                "depends_on": list(row["depends_on"] or []),
                "manifest_hash": row["manifest_hash"],
                "last_synced_at": _snapshot_ts(row["last_synced_at"]),
                "created_at": _snapshot_ts(row["plan_created_at"]),
                "updated_at": _snapshot_ts(row["plan_updated_at"]),
            },
        }
        bind.execute(
            sa.insert(revisions).values(
                id=uuid4(),
                plan_id=row["plan_id"],
                document_id=row["document_id"],
                revision=1,
                event_type="snapshot",
                actor="system:migration",
                commit_sha=None,
                changed_fields=["baseline"],
                restore_from_revision=None,
                snapshot=snapshot,
                created_at=created_at,
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("plan_revisions", schema=SCHEMA):
        return

    op.drop_index(
        "idx_plan_revision_plan_created",
        table_name="plan_revisions",
        schema=SCHEMA,
    )
    op.drop_index(
        "idx_plan_revision_plan_rev",
        table_name="plan_revisions",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_plan_revisions_created_at",
        table_name="plan_revisions",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_plan_revisions_revision",
        table_name="plan_revisions",
        schema=SCHEMA,
    )
    op.drop_index(
        "ix_plan_revisions_plan_id",
        table_name="plan_revisions",
        schema=SCHEMA,
    )
    op.drop_table("plan_revisions", schema=SCHEMA)
