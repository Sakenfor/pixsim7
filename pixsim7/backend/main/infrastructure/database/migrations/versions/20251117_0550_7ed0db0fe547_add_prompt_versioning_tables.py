"""add_prompt_versioning_tables

Revision ID: 7ed0db0fe547
Revises: a786922d98aa
Create Date: 2025-11-17 05:50:32.892184

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic
# NOTE: Use hash-based revision IDs (auto-generated) for consistency
# Avoid custom revision names to prevent conflicts in version chain
revision = '7ed0db0fe547'
down_revision = 'a786922d98aa'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply migration: add_prompt_versioning_tables"""

    # Create prompt_families table
    op.create_table(
        'prompt_families',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('slug', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False, unique=True, index=True),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column('prompt_type', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False, index=True),
        sa.Column('category', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True, index=True),
        sa.Column('tags', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('game_world_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('npc_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('scene_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('action_concept_id', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'), index=True),
        sa.Column('created_by', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true', index=True),
        sa.Column('family_metadata', sa.JSON(), nullable=False, server_default='{}'),
    )
    op.create_index('idx_prompt_family_type_category', 'prompt_families', ['prompt_type', 'category'])
    op.create_index('idx_prompt_family_active_created', 'prompt_families', ['is_active', 'created_at'])

    # Create prompt_versions table
    op.create_table(
        'prompt_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('family_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('prompt_families.id'), nullable=False, index=True),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('parent_version_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('prompt_versions.id'), nullable=True, index=True),
        sa.Column('prompt_text', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('variables', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('provider_hints', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('commit_message', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column('author', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()'), index=True),
        sa.Column('generation_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('successful_assets', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('semantic_version', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=True),
        sa.Column('branch_name', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True, index=True),
        sa.Column('tags', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('diff_from_parent', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.create_index('idx_prompt_version_family_number', 'prompt_versions', ['family_id', 'version_number'], unique=True)
    op.create_index('idx_prompt_version_created', 'prompt_versions', ['created_at'])
    op.create_index('idx_prompt_version_parent', 'prompt_versions', ['parent_version_id'])

    # Add prompt_version_id and final_prompt to generation_artifacts table
    op.add_column('generation_artifacts',
        sa.Column('prompt_version_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('generation_artifacts',
        sa.Column('final_prompt', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.create_foreign_key(
        'fk_generation_artifacts_prompt_version_id',
        'generation_artifacts', 'prompt_versions',
        ['prompt_version_id'], ['id']
    )
    op.create_index('idx_generation_artifact_prompt_version',
        'generation_artifacts', ['prompt_version_id'])


def downgrade() -> None:
    """Revert migration: add_prompt_versioning_tables

    ⚠️ WARNING: This may result in data loss!
    Ensure you have a verified backup before running.
    """

    # Drop generation_artifacts changes
    op.drop_index('idx_generation_artifact_prompt_version', table_name='generation_artifacts')
    op.drop_constraint('fk_generation_artifacts_prompt_version_id', 'generation_artifacts', type_='foreignkey')
    op.drop_column('generation_artifacts', 'final_prompt')
    op.drop_column('generation_artifacts', 'prompt_version_id')

    # Drop prompt_versions table
    op.drop_index('idx_prompt_version_parent', table_name='prompt_versions')
    op.drop_index('idx_prompt_version_created', table_name='prompt_versions')
    op.drop_index('idx_prompt_version_family_number', table_name='prompt_versions')
    op.drop_table('prompt_versions')

    # Drop prompt_families table
    op.drop_index('idx_prompt_family_active_created', table_name='prompt_families')
    op.drop_index('idx_prompt_family_type_category', table_name='prompt_families')
    op.drop_table('prompt_families')
