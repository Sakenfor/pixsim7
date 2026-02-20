"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
${imports if imports else ""}

# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    """Apply migration: ${message}"""
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    """Revert migration: ${message}

    ⚠️ WARNING: This may result in data loss!
    Ensure you have a verified backup before running.
    """
    ${downgrades if downgrades else "pass"}
