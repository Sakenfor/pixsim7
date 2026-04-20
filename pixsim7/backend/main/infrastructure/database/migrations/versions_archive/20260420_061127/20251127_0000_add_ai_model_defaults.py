"""Add AI model defaults configuration table

Revision ID: 1127aimodeldefaults
Revises: 1118genpromptconfig
Create Date: 2025-11-27 00:00:00

This migration adds a table for storing AI model default configurations
per capability (prompt_edit, prompt_parse, etc.) and scope (global, user, workspace).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '1127aimodeldefaults'
down_revision = '1118genpromptconfig'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ai_model_defaults table
    op.create_table(
        'ai_model_defaults',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('scope_type', sa.String(20), nullable=False, comment='Scope: "global", "user", "workspace"'),
        sa.Column('scope_id', sa.String(100), nullable=True, comment='ID for user/workspace scope, NULL for global'),
        sa.Column('capability', sa.String(50), nullable=False, comment='Capability: "prompt_edit", "prompt_parse", etc.'),
        sa.Column('model_id', sa.String(100), nullable=False, comment='AI model ID (e.g., "openai:gpt-4.1-mini")'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), onupdate=sa.text('now()'), nullable=False),
    )

    # Create unique constraint: one default per capability per scope
    op.create_unique_constraint(
        'uq_ai_model_defaults_scope_capability',
        'ai_model_defaults',
        ['scope_type', 'scope_id', 'capability']
    )

    # Create index for quick lookups by capability
    op.create_index(
        'idx_ai_model_defaults_capability',
        'ai_model_defaults',
        ['capability', 'scope_type']
    )

    # Insert global defaults
    op.execute("""
        INSERT INTO ai_model_defaults (scope_type, scope_id, capability, model_id)
        VALUES
            ('global', NULL, 'prompt_edit', 'openai:gpt-4.1-mini'),
            ('global', NULL, 'prompt_parse', 'prompt-dsl:simple')
    """)


def downgrade() -> None:
    # Drop table and all constraints/indexes
    op.drop_table('ai_model_defaults')
