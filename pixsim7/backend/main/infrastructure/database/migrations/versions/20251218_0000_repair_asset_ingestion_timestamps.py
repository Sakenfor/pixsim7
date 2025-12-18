"""repair missing asset ingestion timestamp columns

Revision ID: 20251218_0000
Revises: 20251217_0100
Create Date: 2025-12-18 00:00:00.000000

Some environments ended up with alembic_version stamped at 20251217_0100 but
with a partially-applied migration (missing ingestion timestamp columns).

This migration is a safe repair step that conditionally adds the missing
columns to the assets table.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251218_0000"
down_revision = "20251217_0100"
branch_labels = None
depends_on = None


def _column_exists(bind, *, table_name: str, column_name: str) -> bool:
    row = bind.execute(
        sa.text(
            """
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = :table_name
              and column_name = :column_name
            limit 1
            """
        ),
        {"table_name": table_name, "column_name": column_name},
    ).first()
    return row is not None


def upgrade() -> None:
    bind = op.get_bind()

    missing = []
    for col in ("ingested_at", "metadata_extracted_at", "thumbnail_generated_at"):
        if not _column_exists(bind, table_name="assets", column_name=col):
            missing.append(col)

    if "ingested_at" in missing:
        op.add_column(
            "assets",
            sa.Column(
                "ingested_at",
                sa.DateTime(),
                nullable=True,
                comment="When ingestion completed successfully",
            ),
        )

    if "metadata_extracted_at" in missing:
        op.add_column(
            "assets",
            sa.Column(
                "metadata_extracted_at",
                sa.DateTime(),
                nullable=True,
                comment="When metadata extraction completed",
            ),
        )

    if "thumbnail_generated_at" in missing:
        op.add_column(
            "assets",
            sa.Column(
                "thumbnail_generated_at",
                sa.DateTime(),
                nullable=True,
                comment="When thumbnail generation completed",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()

    # Only drop if present (repair migrations should be reversible safely).
    for col in ("thumbnail_generated_at", "metadata_extracted_at", "ingested_at"):
        if _column_exists(bind, table_name="assets", column_name=col):
            op.drop_column("assets", col)

