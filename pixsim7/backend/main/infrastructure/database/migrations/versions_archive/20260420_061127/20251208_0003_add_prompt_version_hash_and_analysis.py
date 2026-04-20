"""add prompt_hash and prompt_analysis to prompt_versions, make family_id nullable

Enables one-off prompts (without family) and hash-based deduplication.

Changes:
- Add prompt_hash column (SHA256 for dedup)
- Add prompt_analysis column (JSON with parsed blocks)
- Make family_id nullable (for one-off prompts)
- Make version_number nullable (for one-off prompts)
- Add index on prompt_hash

Revision ID: d4e5f6a7b8c1
Revises: c3d4e5f6a7b0
Create Date: 2025-12-08 00:03:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c1'
down_revision = 'c3d4e5f6a7b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add prompt_hash column
    op.add_column(
        'prompt_versions',
        sa.Column('prompt_hash', sa.String(64), nullable=True, index=True)
    )

    # Add prompt_analysis column
    op.add_column(
        'prompt_versions',
        sa.Column('prompt_analysis', sa.JSON(), nullable=True)
    )

    # Make family_id nullable (for one-off prompts)
    op.alter_column(
        'prompt_versions',
        'family_id',
        existing_type=sa.UUID(),
        nullable=True
    )

    # Make version_number nullable (for one-off prompts)
    op.alter_column(
        'prompt_versions',
        'version_number',
        existing_type=sa.Integer(),
        nullable=True
    )

    # Backfill prompt_hash for existing rows
    # Using prompt_text hash - this is a simple approach
    op.execute("""
        UPDATE prompt_versions
        SET prompt_hash = encode(sha256(prompt_text::bytea), 'hex')
        WHERE prompt_hash IS NULL
    """)

    # Now make prompt_hash NOT NULL after backfill
    op.alter_column(
        'prompt_versions',
        'prompt_hash',
        existing_type=sa.String(64),
        nullable=False
    )


def downgrade() -> None:
    # Make version_number NOT NULL again (will fail if there are NULLs)
    op.alter_column(
        'prompt_versions',
        'version_number',
        existing_type=sa.Integer(),
        nullable=False
    )

    # Make family_id NOT NULL again (will fail if there are NULLs)
    op.alter_column(
        'prompt_versions',
        'family_id',
        existing_type=sa.UUID(),
        nullable=False
    )

    # Drop prompt_analysis column
    op.drop_column('prompt_versions', 'prompt_analysis')

    # Drop prompt_hash column (index will be dropped automatically)
    op.drop_column('prompt_versions', 'prompt_hash')
