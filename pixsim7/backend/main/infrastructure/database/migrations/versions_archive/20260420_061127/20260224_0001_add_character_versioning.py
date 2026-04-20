"""Add character versioning via VersioningServiceBase pattern.

Creates character_version_families table and adds versioning columns to
characters table, following the same pattern as asset versioning.

Revision ID: 20260224_0001
Revises: 20260223_0003
Create Date: 2026-02-24
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# revision identifiers, used by Alembic.
revision = "20260224_0001"
down_revision = "20260223_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- 1. Create character_version_families table --
    op.create_table(
        "character_version_families",
        sa.Column("id", PG_UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("name", sa.VARCHAR(255), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("tags", sa.JSON, nullable=False, server_default="[]"),
        sa.Column(
            "head_character_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("characters.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_cvf_updated", "character_version_families", ["updated_at"])

    # -- 2. Add new versioning columns to characters --
    op.add_column(
        "characters",
        sa.Column(
            "version_family_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("character_version_families.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_char_version_family", "characters", ["version_family_id"])

    op.add_column(
        "characters",
        sa.Column("version_number", sa.Integer, nullable=True),
    )

    op.add_column(
        "characters",
        sa.Column(
            "parent_character_id",
            PG_UUID(as_uuid=True),
            sa.ForeignKey("characters.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_char_parent", "characters", ["parent_character_id"])

    op.add_column(
        "characters",
        sa.Column("version_message", sa.VARCHAR(500), nullable=True),
    )

    # -- 3. Drop old version columns --
    # Drop the FK constraint on previous_version_id first
    op.drop_constraint(
        "characters_previous_version_id_fkey", "characters", type_="foreignkey"
    )
    op.drop_column("characters", "previous_version_id")
    op.drop_column("characters", "version")
    # Keep version_notes in DB for legacy reads, but new code uses version_message

    # -- 4. Drop unique constraint on character_id, keep as non-unique index --
    # character_id was created with unique=True; PG may store it as a constraint
    # or a unique index depending on how SQLAlchemy emitted the DDL.
    op.execute("ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_character_id_key")
    op.execute("DROP INDEX IF EXISTS ix_characters_character_id")
    op.create_index(
        "ix_characters_character_id",
        "characters",
        ["character_id"],
        unique=False,
    )

    # -- 5. Constraints matching asset versioning pattern --
    # Partial unique: no two versions in the same family can share a version_number
    op.execute(
        """
        CREATE UNIQUE INDEX uq_char_family_version
        ON characters (version_family_id, version_number)
        WHERE version_family_id IS NOT NULL
        """
    )

    # CHECK: if in a family, must have a version_number
    op.execute(
        """
        ALTER TABLE characters
        ADD CONSTRAINT ck_char_family_requires_version
        CHECK (version_family_id IS NULL OR version_number IS NOT NULL)
        """
    )

    # CHECK: version_number must be positive
    op.execute(
        """
        ALTER TABLE characters
        ADD CONSTRAINT ck_char_version_positive
        CHECK (version_number IS NULL OR version_number > 0)
        """
    )


def downgrade() -> None:
    # Drop constraints
    op.execute("ALTER TABLE characters DROP CONSTRAINT IF EXISTS ck_char_version_positive")
    op.execute("ALTER TABLE characters DROP CONSTRAINT IF EXISTS ck_char_family_requires_version")
    op.execute("DROP INDEX IF EXISTS uq_char_family_version")

    # Restore unique constraint on character_id
    op.execute("DROP INDEX IF EXISTS ix_characters_character_id")
    op.create_unique_constraint("characters_character_id_key", "characters", ["character_id"])

    # Drop new columns
    op.drop_index("idx_char_parent", "characters", if_exists=True)
    op.drop_column("characters", "version_message")
    op.drop_column("characters", "parent_character_id")
    op.drop_column("characters", "version_number")
    op.drop_index("idx_char_version_family", "characters", if_exists=True)
    op.drop_column("characters", "version_family_id")

    # Restore old columns
    op.add_column("characters", sa.Column("version", sa.Integer, nullable=False, server_default="1"))
    op.add_column("characters", sa.Column("previous_version_id", PG_UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "characters_previous_version_id_fkey",
        "characters",
        "characters",
        ["previous_version_id"],
        ["id"],
    )

    # Drop family table
    op.drop_index("idx_cvf_updated", "character_version_families")
    op.drop_table("character_version_families")
