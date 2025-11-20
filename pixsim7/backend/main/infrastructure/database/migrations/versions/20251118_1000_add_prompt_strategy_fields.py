"""Add strategy-aware fields to PromptVersion

Revision ID: 1118promptstrategy
Revises: 1118addsessionver
Create Date: 2025-11-18 10:00:00

BREAKING CHANGE: Adds generation strategy support to prompt versioning system.

New fields:
- compatible_strategies: JSON array of strategy names ('once', 'per_playthrough', etc.)
- allow_randomization: Boolean flag for prompt variation support
- randomization_params: JSON config for randomization rules
- provider_compatibility: JSON mapping of provider-specific constraints
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = '1118promptstrategy'
down_revision = '1118addsessionver'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add strategy compatibility fields to prompt_versions
    op.add_column(
        'prompt_versions',
        sa.Column(
            'compatible_strategies',
            JSON,
            nullable=False,
            server_default='[]',
            comment='Strategy names this prompt supports: ["once", "per_playthrough", "always"]'
        )
    )

    op.add_column(
        'prompt_versions',
        sa.Column(
            'allow_randomization',
            sa.Boolean(),
            nullable=False,
            server_default='false',
            comment='Whether this prompt supports randomized variations'
        )
    )

    op.add_column(
        'prompt_versions',
        sa.Column(
            'randomization_params',
            JSON,
            nullable=True,
            comment='Randomization configuration: variable pools, weights, etc.'
        )
    )

    op.add_column(
        'prompt_versions',
        sa.Column(
            'provider_compatibility',
            JSON,
            nullable=False,
            server_default='{}',
            comment='Provider-specific constraints and validated limits'
        )
    )

    # Add index for querying by strategy
    op.create_index(
        'idx_prompt_version_strategies',
        'prompt_versions',
        ['family_id'],
        postgresql_where=sa.text("compatible_strategies::text != '[]'")
    )


def downgrade() -> None:
    # Remove index
    op.drop_index('idx_prompt_version_strategies', table_name='prompt_versions')

    # Remove columns in reverse order
    op.drop_column('prompt_versions', 'provider_compatibility')
    op.drop_column('prompt_versions', 'randomization_params')
    op.drop_column('prompt_versions', 'allow_randomization')
    op.drop_column('prompt_versions', 'compatible_strategies')
