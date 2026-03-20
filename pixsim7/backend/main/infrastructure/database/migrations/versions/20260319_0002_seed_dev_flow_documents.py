"""Seed dev flow templates into documents.

Revision ID: 20260319_0002
Revises: 20260319_0001
Create Date: 2026-03-19
"""

from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from alembic import op


revision = "20260319_0002"
down_revision = "20260319_0001"
branch_labels = None
depends_on = None

SCHEMA = "dev_meta"
FLOW_TEMPLATE_NAMESPACE = "dev/flows/templates"
FLOW_TEMPLATE_DOC_TYPE = "flow_template"
FLOW_TEMPLATE_EXTRA_KEY = "flow_template"


def _templates() -> list[dict]:
    return [
        {
            "id": "character.create.basic",
            "label": "Character Create (Basic)",
            "domain": "character",
            "start_node_id": "character_creator_panel",
            "tags": ["starter", "character", "creation"],
            "nodes": [
                {
                    "id": "character_creator_panel",
                    "kind": "panel",
                    "label": "Character Creator",
                    "ref": "character_creator",
                },
                {
                    "id": "character_assets_step",
                    "kind": "action",
                    "label": "Portrait and Assets",
                    "ref": "character_assets",
                },
                {
                    "id": "character_roles_bindings_step",
                    "kind": "action",
                    "label": "Roles and Bindings",
                    "ref": "roles_bindings",
                },
                {
                    "id": "character_ready_gate",
                    "kind": "gate",
                    "label": "Character Ready",
                    "ref": "character_ready",
                },
            ],
            "edges": [
                {
                    "id": "character_creator_to_assets",
                    "from": "character_creator_panel",
                    "to": "character_assets_step",
                },
                {
                    "id": "character_assets_to_roles",
                    "from": "character_assets_step",
                    "to": "character_roles_bindings_step",
                },
                {
                    "id": "character_roles_to_ready",
                    "from": "character_roles_bindings_step",
                    "to": "character_ready_gate",
                },
            ],
        },
        {
            "id": "scene.create.from_scene_prep",
            "label": "Scene Create from Scene Prep",
            "domain": "scene",
            "start_node_id": "scene_prep_panel",
            "tags": ["starter", "scene", "scene_prep"],
            "nodes": [
                {
                    "id": "scene_prep_panel",
                    "kind": "panel",
                    "label": "Scene Prep",
                    "ref": "scene_prep",
                },
                {
                    "id": "scene_generation_action",
                    "kind": "action",
                    "label": "Generation",
                    "ref": "scene_generation",
                },
                {
                    "id": "scene_output_selection",
                    "kind": "action",
                    "label": "Select Outputs",
                    "ref": "scene_outputs",
                },
                {
                    "id": "scene_create_api",
                    "kind": "api",
                    "label": "Create or Update GameScene",
                    "ref": "/api/v1/game-scenes",
                },
            ],
            "edges": [
                {
                    "id": "scene_prep_to_generation",
                    "from": "scene_prep_panel",
                    "to": "scene_generation_action",
                    "condition": "requires_world",
                    "on_fail_reason": "Select a world before running scene generation.",
                },
                {
                    "id": "scene_generation_to_selection",
                    "from": "scene_generation_action",
                    "to": "scene_output_selection",
                    "condition": "requires_generation_capability",
                    "on_fail_reason": "Generation capability is required for this step.",
                },
                {
                    "id": "scene_selection_to_create",
                    "from": "scene_output_selection",
                    "to": "scene_create_api",
                    "condition": "requires_location",
                    "on_fail_reason": "Choose a location before creating a scene.",
                },
            ],
        },
        {
            "id": "scene.create.from_room_nav",
            "label": "Scene Create from Room Navigation",
            "domain": "scene",
            "start_node_id": "room_navigation_panel",
            "tags": ["starter", "scene", "room_navigation"],
            "nodes": [
                {
                    "id": "room_navigation_panel",
                    "kind": "panel",
                    "label": "GameWorld Room Navigation",
                    "ref": "room_navigation",
                },
                {
                    "id": "checkpoint_traversal_step",
                    "kind": "action",
                    "label": "Checkpoint Traversal",
                    "ref": "checkpoint_traversal",
                },
                {
                    "id": "scene_plan_step",
                    "kind": "action",
                    "label": "Scene Plan",
                    "ref": "scene_plan",
                },
                {
                    "id": "room_nav_generation_step",
                    "kind": "api",
                    "label": "Generation",
                    "ref": "/api/v1/generations",
                },
                {
                    "id": "room_nav_scene_create_step",
                    "kind": "api",
                    "label": "Create Scene",
                    "ref": "/api/v1/game-scenes",
                },
            ],
            "edges": [
                {
                    "id": "room_nav_to_checkpoint",
                    "from": "room_navigation_panel",
                    "to": "checkpoint_traversal_step",
                    "condition": "requires_room_navigation",
                    "on_fail_reason": "Room navigation must be enabled for this flow.",
                },
                {
                    "id": "checkpoint_to_scene_plan",
                    "from": "checkpoint_traversal_step",
                    "to": "scene_plan_step",
                    "condition": "requires_location",
                    "on_fail_reason": "A location is needed to build a scene plan.",
                },
                {
                    "id": "scene_plan_to_generation",
                    "from": "scene_plan_step",
                    "to": "room_nav_generation_step",
                    "condition": "requires_generation_capability",
                    "on_fail_reason": "Generation capability is required for this step.",
                },
                {
                    "id": "room_nav_generation_to_scene_create",
                    "from": "room_nav_generation_step",
                    "to": "room_nav_scene_create_step",
                    "condition": "requires_world",
                    "on_fail_reason": "Select a world before creating a scene.",
                },
            ],
        },
        {
            "id": "asset.generate.quick",
            "label": "Quick Asset Generation",
            "domain": "generation",
            "start_node_id": "quickgen_prompt_panel",
            "tags": ["starter", "asset", "quickgen"],
            "nodes": [
                {
                    "id": "quickgen_prompt_panel",
                    "kind": "panel",
                    "label": "QuickGen Prompt and Settings",
                    "ref": "quickgen",
                },
                {
                    "id": "quickgen_generate_action",
                    "kind": "action",
                    "label": "Generate",
                    "ref": "quickgen_generate",
                },
                {
                    "id": "quickgen_gallery_panel",
                    "kind": "panel",
                    "label": "Gallery",
                    "ref": "asset_gallery",
                },
                {
                    "id": "quickgen_reuse_action",
                    "kind": "action",
                    "label": "Reuse Asset",
                    "ref": "asset_reuse",
                },
            ],
            "edges": [
                {
                    "id": "quickgen_prompt_to_generate",
                    "from": "quickgen_prompt_panel",
                    "to": "quickgen_generate_action",
                    "condition": "requires_generation_capability",
                    "on_fail_reason": "Generation capability is required for quick generation.",
                },
                {
                    "id": "quickgen_generate_to_gallery",
                    "from": "quickgen_generate_action",
                    "to": "quickgen_gallery_panel",
                },
                {
                    "id": "quickgen_gallery_to_reuse",
                    "from": "quickgen_gallery_panel",
                    "to": "quickgen_reuse_action",
                },
            ],
        },
    ]


def _document_rows(now: datetime) -> list[dict]:
    rows: list[dict] = []
    for template in _templates():
        rows.append(
            {
                "id": f"flow:{template['id']}",
                "doc_type": FLOW_TEMPLATE_DOC_TYPE,
                "title": str(template["label"]),
                "status": "active",
                "owner": "system:dev-flows",
                "summary": f"Journey flow template {template['id']}",
                "markdown": None,
                "user_id": None,
                "visibility": "public",
                "namespace": FLOW_TEMPLATE_NAMESPACE,
                "tags": list(template.get("tags") or []),
                "extra": {FLOW_TEMPLATE_EXTRA_KEY: template},
                "revision": 1,
                "created_at": now,
                "updated_at": now,
            }
        )
    return rows


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.utcnow()
    rows = _document_rows(now)

    documents = sa.Table(
        "documents",
        sa.MetaData(),
        sa.Column("id", sa.String(length=120)),
        sa.Column("doc_type", sa.String(length=32)),
        sa.Column("title", sa.String(length=255)),
        sa.Column("status", sa.String(length=32)),
        sa.Column("owner", sa.String(length=120)),
        sa.Column("summary", sa.Text()),
        sa.Column("markdown", sa.Text()),
        sa.Column("user_id", sa.Integer()),
        sa.Column("visibility", sa.String(length=32)),
        sa.Column("namespace", sa.String(length=255)),
        sa.Column("tags", sa.JSON()),
        sa.Column("extra", sa.JSON()),
        sa.Column("revision", sa.Integer()),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("updated_at", sa.DateTime()),
        schema=SCHEMA,
    )

    for row in rows:
        existing = conn.execute(
            sa.select(documents.c.id).where(documents.c.id == row["id"])
        ).first()
        if existing is not None:
            continue
        conn.execute(sa.insert(documents).values(**row))


def downgrade() -> None:
    conn = op.get_bind()
    documents = sa.Table(
        "documents",
        sa.MetaData(),
        sa.Column("id", sa.String(length=120)),
        schema=SCHEMA,
    )
    ids = [f"flow:{template['id']}" for template in _templates()]
    conn.execute(sa.delete(documents).where(documents.c.id.in_(ids)))
