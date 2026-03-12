"""
Journey Flow template registry (v1).

Templates are curated and manifest-driven. Route handlers should consume this
module instead of embedding template arrays inline.
"""

from typing import List

from .dev_flows_contract import FlowTemplate


FLOW_TEMPLATES: List[FlowTemplate] = [
    FlowTemplate(
        id="character.create.basic",
        label="Character Create (Basic)",
        domain="character",
        start_node_id="character_creator_panel",
        tags=["starter", "character", "creation"],
        nodes=[
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
        edges=[
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
    ),
    FlowTemplate(
        id="scene.create.from_scene_prep",
        label="Scene Create from Scene Prep",
        domain="scene",
        start_node_id="scene_prep_panel",
        tags=["starter", "scene", "scene_prep"],
        nodes=[
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
        edges=[
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
    ),
    FlowTemplate(
        id="scene.create.from_room_nav",
        label="Scene Create from Room Navigation",
        domain="scene",
        start_node_id="room_navigation_panel",
        tags=["starter", "scene", "room_navigation"],
        nodes=[
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
        edges=[
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
    ),
    FlowTemplate(
        id="asset.generate.quick",
        label="Quick Asset Generation",
        domain="generation",
        start_node_id="quickgen_prompt_panel",
        tags=["starter", "asset", "quickgen"],
        nodes=[
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
        edges=[
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
    ),
]


def get_flow_templates() -> List[FlowTemplate]:
    """Return deep copies so request-local mutation cannot affect registry state."""
    return [template.model_copy(deep=True) for template in FLOW_TEMPLATES]
