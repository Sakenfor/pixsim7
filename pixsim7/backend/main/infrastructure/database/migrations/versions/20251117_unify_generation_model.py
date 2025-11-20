"""Unify Job + GenerationArtifact into Generation model

Revision ID: 20251117_unify_gen
Revises: a786922d98aa
Create Date: 2025-11-17

This migration unifies the Job and GenerationArtifact tables into a single
Generation table, simplifying the architecture and eliminating duplication.

Changes:
1. Create new `generations` table with unified fields
2. Update `provider_submissions` FK: job_id -> generation_id
3. Update `assets` FK: source_job_id -> source_generation_id
4. Update `prompt_variant_feedback` FK: generation_artifact_id -> generation_id
5. Drop old `jobs` and `generation_artifacts` tables
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import ProgrammingError, OperationalError

# revision identifiers, used by Alembic.
revision = '20251117_unify_gen'
# Chain after prompt versioning + variant feedback so history is linear.
down_revision = '9a0b1c3d4e5f'
branch_labels = None
depends_on = None


def upgrade():
    """Upgrade schema to unified Generation model."""

    # ===== 1. CREATE GENERATIONS TABLE =====
    op.create_table(
        'generations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=True),

        # Operation
        sa.Column('operation_type', sa.String(length=50), nullable=False),
        sa.Column('provider_id', sa.String(length=50), nullable=False),

        # Params
        sa.Column('raw_params', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('canonical_params', postgresql.JSON(astext_type=sa.Text()), nullable=False),

        # Inputs & reproducibility
        sa.Column('inputs', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('reproducible_hash', sa.String(length=64), nullable=True),

        # Prompt versioning
        sa.Column('prompt_version_id', postgresql.UUID(), nullable=True),
        sa.Column('final_prompt', sa.Text(), nullable=True),

        # Lifecycle
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('scheduled_at', sa.DateTime(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('parent_generation_id', sa.Integer(), nullable=True),

        # Result
        sa.Column('asset_id', sa.Integer(), nullable=True),

        # Metadata
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),

        # Primary key
        sa.PrimaryKeyConstraint('id'),

        # Foreign keys
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ),
        sa.ForeignKeyConstraint(['prompt_version_id'], ['prompt_versions.id'], ),
        sa.ForeignKeyConstraint(['parent_generation_id'], ['generations.id'], ),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    )

    # Create indexes for generations
    op.create_index('idx_generation_user_status_created', 'generations', ['user_id', 'status', 'created_at'])
    op.create_index('idx_generation_status_created', 'generations', ['status', 'created_at'])
    op.create_index('idx_generation_priority_created', 'generations', ['priority', 'created_at'])
    op.create_index(op.f('ix_generations_user_id'), 'generations', ['user_id'])
    op.create_index(op.f('ix_generations_workspace_id'), 'generations', ['workspace_id'])
    op.create_index(op.f('ix_generations_operation_type'), 'generations', ['operation_type'])
    op.create_index(op.f('ix_generations_provider_id'), 'generations', ['provider_id'])
    op.create_index(op.f('ix_generations_reproducible_hash'), 'generations', ['reproducible_hash'])
    op.create_index(op.f('ix_generations_prompt_version_id'), 'generations', ['prompt_version_id'])
    op.create_index(op.f('ix_generations_status'), 'generations', ['status'])
    op.create_index(op.f('ix_generations_priority'), 'generations', ['priority'])
    op.create_index(op.f('ix_generations_scheduled_at'), 'generations', ['scheduled_at'])
    op.create_index(op.f('ix_generations_parent_generation_id'), 'generations', ['parent_generation_id'])
    op.create_index(op.f('ix_generations_asset_id'), 'generations', ['asset_id'])
    op.create_index(op.f('ix_generations_created_at'), 'generations', ['created_at'])

    # ===== 2. UPDATE PROVIDER_SUBMISSIONS =====
    # Add new generation_id column
    op.add_column('provider_submissions', sa.Column('generation_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_provider_submissions_generation_id'), 'provider_submissions', ['generation_id'])
    op.create_foreign_key('fk_provider_submissions_generation_id', 'provider_submissions', 'generations', ['generation_id'], ['id'])

    # Drop old job_id FK and column (after data migration if needed)
    # NOTE: Use IF EXISTS to avoid errors if constraint/index names differ.
    op.execute("ALTER TABLE provider_submissions DROP CONSTRAINT IF EXISTS provider_submissions_job_id_fkey")
    op.execute("DROP INDEX IF EXISTS idx_submission_job_attempt")
    op.execute("ALTER TABLE provider_submissions DROP COLUMN IF EXISTS job_id")

    # Recreate index with new column name
    op.create_index('idx_submission_generation_attempt', 'provider_submissions', ['generation_id', 'retry_attempt'])

    # ===== 3. UPDATE ASSETS =====
    # Add new source_generation_id column
    op.add_column('assets', sa.Column('source_generation_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_assets_source_generation_id'), 'assets', ['source_generation_id'])
    op.create_foreign_key('fk_assets_source_generation_id', 'assets', 'generations', ['source_generation_id'], ['id'])

    # Drop old source_job_id FK and column
    op.execute("ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_source_job_id_fkey")
    op.execute("DROP INDEX IF EXISTS ix_assets_source_job_id")
    op.execute("ALTER TABLE assets DROP COLUMN IF EXISTS source_job_id")

    # ===== 4. UPDATE PROMPT_VARIANT_FEEDBACK =====
    # Add new generation_id column
    op.add_column('prompt_variant_feedback', sa.Column('generation_id', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_prompt_variant_feedback_generation_id'), 'prompt_variant_feedback', ['generation_id'])
    op.create_foreign_key('fk_prompt_variant_feedback_generation_id', 'prompt_variant_feedback', 'generations', ['generation_id'], ['id'])

    # Drop old generation_artifact_id FK and column
    op.execute("ALTER TABLE prompt_variant_feedback DROP CONSTRAINT IF EXISTS prompt_variant_feedback_generation_artifact_id_fkey")
    op.execute("DROP INDEX IF EXISTS ix_prompt_variant_feedback_generation_artifact_id")
    op.execute("ALTER TABLE prompt_variant_feedback DROP COLUMN IF EXISTS generation_artifact_id")

    # ===== 5. DROP OLD TABLES =====
    # Drop generation_artifacts table
    op.execute("DROP INDEX IF EXISTS idx_artifact_job_op")
    op.execute("DROP INDEX IF EXISTS ix_generation_artifacts_job_id")
    op.execute("DROP INDEX IF EXISTS ix_generation_artifacts_operation_type")
    op.execute("DROP INDEX IF EXISTS ix_generation_artifacts_prompt_version_id")
    op.execute("DROP INDEX IF EXISTS ix_generation_artifacts_created_at")
    op.execute("DROP TABLE IF EXISTS generation_artifacts")

    # Drop jobs table
    op.execute("DROP INDEX IF EXISTS idx_job_workspace")
    op.execute("DROP INDEX IF EXISTS idx_job_user_status_created")
    op.execute("DROP INDEX IF EXISTS idx_job_status_created")
    op.execute("DROP INDEX IF EXISTS idx_job_priority_created")
    op.execute("DROP INDEX IF EXISTS ix_jobs_user_id")
    op.execute("DROP INDEX IF EXISTS ix_jobs_status")
    op.execute("DROP INDEX IF EXISTS ix_jobs_scheduled_at")
    op.execute("DROP INDEX IF EXISTS ix_jobs_provider_id")
    op.execute("DROP INDEX IF EXISTS ix_jobs_priority")
    op.execute("DROP INDEX IF EXISTS ix_jobs_created_at")
    op.execute("DROP INDEX IF EXISTS ix_jobs_asset_id")
    op.execute("DROP TABLE IF EXISTS jobs")


def downgrade():
    """Downgrade back to Job + GenerationArtifact split model.

    WARNING: This downgrade is lossy. Data migration logic would be needed
    to split unified Generation records back into Job + GenerationArtifact.
    """

    # Recreate jobs table
    op.create_table(
        'jobs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('operation_type', sa.String(length=50), nullable=False),
        sa.Column('provider_id', sa.String(length=50), nullable=False),
        sa.Column('params', postgresql.JSON(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('priority', sa.Integer(), server_default='5', nullable=False),
        sa.Column('scheduled_at', sa.DateTime(), nullable=True),
        sa.Column('parent_job_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id']),
        sa.ForeignKeyConstraint(['parent_job_id'], ['jobs.id']),
        sa.ForeignKeyConstraint(['asset_id'], ['assets.id']),
    )

    # Recreate generation_artifacts table
    op.create_table(
        'generation_artifacts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('job_id', sa.Integer(), nullable=False),
        sa.Column('operation_type', sa.String(length=50), nullable=False),
        sa.Column('canonical_params', postgresql.JSON(), nullable=False),
        sa.Column('inputs', postgresql.JSON(), nullable=False),
        sa.Column('reproducible_hash', sa.String(length=64), nullable=False),
        sa.Column('prompt_version_id', postgresql.UUID(), nullable=True),
        sa.Column('final_prompt', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['job_id'], ['jobs.id']),
        sa.ForeignKeyConstraint(['prompt_version_id'], ['prompt_versions.id']),
    )

    # Revert all FK changes (omitted for brevity - would be full reversal of upgrade)
    # This is a lossy downgrade requiring data migration logic

    # Drop generations table
    op.drop_table('generations')
