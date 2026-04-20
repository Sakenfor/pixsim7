"""Normalize account emails to lowercase

Revision ID: f7g8h9i0j1k2
Revises: e5f6a7b8c9d2
Create Date: 2025-12-14 00:00:00.000000

Normalizes all existing provider account emails to lowercase to prevent
duplicate accounts that differ only in email case (e.g., "Test@example.com"
vs "test@example.com").

This migration is safe to run even if emails are already normalized.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7g8h9i0j1k2'
down_revision = 'e5f6a7b8c9d2'
branch_labels = None
depends_on = None


def upgrade():
    """Normalize all provider account emails to lowercase"""
    # Update all existing emails to lowercase and trimmed
    # This is safe to run multiple times (idempotent)
    op.execute("""
        UPDATE provider_accounts 
        SET email = LOWER(TRIM(email))
        WHERE email IS NOT NULL
          AND email != LOWER(TRIM(email))
    """)
    
    print("Normalized provider account emails to lowercase")


def downgrade():
    """No downgrade needed - email normalization is a data quality improvement"""
    # We don't revert normalization as it's a data quality improvement
    # Original casing is lost, but this is intentional
    pass
