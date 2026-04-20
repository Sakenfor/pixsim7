"""Normalize enum values to lowercase

Revision ID: g8h9i0j1k2l3
Revises: f7g8h9i0j1k2
Create Date: 2025-12-14 01:00:00.000000

Fixes data inconsistency where SQLAlchemy stored enum member NAMES (PENDING,
IMAGE_TO_VIDEO) instead of VALUES (pending, image_to_video) when the enum
columns were created without values_callable.

This migration normalizes all uppercase enum values to lowercase.
Only affects VARCHAR columns - native PostgreSQL enums are skipped.
"""
from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = 'g8h9i0j1k2l3'
down_revision = 'f7g8h9i0j1k2'
branch_labels = None
depends_on = None


def is_varchar_column(conn, table, column):
    """Check if a column is VARCHAR/TEXT (not a native enum)."""
    result = conn.execute(text("""
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = :table AND column_name = :column
    """), {"table": table, "column": column})
    row = result.fetchone()
    if row:
        data_type = row[0].lower()
        return data_type in ('character varying', 'varchar', 'text')
    return False


def normalize_column(conn, table, column):
    """Normalize a VARCHAR column to lowercase."""
    if not is_varchar_column(conn, table, column):
        print(f"Skipped {table}.{column} (native enum type)")
        return

    conn.execute(text(f"""
        UPDATE {table}
        SET {column} = LOWER({column})
        WHERE {column} IS NOT NULL
          AND {column} != LOWER({column})
    """))
    print(f"Normalized {table}.{column}")


def upgrade():
    """Normalize all enum values to lowercase"""
    conn = op.get_bind()

    # Generations table - status, operation_type, billing_state
    normalize_column(conn, "generations", "status")
    normalize_column(conn, "generations", "operation_type")
    normalize_column(conn, "generations", "billing_state")

    # Asset lineage table - operation_type
    normalize_column(conn, "asset_lineage", "operation_type")

    # Asset analyses table - status, analyzer_type
    normalize_column(conn, "asset_analyses", "status")
    normalize_column(conn, "asset_analyses", "analyzer_type")

    # Action blocks table - role
    normalize_column(conn, "action_blocks_db", "role")

    print("Enum value normalization complete")


def downgrade():
    """No downgrade - lowercase is the correct format"""
    # We don't revert as lowercase is the intended format
    # and matches the Python enum values
    pass
