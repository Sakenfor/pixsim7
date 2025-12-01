"""make_execution_preset_id_nullable

Revision ID: exec_preset_nullable
Revises: 26e6eae32247, 1127aimodeldefaults, 1128timestamp
Create Date: 2025-12-01 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'exec_preset_nullable'
down_revision = ('26e6eae32247', '1127aimodeldefaults', '1128timestamp')
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Make preset_id nullable in automation_executions table.

    This allows test executions to store actions inline in execution_context
    without requiring a saved preset.
    """
    op.alter_column('automation_executions', 'preset_id',
                    existing_type=sa.INTEGER(),
                    nullable=True)


def downgrade() -> None:
    """Revert preset_id to non-nullable.

    Warning: This will fail if any executions have NULL preset_id.
    """
    op.alter_column('automation_executions', 'preset_id',
                    existing_type=sa.INTEGER(),
                    nullable=False)
