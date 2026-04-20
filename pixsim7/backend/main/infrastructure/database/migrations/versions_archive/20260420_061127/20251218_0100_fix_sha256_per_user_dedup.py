"""fix sha256 per-user deduplication

Revision ID: 20251218_0100
Revises: 20251218_0000
Create Date: 2025-12-18 01:00:00.000000

Changes SHA256 deduplication from global to per-user scope:
- Removes global unique constraint on assets.sha256
- Adds composite unique index on (user_id, sha256)
- Prevents constraint violations when multiple users upload the same file

Background:
- DB had sha256 marked unique=True (global scope)
- Code does per-user lookups: WHERE user_id = ? AND sha256 = ?
- This caused constraint errors when different users uploaded identical files
- Fix: Make uniqueness scoped to (user_id, sha256) instead of global
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20251218_0100"
down_revision = "20251218_0000"
branch_labels = None
depends_on = None


def _constraint_exists(bind, constraint_name: str, table_name: str) -> bool:
    """Check if a constraint exists in the database."""
    row = bind.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_schema = 'public'
              AND table_name = :table_name
              AND constraint_name = :constraint_name
            LIMIT 1
            """
        ),
        {"table_name": table_name, "constraint_name": constraint_name},
    ).first()
    return row is not None


def _index_exists(bind, index_name: str) -> bool:
    """Check if an index exists in the database."""
    row = bind.execute(
        sa.text(
            """
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname = :index_name
            LIMIT 1
            """
        ),
        {"index_name": index_name},
    ).first()
    return row is not None


def upgrade() -> None:
    bind = op.get_bind()

    # Step 1: Drop old global unique constraint on sha256 if it exists
    # Try common constraint name patterns
    for constraint_name in ["assets_sha256_key", "uq_assets_sha256", "assets_sha256_unique"]:
        if _constraint_exists(bind, constraint_name, "assets"):
            op.drop_constraint(constraint_name, "assets", type_="unique")
            print(f"Dropped global unique constraint: {constraint_name}")
            break

    # Step 2: Drop old standalone sha256 index if it exists
    if _index_exists(bind, "ix_assets_sha256"):
        op.drop_index("ix_assets_sha256", table_name="assets")
        print("Dropped standalone sha256 index")

    # Step 3: Create composite unique index on (user_id, sha256)
    # Only if it doesn't already exist
    if not _index_exists(bind, "idx_asset_user_sha256"):
        # Use partial index to exclude NULL values (PostgreSQL feature)
        op.create_index(
            "idx_asset_user_sha256",
            "assets",
            ["user_id", "sha256"],
            unique=True,
            postgresql_where=sa.text("sha256 IS NOT NULL"),
        )
        print("Created composite unique index: idx_asset_user_sha256")


def downgrade() -> None:
    bind = op.get_bind()

    # Step 1: Drop the composite index
    if _index_exists(bind, "idx_asset_user_sha256"):
        op.drop_index("idx_asset_user_sha256", table_name="assets")

    # Step 2: Recreate global unique constraint
    # NOTE: This may fail if there are now duplicate sha256 values across users
    # In that case, manual cleanup would be required before downgrading
    try:
        op.create_unique_constraint("assets_sha256_key", "assets", ["sha256"])
        op.create_index("ix_assets_sha256", "assets", ["sha256"], unique=False)
    except sa.exc.IntegrityError as e:
        print(f"Warning: Cannot recreate global unique constraint due to existing duplicates: {e}")
        print("Manual cleanup required before downgrade")
        raise
