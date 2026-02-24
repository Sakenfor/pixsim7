"""Optimize prompt block tag queries with JSONB + indexes.

Revision ID: 20260224_0002
Revises: 20260224_0001
Create Date: 2026-02-24

Ensures prompt block `tags` is stored as JSONB (legacy/current table names),
adds a general-purpose GIN index, and adds targeted expression indexes for
hot tag keys used by template rolling and matrix/coverage queries.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "20260224_0002"
down_revision = "20260224_0001"
branch_labels = None
depends_on = None


def _resolve_block_table() -> str | None:
    conn = op.get_bind()
    tables = set(inspect(conn).get_table_names())
    if "prompt_blocks" in tables:
        return "prompt_blocks"
    if "action_blocks" in tables:
        return "action_blocks"
    return None


def _index_exists(index_name: str) -> bool:
    conn = op.get_bind()
    row = conn.execute(
        text(
            """
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND indexname = :index_name
            LIMIT 1
            """
        ),
        {"index_name": index_name},
    ).first()
    return row is not None


def _column_is_jsonb(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    cols = inspect(conn).get_columns(table_name)
    for col in cols:
        if col.get("name") != column_name:
            continue
        return isinstance(col.get("type"), postgresql.JSONB)
    return False


def _create_index_if_missing(name: str, sql: str) -> None:
    if _index_exists(name):
        return
    op.execute(sql)


def upgrade() -> None:
    table_name = _resolve_block_table()
    if not table_name:
        return

    # Ensure tags is JSONB for fast containment/GIN queries.
    if not _column_is_jsonb(table_name, "tags"):
        op.alter_column(
            table_name,
            "tags",
            type_=postgresql.JSONB(astext_type=sa.Text()),
            existing_type=sa.JSON(),
            postgresql_using="tags::jsonb",
            existing_nullable=False,
        )

    # Normalize / add a general-purpose GIN index if neither legacy nor current exists.
    if not (_index_exists("idx_prompt_block_tags_gin") or _index_exists("idx_action_block_tags_gin")):
        op.create_index(
            "idx_prompt_block_tags_gin",
            table_name,
            [sa.literal_column("tags")],
            unique=False,
            postgresql_using="gin",
        )

    # Common filter path for prompt library + template/matrix exploration.
    if not _index_exists("idx_prompt_block_pkg_role_cat_public"):
        op.create_index(
            "idx_prompt_block_pkg_role_cat_public",
            table_name,
            ["package_name", "role", "category", "is_public"],
            unique=False,
        )

    # Hot tag keys for template rolling / matrix coverage.
    tag_expr_keys = [
        ("idx_prompt_block_tag_sequence_family", "sequence_family"),
        ("idx_prompt_block_tag_beat_axis", "beat_axis"),
        ("idx_prompt_block_tag_view_profile", "view_profile"),
        ("idx_prompt_block_tag_response_mode", "response_mode"),
        ("idx_prompt_block_tag_proximity_stage", "proximity_stage"),
        ("idx_prompt_block_tag_contact_stage", "contact_stage"),
        ("idx_prompt_block_tag_rigidity", "rigidity"),
        ("idx_prompt_block_tag_approach", "approach"),
    ]
    for index_name, tag_key in tag_expr_keys:
        _create_index_if_missing(
            index_name,
            f"CREATE INDEX {index_name} ON {table_name} ((tags->>'{tag_key}'))",
        )


def downgrade() -> None:
    table_name = _resolve_block_table()
    if not table_name:
        return

    # Drop targeted indexes added by this migration. Keep legacy indexes and
    # leave tags as JSONB (safe/non-destructive downgrade).
    for index_name in [
        "idx_prompt_block_tag_approach",
        "idx_prompt_block_tag_rigidity",
        "idx_prompt_block_tag_contact_stage",
        "idx_prompt_block_tag_proximity_stage",
        "idx_prompt_block_tag_response_mode",
        "idx_prompt_block_tag_view_profile",
        "idx_prompt_block_tag_beat_axis",
        "idx_prompt_block_tag_sequence_family",
        "idx_prompt_block_pkg_role_cat_public",
        "idx_prompt_block_tags_gin",
    ]:
        if _index_exists(index_name):
            op.execute(f"DROP INDEX IF EXISTS {index_name}")
