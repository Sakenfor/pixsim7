"""Link plans to documents — full refactor.

1. Add document_id FK to plan_registry
2. Create Document rows from existing plan data (copy shared fields verbatim)
3. Set document_id FK
4. Migrate plan_shares to document_shares
5. Drop shared columns from plan_registry (now on documents)
6. Drop plan_shares table (replaced by document_shares)

After this migration, plan_registry is a thin extension table:
plan-specific fields only (stage, priority, plan_type, target, checkpoints, etc.)
All shared fields (title, status, owner, summary, markdown, tags, etc.) live on documents.

Revision ID: 20260316_0010
Revises: 20260316_0009
Create Date: 2026-03-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260316_0010"
down_revision = "20260316_0009"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"

# Columns moving from plan_registry to documents
SHARED_COLUMNS = [
    "title", "status", "owner", "summary", "markdown",
    "user_id", "visibility", "tags", "revision",
]


def upgrade() -> None:
    # ── 1. Add document_id column ──────────────────────────────────
    op.add_column(
        "plan_registry",
        sa.Column("document_id", sa.String(120), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_plan_registry_document_id",
        "plan_registry",
        ["document_id"],
        unique=True,
        schema=SCHEMA,
    )

    conn = op.get_bind()

    # ── 2. Create Document rows from plan data ─────────────────────
    # Status/owner values are copied verbatim (no mapping).
    # For plan-type documents, Document.status = plan status.
    conn.execute(sa.text(f"""
        INSERT INTO {SCHEMA}.documents
            (id, doc_type, title, status, owner, summary, markdown,
             user_id, visibility, tags, extra, revision, created_at, updated_at)
        SELECT
            'plan:' || pr.id,
            'plan',
            pr.title,
            pr.status,
            pr.owner,
            pr.summary,
            pr.markdown,
            pr.user_id,
            pr.visibility,
            pr.tags,
            NULL,
            pr.revision,
            pr.created_at,
            pr.updated_at
        FROM {SCHEMA}.plan_registry pr
        WHERE NOT EXISTS (
            SELECT 1 FROM {SCHEMA}.documents d WHERE d.id = 'plan:' || pr.id
        )
    """))

    # ── 3. Set document_id FK ──────────────────────────────────────
    conn.execute(sa.text(f"""
        UPDATE {SCHEMA}.plan_registry
        SET document_id = 'plan:' || id
        WHERE document_id IS NULL
    """))

    # ── 4. Migrate plan_shares → document_shares ───────────────────
    conn.execute(sa.text(f"""
        INSERT INTO {SCHEMA}.document_shares
            (id, document_id, user_id, role, granted_by, created_at)
        SELECT
            ps.id,
            pr.document_id,
            ps.user_id,
            ps.role,
            ps.granted_by,
            ps.created_at
        FROM {SCHEMA}.plan_shares ps
        JOIN {SCHEMA}.plan_registry pr ON pr.id = ps.plan_id
        WHERE pr.document_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM {SCHEMA}.document_shares ds
              WHERE ds.document_id = pr.document_id AND ds.user_id = ps.user_id
          )
    """))

    # ── 5. Add FK constraint (now that all rows have document_id) ──
    op.create_foreign_key(
        "fk_plan_registry_document_id",
        "plan_registry",
        "documents",
        ["document_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="CASCADE",
    )

    # ── 6. Make document_id NOT NULL ───────────────────────────────
    op.alter_column(
        "plan_registry",
        "document_id",
        nullable=False,
        schema=SCHEMA,
    )

    # ── 7. Drop shared columns from plan_registry ──────────────────
    # PostgreSQL automatically drops indexes referencing dropped columns.
    # The composite index idx_plan_registry_scope_user (task_scope, user_id)
    # will be dropped when user_id is removed; we recreate for task_scope alone.
    for col in SHARED_COLUMNS:
        op.drop_column("plan_registry", col, schema=SCHEMA)

    # Recreate task_scope index (composite was dropped with user_id)
    op.create_index(
        "idx_plan_registry_task_scope",
        "plan_registry",
        ["task_scope"],
        schema=SCHEMA,
    )

    # ── 8. Drop plan_shares table (replaced by document_shares) ────
    op.drop_index(
        "idx_plan_shares_plan_user",
        table_name="plan_shares",
        schema=SCHEMA,
    )
    op.drop_table("plan_shares", schema=SCHEMA)


def downgrade() -> None:
    """Revert: restore shared columns to plan_registry, recreate plan_shares."""
    # Recreate plan_shares
    op.create_table(
        "plan_shares",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("plan_id", sa.String(120),
                  sa.ForeignKey("dev_meta.plan_registry.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="viewer"),
        sa.Column("granted_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        schema=SCHEMA,
    )
    op.create_index(
        "idx_plan_shares_plan_user",
        "plan_shares",
        ["plan_id", "user_id"],
        unique=True,
        schema=SCHEMA,
    )

    # Drop task_scope-only index
    op.drop_index("idx_plan_registry_task_scope", table_name="plan_registry", schema=SCHEMA)

    # Re-add shared columns with defaults
    op.add_column("plan_registry", sa.Column("title", sa.String(255), nullable=False, server_default=""), schema=SCHEMA)
    op.add_column("plan_registry", sa.Column("status", sa.String(32), nullable=False, server_default="active"), schema=SCHEMA)
    op.add_column("plan_registry", sa.Column("owner", sa.String(120), nullable=False, server_default="unassigned"), schema=SCHEMA)
    op.add_column("plan_registry", sa.Column("summary", sa.Text(), nullable=True), schema=SCHEMA)
    op.add_column("plan_registry", sa.Column("markdown", sa.Text(), nullable=True), schema=SCHEMA)
    op.add_column("plan_registry", sa.Column("user_id", sa.Integer(), nullable=True), schema=SCHEMA)
    op.add_column("plan_registry", sa.Column("visibility", sa.String(32), nullable=False, server_default="public"), schema=SCHEMA)
    op.add_column("plan_registry", sa.Column("tags", sa.JSON(), nullable=True), schema=SCHEMA)
    op.add_column("plan_registry", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"), schema=SCHEMA)

    # Copy data back from documents
    conn = op.get_bind()
    conn.execute(sa.text(f"""
        UPDATE {SCHEMA}.plan_registry pr
        SET title = d.title, status = d.status, owner = d.owner,
            summary = d.summary, markdown = d.markdown, user_id = d.user_id,
            visibility = d.visibility, tags = d.tags, revision = d.revision
        FROM {SCHEMA}.documents d
        WHERE d.id = pr.document_id
    """))

    # Recreate composite index
    op.create_index(
        "idx_plan_registry_scope_user",
        "plan_registry",
        ["task_scope", "user_id"],
        schema=SCHEMA,
    )

    # Drop document_id
    op.drop_constraint("fk_plan_registry_document_id", "plan_registry", schema=SCHEMA)
    op.drop_index("idx_plan_registry_document_id", table_name="plan_registry", schema=SCHEMA)
    op.drop_column("plan_registry", "document_id", schema=SCHEMA)
