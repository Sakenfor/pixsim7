"""add prompt_version tag assertions

Adds typed prompt-version tag assertions to replace JSON-based prompt tag scans.

Revision ID: 20260402_0003
Revises: 20260402_0002
Create Date: 2026-04-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260402_0003"
down_revision = "20260402_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prompt_version_tag_assertion",
        sa.Column("prompt_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False, server_default=sa.text("'analyzer'")),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["prompt_version_id"], ["prompt_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tag.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("prompt_version_id", "tag_id"),
        sa.CheckConstraint(
            "source IN ('unknown','manual','system','analyzer')",
            name="ck_prompt_version_tag_assertion_source_valid",
        ),
    )
    op.create_index(
        "idx_prompt_version_tag_assertion_tag",
        "prompt_version_tag_assertion",
        ["tag_id"],
    )
    op.create_index(
        "idx_prompt_version_tag_assertion_source",
        "prompt_version_tag_assertion",
        ["source"],
    )
    op.create_index(
        "idx_prompt_version_tag_assertion_created",
        "prompt_version_tag_assertion",
        ["created_at"],
    )

    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    # Ensure canonical tag rows exist for prompt-analysis slugs.
    op.execute(
        """
        WITH extracted AS (
            SELECT DISTINCT lower(trim(tag_value.value)) AS slug
            FROM prompt_versions pv
            JOIN LATERAL jsonb_array_elements_text(
                COALESCE((pv.prompt_analysis::jsonb)->'tags_flat', '[]'::jsonb)
            ) AS tag_value(value) ON TRUE
            WHERE pv.prompt_analysis IS NOT NULL
              AND (pv.prompt_analysis::jsonb ? 'tags_flat')
              AND jsonb_typeof((pv.prompt_analysis::jsonb)->'tags_flat') = 'array'
              AND trim(tag_value.value) <> ''
        ),
        parsed AS (
            SELECT
                slug,
                split_part(slug, ':', 1) AS namespace,
                substring(slug from position(':' in slug) + 1) AS name
            FROM extracted
            WHERE position(':' in slug) > 1
              AND split_part(slug, ':', 1) !~ '\\s'
              AND substring(slug from position(':' in slug) + 1) <> ''
        )
        INSERT INTO tag (namespace, name, slug, display_name)
        SELECT p.namespace, p.name, p.slug, p.slug
        FROM parsed p
        ON CONFLICT (slug) DO NOTHING
        """
    )

    # Backfill assertions from prompt_versions.prompt_analysis.tags_flat.
    op.execute(
        """
        INSERT INTO prompt_version_tag_assertion (prompt_version_id, tag_id, source)
        SELECT DISTINCT
            pv.id AS prompt_version_id,
            t.id AS tag_id,
            'analyzer' AS source
        FROM prompt_versions pv
        JOIN LATERAL jsonb_array_elements_text(
            COALESCE((pv.prompt_analysis::jsonb)->'tags_flat', '[]'::jsonb)
        ) AS tag_value(value) ON TRUE
        JOIN tag t ON t.slug = lower(trim(tag_value.value))
        WHERE pv.prompt_analysis IS NOT NULL
          AND (pv.prompt_analysis::jsonb ? 'tags_flat')
          AND jsonb_typeof((pv.prompt_analysis::jsonb)->'tags_flat') = 'array'
          AND trim(tag_value.value) <> ''
        ON CONFLICT (prompt_version_id, tag_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(
        "idx_prompt_version_tag_assertion_created",
        table_name="prompt_version_tag_assertion",
    )
    op.drop_index(
        "idx_prompt_version_tag_assertion_source",
        table_name="prompt_version_tag_assertion",
    )
    op.drop_index(
        "idx_prompt_version_tag_assertion_tag",
        table_name="prompt_version_tag_assertion",
    )
    op.drop_table("prompt_version_tag_assertion")

