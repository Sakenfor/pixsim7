"""Add explicit provenance fields to game_project_snapshots.

Revision ID: 20260303_0001
Revises: 20260302_0002
Create Date: 2026-03-03

Adds:
- origin_kind: canonical source classification (user/seed/demo/import/duplicate/draft/unknown)
- origin_source_key: optional source key (for seed/demo packs)
- origin_parent_project_id: optional lineage pointer (duplicate/derivative)
- origin_meta: optional JSON metadata for provenance details
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260303_0001"
down_revision = "20260302_0002"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return table_name in sa.inspect(conn).get_table_names()


def _column_names(inspector, table_name: str) -> set[str]:
    return {col["name"] for col in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def _fk_names(inspector, table_name: str) -> set[str]:
    return {fk.get("name") for fk in inspector.get_foreign_keys(table_name) if fk.get("name")}


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "game_project_snapshots"):
        return

    inspector = sa.inspect(conn)
    columns = _column_names(inspector, "game_project_snapshots")
    indexes = _index_names(inspector, "game_project_snapshots")
    fks = _fk_names(inspector, "game_project_snapshots")

    json_type = postgresql.JSONB() if conn.dialect.name == "postgresql" else sa.JSON()

    if "origin_kind" not in columns:
        op.add_column(
            "game_project_snapshots",
            sa.Column(
                "origin_kind",
                sa.String(length=32),
                nullable=False,
                server_default=sa.text("'unknown'"),
            ),
        )

    if "origin_source_key" not in columns:
        op.add_column(
            "game_project_snapshots",
            sa.Column("origin_source_key", sa.String(length=160), nullable=True),
        )

    if "origin_parent_project_id" not in columns:
        op.add_column(
            "game_project_snapshots",
            sa.Column("origin_parent_project_id", sa.Integer(), nullable=True),
        )

    if "origin_meta" not in columns:
        op.add_column(
            "game_project_snapshots",
            sa.Column(
                "origin_meta",
                json_type,
                nullable=False,
                server_default=sa.text("'{}'"),
            ),
        )

    idx_kind = op.f("ix_game_project_snapshots_origin_kind")
    idx_source_key = op.f("ix_game_project_snapshots_origin_source_key")
    idx_parent = op.f("ix_game_project_snapshots_origin_parent_project_id")

    if idx_kind not in indexes:
        op.create_index(
            idx_kind,
            "game_project_snapshots",
            ["origin_kind"],
            unique=False,
        )
    if idx_source_key not in indexes:
        op.create_index(
            idx_source_key,
            "game_project_snapshots",
            ["origin_source_key"],
            unique=False,
        )
    if idx_parent not in indexes:
        op.create_index(
            idx_parent,
            "game_project_snapshots",
            ["origin_parent_project_id"],
            unique=False,
        )

    fk_name = "fk_game_project_snapshots_origin_parent_project_id"
    if fk_name not in fks:
        op.create_foreign_key(
            fk_name,
            "game_project_snapshots",
            "game_project_snapshots",
            ["origin_parent_project_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # Backfill baseline provenance.
    op.execute(
        "UPDATE game_project_snapshots "
        "SET origin_kind = 'draft' "
        "WHERE is_draft = true"
    )

    if conn.dialect.name == "postgresql":
        op.execute(
            """
            UPDATE game_project_snapshots
            SET
              origin_kind = 'seed',
              origin_source_key = COALESCE(
                NULLIF(origin_source_key, ''),
                NULLIF(bundle #>> '{core,world,meta,seed_key}', '')
              )
            WHERE
              is_draft = false
              AND NULLIF(bundle #>> '{core,world,meta,seed_key}', '') IS NOT NULL
            """
        )
        op.execute(
            "UPDATE game_project_snapshots "
            "SET origin_meta = '{}'::jsonb "
            "WHERE origin_meta IS NULL"
        )
    else:
        op.execute(
            "UPDATE game_project_snapshots "
            "SET origin_meta = '{}' "
            "WHERE origin_meta IS NULL"
        )


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "game_project_snapshots"):
        return

    inspector = sa.inspect(conn)
    columns = _column_names(inspector, "game_project_snapshots")
    indexes = _index_names(inspector, "game_project_snapshots")
    fks = _fk_names(inspector, "game_project_snapshots")

    fk_name = "fk_game_project_snapshots_origin_parent_project_id"
    if fk_name in fks:
        op.drop_constraint(
            fk_name,
            "game_project_snapshots",
            type_="foreignkey",
        )

    idx_kind = op.f("ix_game_project_snapshots_origin_kind")
    idx_source_key = op.f("ix_game_project_snapshots_origin_source_key")
    idx_parent = op.f("ix_game_project_snapshots_origin_parent_project_id")

    if idx_parent in indexes:
        op.drop_index(idx_parent, table_name="game_project_snapshots")
    if idx_source_key in indexes:
        op.drop_index(idx_source_key, table_name="game_project_snapshots")
    if idx_kind in indexes:
        op.drop_index(idx_kind, table_name="game_project_snapshots")

    if "origin_meta" in columns:
        op.drop_column("game_project_snapshots", "origin_meta")
    if "origin_parent_project_id" in columns:
        op.drop_column("game_project_snapshots", "origin_parent_project_id")
    if "origin_source_key" in columns:
        op.drop_column("game_project_snapshots", "origin_source_key")
    if "origin_kind" in columns:
        op.drop_column("game_project_snapshots", "origin_kind")
