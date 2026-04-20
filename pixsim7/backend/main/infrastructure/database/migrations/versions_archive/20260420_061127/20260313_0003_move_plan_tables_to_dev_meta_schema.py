"""Move plan registry tables from public to dev_meta schema.

Revision ID: 20260313_0003
Revises: 20260313_0002
Create Date: 2026-03-13
"""

from __future__ import annotations

from alembic import op


revision = "20260313_0003"
down_revision = "20260313_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS dev_meta")
    op.execute("ALTER TABLE public.plan_registry SET SCHEMA dev_meta")
    op.execute("ALTER TABLE public.plan_sync_runs SET SCHEMA dev_meta")
    op.execute("ALTER TABLE public.plan_events SET SCHEMA dev_meta")


def downgrade() -> None:
    op.execute("ALTER TABLE dev_meta.plan_events SET SCHEMA public")
    op.execute("ALTER TABLE dev_meta.plan_sync_runs SET SCHEMA public")
    op.execute("ALTER TABLE dev_meta.plan_registry SET SCHEMA public")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'dev_meta'
            ) THEN
                EXECUTE 'DROP SCHEMA IF EXISTS dev_meta';
            END IF;
        END $$;
        """
    )
