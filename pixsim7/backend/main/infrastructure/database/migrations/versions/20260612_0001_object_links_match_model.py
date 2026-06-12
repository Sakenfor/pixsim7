"""Rebuild object_links to match the ObjectLink model

The ObjectLink SQLModel (domain/links.py) and the physical table drifted
apart: the model declares ``link_id`` / ``template_kind`` / ``runtime_kind``
/ ``meta`` with ``runtime_id`` as integer, while the table (carried through
the baseline squash) still had ``id`` / ``template_type`` / ``runtime_type``
with ``runtime_id varchar`` plus a legacy ``field_mappings`` column. Every
ObjectLink query failed with UndefinedColumnError, so the links subsystem
(template->runtime resolution, link integrity) never worked at runtime and
the table is empty — drop and recreate to the model's exact shape instead of
a chain of ALTERs.

All live code (LinkIntegrityService, template resolver, game_links API,
frontend TemplateKind vocabulary) already uses the model-side names; only
the old migrations reference the table-side names.

See plan ``game-editing-panels-hardening`` (ObjectLink schema drift).

Revision ID: 20260612_0001
Revises: 20260608_0001
Create Date: 2026-06-12
"""
from alembic import op


revision = "20260612_0001"
down_revision = "20260608_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS object_links")
    op.execute(
        """
        CREATE TABLE object_links (
            link_id uuid NOT NULL,
            template_kind varchar(50) NOT NULL,
            template_id varchar(255) NOT NULL,
            runtime_kind varchar(50) NOT NULL,
            runtime_id integer NOT NULL,
            sync_enabled boolean NOT NULL DEFAULT true,
            sync_direction varchar(50) NOT NULL DEFAULT 'bidirectional',
            mapping_id varchar(100),
            sync_field_mappings jsonb,
            priority integer NOT NULL DEFAULT 0,
            activation_conditions jsonb,
            meta jsonb,
            created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_synced_at timestamp,
            last_sync_direction varchar(50),
            CONSTRAINT object_links_pkey PRIMARY KEY (link_id)
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_object_links_template ON object_links (template_kind, template_id)"
    )
    op.execute(
        "CREATE INDEX ix_object_links_runtime ON object_links (runtime_kind, runtime_id)"
    )
    op.execute("CREATE INDEX ix_object_links_mapping_id ON object_links (mapping_id)")
    op.execute(
        "CREATE INDEX ix_object_links_priority ON object_links (runtime_kind, runtime_id, priority)"
    )


def downgrade() -> None:
    # Restore the pre-drift shape from the baseline squash (also empty).
    op.execute("DROP TABLE IF EXISTS object_links")
    op.execute(
        """
        CREATE TABLE object_links (
            id uuid NOT NULL,
            template_type varchar(100) NOT NULL,
            template_id varchar(255) NOT NULL,
            runtime_type varchar(100) NOT NULL,
            runtime_id varchar(255) NOT NULL,
            mapping_id varchar(100),
            sync_enabled boolean NOT NULL DEFAULT true,
            sync_direction varchar(50) NOT NULL DEFAULT 'bidirectional',
            field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
            priority integer NOT NULL DEFAULT 0,
            activation_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
            last_synced_at timestamp,
            last_sync_direction varchar(50),
            sync_field_mappings jsonb,
            created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT object_links_pkey PRIMARY KEY (id)
        )
        """
    )
    op.execute(
        "CREATE INDEX ix_object_links_activation ON object_links (sync_enabled)"
    )
    op.execute("CREATE INDEX ix_object_links_mapping_id ON object_links (mapping_id)")
    op.execute(
        "CREATE INDEX ix_object_links_priority ON object_links (template_type, runtime_type, priority)"
    )
    op.execute(
        "CREATE INDEX ix_object_links_runtime ON object_links (runtime_type, runtime_id)"
    )
    op.execute(
        "CREATE INDEX ix_object_links_template ON object_links (template_type, template_id)"
    )
