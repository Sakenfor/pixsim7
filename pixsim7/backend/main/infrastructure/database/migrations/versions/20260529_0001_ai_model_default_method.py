"""ai_model_default_method — add missing `method` column to ai_model_defaults

Schema drift fix: ``AiModelDefault`` (services/ai_model/defaults.py) declares a
``method`` column ("api" | "cmd" | "remote" | "local"; NULL = model default)
and ``get_default_model`` reads it, but the baseline squash created the table
without it. The resulting ``SELECT *`` raised ``UndefinedColumnError``, which
``get_default_model`` swallowed (falling back to FALLBACK_DEFAULTS) while
poisoning the surrounding transaction — breaking any code that resolves a
default model mid-transaction (e.g. embedding services in a batch).

Revision ID: 20260529_0001
Revises: 20260528_0002
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa


revision = "20260529_0001"
down_revision = "20260528_0002"
branch_labels = None
depends_on = None

_TABLE = "ai_model_defaults"


def upgrade() -> None:
    op.add_column(
        _TABLE,
        sa.Column("method", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column(_TABLE, "method")
