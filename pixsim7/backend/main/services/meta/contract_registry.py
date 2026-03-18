"""
Meta Contract Registry.

Central registry for machine-readable API contract surfaces.  Each contract
declares what it provides and what other contracts it relates to, forming a
navigable discovery graph.

Built-in contracts are seeded on init.  Plugins can register additional
contracts via the CONTRACTS_REGISTER hook.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry


@dataclass
class MetaContractEndpoint:
    """An endpoint exposed by a meta contract."""

    id: str
    method: str
    path: str
    summary: str
    auth_required: Optional[bool] = None
    requires_admin: bool = False
    permissions: List[str] = field(default_factory=list)
    availability: Dict[str, Any] = field(
        default_factory=lambda: {
            "status": "available",
            "reason": None,
            "conditions": [],
        }
    )
    input_schema: Optional[Dict[str, Any]] = None
    output_schema: Optional[Dict[str, Any]] = None
    tags: List[str] = field(default_factory=list)


@dataclass
class MetaContract:
    """A registered meta contract surface."""

    id: str
    name: str
    version: str
    endpoint: Optional[str] = None
    auth_required: bool = True
    owner: str = ""
    summary: str = ""
    audience: List[str] = field(default_factory=lambda: ["user", "dev"])
    provides: List[str] = field(default_factory=list)
    relates_to: List[str] = field(default_factory=list)
    sub_endpoints: List[MetaContractEndpoint] = field(default_factory=list)
    source_plugin_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Built-in contract definitions (versions injected at registration time)
# ---------------------------------------------------------------------------


def _builtin_prompts_analysis(version: str = "unknown") -> MetaContract:
    return MetaContract(
        id="prompts.analysis",
        name="Prompt Analysis Contract",
        endpoint="/api/v1/prompts/meta/analysis-contract",
        version=version,
        auth_required=True,
        owner="prompt-analyzer lane",
        summary=(
            "Analyzer selection order, request/response schema, prompt analyzer "
            "catalog, deprecations, and examples."
        ),
        provides=["prompt_analysis", "analyzer_catalog", "analyzer_presets"],
        relates_to=["prompts.authoring", "plans.management"],
    )


def _builtin_prompts_authoring(version: str = "unknown") -> MetaContract:
    return MetaContract(
        id="prompts.authoring",
        name="Prompt Authoring Contract",
        endpoint="/api/v1/prompts/meta/authoring-contract",
        version=version,
        auth_required=True,
        owner="prompt-authoring lane",
        summary=(
            "Prompt family/version authoring workflows, request schemas, "
            "pre-authoring checks, constraints, idempotency, and examples. "
            "Includes CRUD for families (create, read, update) and versions "
            "(create, read, apply-edit), generation hints per authoring mode, "
            "and category-driven mode resolution."
        ),
        audience=["user", "dev", "agent"],
        provides=[
            "prompt_families",
            "prompt_family_crud",
            "prompt_versions",
            "authoring_workflows",
            "authoring_modes",
            "generation_hints",
            "valid_values",
        ],
        relates_to=["prompts.analysis", "blocks.discovery", "user.assistant"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="prompts.list_families",
                method="GET",
                path="/api/v1/prompts/families",
                summary="List prompt families. Filter by prompt_type, category, is_active.",
                tags=["families", "read"],
            ),
            MetaContractEndpoint(
                id="prompts.get_family",
                method="GET",
                path="/api/v1/prompts/families/{family_id}",
                summary="Get a single family by ID with version count.",
                tags=["families", "read"],
            ),
            MetaContractEndpoint(
                id="prompts.create_family",
                method="POST",
                path="/api/v1/prompts/families",
                summary="Create a prompt family container.",
                tags=["families", "write"],
            ),
            MetaContractEndpoint(
                id="prompts.update_family",
                method="PATCH",
                path="/api/v1/prompts/families/{family_id}",
                summary=(
                    "Partial update on a family. Send only fields to change: "
                    "title, description, category, tags, is_active."
                ),
                tags=["families", "write"],
            ),
            MetaContractEndpoint(
                id="prompts.list_versions",
                method="GET",
                path="/api/v1/prompts/families/{family_id}/versions",
                summary="List versions for a family.",
                tags=["versions", "read"],
            ),
            MetaContractEndpoint(
                id="prompts.get_version",
                method="GET",
                path="/api/v1/prompts/versions/{version_id}",
                summary="Get a single version with full prompt_text.",
                tags=["versions", "read"],
            ),
            MetaContractEndpoint(
                id="prompts.create_version",
                method="POST",
                path="/api/v1/prompts/families/{family_id}/versions",
                summary="Create a version under a family with optional prompt_analysis.",
                tags=["versions", "write"],
            ),
            MetaContractEndpoint(
                id="prompts.apply_edit",
                method="POST",
                path="/api/v1/prompts/versions/{version_id}/apply-edit",
                summary="Apply edits to a version, creating a child version.",
                tags=["versions", "write"],
            ),
            MetaContractEndpoint(
                id="prompts.analyze",
                method="POST",
                path="/api/v1/prompts/analyze",
                summary="Analyze raw prompt text before persistence.",
                tags=["analysis"],
            ),
            MetaContractEndpoint(
                id="prompts.search_similar",
                method="GET",
                path="/api/v1/prompts/search/similar",
                summary="Find similar prompts by text similarity.",
                tags=["discovery"],
            ),
        ],
    )


def _builtin_blocks_discovery() -> MetaContract:
    return MetaContract(
        id="blocks.discovery",
        name="Block Primitives Discovery",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="block-templates lane",
        summary=(
            "Discovery surface for block primitives: tag vocabulary, catalog, "
            "category/role matrix, content packs, and composition roles."
        ),
        provides=[
            "tag_vocabulary",
            "block_catalog",
            "block_matrix",
            "content_packs",
            "composition_roles",
            "vocabulary_governance",
            "planning_ir",
            "primitive_effectiveness",
        ],
        relates_to=["prompts.authoring", "prompts.analysis", "plans.management"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="blocks.tag_dictionary",
                method="GET",
                path="/api/v1/block-templates/meta/blocks/tag-dictionary",
                summary="Canonical tag dictionary with keys, values, and usage stats.",
            ),
            MetaContractEndpoint(
                id="blocks.catalog",
                method="GET",
                path="/api/v1/block-templates/meta/blocks/catalog",
                summary="High-level catalog of all primitives by category.",
            ),
            MetaContractEndpoint(
                id="blocks.matrix",
                method="GET",
                path="/api/v1/block-templates/meta/blocks/matrix",
                summary="Category x role matrix showing what slots are populated.",
            ),
            MetaContractEndpoint(
                id="blocks.content_packs",
                method="GET",
                path="/api/v1/block-templates/meta/content-packs/manifests",
                summary="Loaded content pack manifests with block counts.",
            ),
            MetaContractEndpoint(
                id="blocks.roles",
                method="GET",
                path="/api/v1/block-templates/blocks/roles",
                summary="Available composition roles for block primitives.",
            ),
            MetaContractEndpoint(
                id="blocks.tags",
                method="GET",
                path="/api/v1/block-templates/blocks/tags",
                summary="Compact tag key to values index.",
            ),
            MetaContractEndpoint(
                id="blocks.vocabulary_validate",
                method="POST",
                path="/api/v1/block-templates/meta/vocabulary/validate",
                summary="Validate tags and ontology IDs against canonical vocabulary.",
            ),
            MetaContractEndpoint(
                id="blocks.vocabulary_suggest",
                method="GET",
                path="/api/v1/block-templates/meta/vocabulary/suggest",
                summary="Suggest canonical tags based on partial input.",
            ),
        ],
    )


def _builtin_plans_management() -> MetaContract:
    return MetaContract(
        id="plans.management",
        name="Plan Management",
        endpoint=None,
        version="2.3.0",
        auth_required=True,
        owner="devtools lane",
        summary=(
            "Plan registry backed by Document base entity. Create, browse, "
            "update plans with hierarchy (parent/children), checkpoints, "
            "companion docs, and AI agent work assignment."
        ),
        provides=[
            "plan_registry",
            "plan_creation",
            "plan_hierarchy",
            "plan_status_management",
            "plan_documents",
            "plan_activity",
            "plan_sync",
            "agent_assignment",
        ],
        relates_to=["devtools.codegen", "ui.catalog"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="plans.agent_context",
                method="GET",
                path="/api/v1/dev/plans/agent-context",
                summary=(
                    "Start here. Full work package for AI agent: current assignment, "
                    "all active plans, and available API actions with request schemas."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "plan_id": {
                                    "type": "string",
                                    "description": "Optional specific plan to fetch instead of auto-assignment.",
                                },
                            },
                        },
                    },
                },
                tags=["agent", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.create",
                method="POST",
                path="/api/v1/dev/plans",
                summary="Create a new plan (Document + PlanRegistry). Supports parent_id for sub-plans.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "required": ["id", "title"],
                            "properties": {
                                "id": {"type": "string"},
                                "title": {"type": "string"},
                                "plan_type": {"type": "string"},
                                "status": {"type": "string"},
                                "stage": {"type": "string"},
                                "owner": {"type": "string"},
                                "priority": {"type": "string"},
                                "summary": {"type": "string"},
                                "markdown": {"type": "string"},
                                "task_scope": {"type": "string"},
                                "visibility": {"type": "string"},
                                "target": {"type": "object"},
                                "checkpoints": {"type": "array", "items": {"type": "object"}},
                                "tags": {"type": "array", "items": {"type": "string"}},
                                "code_paths": {"type": "array", "items": {"type": "string"}},
                                "companions": {"type": "array", "items": {"type": "string"}},
                                "handoffs": {"type": "array", "items": {"type": "string"}},
                                "depends_on": {"type": "array", "items": {"type": "string"}},
                                "parent_id": {"type": "string"},
                            },
                        },
                    },
                    "required": ["body"],
                },
                tags=["create", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.list",
                method="GET",
                path="/api/v1/dev/plans",
                summary="List all plans with children, filterable by status/owner.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "status": {"type": "string"},
                                "owner": {"type": "string"},
                                "refresh": {"type": "boolean"},
                            },
                        },
                    },
                },
                tags=["list", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.detail",
                method="GET",
                path="/api/v1/dev/plans/{plan_id}",
                summary="Get plan with full metadata, markdown, checkpoints, and children.",
                tags=["read", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.update",
                method="PATCH",
                path="/api/v1/dev/plans/update/{plan_id}",
                summary="Update plan fields: title/status/stage/owner/priority/summary/markdown plus tags, code paths, companions, handoffs, and dependencies.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string"},
                        "body": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "status": {"type": "string"},
                                "stage": {"type": "string"},
                                "task_scope": {"type": "string"},
                                "plan_type": {"type": "string"},
                                "owner": {"type": "string"},
                                "priority": {"type": "string"},
                                "summary": {"type": "string"},
                                "markdown": {"type": "string"},
                                "visibility": {"type": "string"},
                                "target": {"type": "object"},
                                "checkpoints": {"type": "array", "items": {"type": "object"}},
                                "tags": {"type": "array", "items": {"type": "string"}},
                                "code_paths": {"type": "array", "items": {"type": "string"}},
                                "companions": {"type": "array", "items": {"type": "string"}},
                                "handoffs": {"type": "array", "items": {"type": "string"}},
                                "depends_on": {"type": "array", "items": {"type": "string"}},
                                "patch": {"type": "object"},
                            },
                        },
                    },
                    "required": ["plan_id", "body"],
                },
                tags=["update", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.progress",
                method="POST",
                path="/api/v1/dev/plans/progress/{plan_id}",
                summary=(
                    "Log in-flight checkpoint progress using point deltas and execution metadata "
                    "(status/owner/eta/blockers/evidence) with consistent checkpoint updates."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "plan_id": {"type": "string"},
                        "body": {
                            "type": "object",
                            "required": ["checkpoint_id"],
                            "properties": {
                                "checkpoint_id": {"type": "string"},
                                "points_delta": {"type": "integer"},
                                "points_done": {"type": "integer"},
                                "points_total": {"type": "integer"},
                                "status": {"type": "string", "enum": ["pending", "active", "done", "blocked"]},
                                "owner": {"type": "string"},
                                "eta": {"type": "string"},
                                "blockers": {"type": "array", "items": {"type": "object"}},
                                "append_evidence": {"type": "array", "items": {"type": "string"}},
                                "note": {"type": "string"},
                                "sync_plan_stage": {"type": "boolean"},
                            },
                        },
                    },
                    "required": ["plan_id", "body"],
                },
                tags=["update", "progress", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.documents",
                method="GET",
                path="/api/v1/dev/plans/documents/{plan_id}",
                summary="Companion and handoff documents for a plan.",
                tags=["read", "docs", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.activity",
                method="GET",
                path="/api/v1/dev/plans/activity",
                summary="Recent change activity across all plans (default 7-day lookback).",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "days": {"type": "integer"},
                                "limit": {"type": "integer"},
                            },
                        },
                    },
                },
                tags=["activity", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.settings_get",
                method="GET",
                path="/api/v1/dev/plans/settings",
                summary="Read runtime plan mode flags, including DB-only mode.",
                tags=["settings", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.settings_update",
                method="PATCH",
                path="/api/v1/dev/plans/settings",
                summary="Toggle runtime plan mode flags (admin, applies to current backend process).",
                requires_admin=True,
                permissions=["admin"],
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "required": ["plans_db_only_mode"],
                            "properties": {
                                "plans_db_only_mode": {"type": "boolean"},
                            },
                        },
                    },
                    "required": ["body"],
                },
                tags=["settings", "admin", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.sync",
                method="POST",
                path="/api/v1/dev/plans/sync",
                summary="Sync filesystem plan manifests into the DB (disabled when PLANS_DB_ONLY_MODE=1).",
                requires_admin=True,
                permissions=["admin"],
                availability={
                    "status": "conditional",
                    "reason": "Only available when DB-only mode is disabled.",
                    "conditions": ["settings.plans_db_only_mode == false"],
                },
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "commit_sha": {"type": "string"},
                            },
                        },
                    },
                },
                tags=["sync", "admin", "planning"],
            ),
        ],
    )


def _builtin_game_authoring(version: str = "unknown") -> MetaContract:
    return MetaContract(
        id="game.authoring",
        name="Game Authoring Contract",
        endpoint="/api/v1/game/meta/authoring-contract",
        version=version,
        auth_required=True,
        owner="game authoring lane",
        summary=(
            "Canonical API workflow contract for world bootstrap, behavior setup, "
            "project snapshots, and agent-driven game iteration."
        ),
        provides=[
            "world_bootstrap_workflows",
            "behavior_authoring_workflows",
            "project_snapshot_iteration",
            "project_discovery",
            "seed_profile_guidance",
            "idempotency_guidance",
        ],
        relates_to=[
            "blocks.discovery",
            "prompts.authoring",
            "user.assistant",
            "plans.management",
        ],
        sub_endpoints=[
            MetaContractEndpoint(
                id="game.meta.authoring_contract",
                method="GET",
                path="/api/v1/game/meta/authoring-contract",
                summary="Machine-readable workflow contract for game creation and iteration.",
            ),
        ],
    )


def _builtin_notifications() -> MetaContract:
    return MetaContract(
        id="notifications",
        name="Notifications",
        endpoint=None,
        version="2.0.0",
        auth_required=True,
        owner="platform",
        summary=(
            "Structured notification contract — all writes require event_type. "
            "Dynamic read-time rendering and category granularity preferences. "
            "POST /notifications/emit is the primary write path."
        ),
        provides=[
            "notification_list",
            "notification_structured_emit",
            "notification_structured_write_policy",
            "notification_event_types",
            "notification_read_status",
            "notification_categories",
        ],
        relates_to=["plans.management", "user.assistant"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="notifications.categories",
                method="GET",
                path="/api/v1/notifications/categories",
                summary="List all notification categories with defaults and user's current granularity selections.",
            ),
            MetaContractEndpoint(
                id="notifications.list",
                method="GET",
                path="/api/v1/notifications",
                summary="List notifications for current user (broadcasts + targeted). Supports category filter, unread_only, and include_suppressed.",
            ),
            MetaContractEndpoint(
                id="notifications.create",
                method="POST",
                path="/api/v1/notifications",
                summary="Deprecated — use notifications.emit. Stamps event_type='notification.manual' automatically.",
                tags=["write", "legacy", "deprecated"],
            ),
            MetaContractEndpoint(
                id="notifications.emit",
                method="POST",
                path="/api/v1/notifications/emit",
                summary=(
                    "Structured emit endpoint for agents/integrations. "
                    "Requires event_type + payload; known events are validated."
                ),
                input_schema={
                    "type": "object",
                    "required": ["body"],
                    "properties": {
                        "body": {
                            "type": "object",
                            "required": ["event_type"],
                            "properties": {
                                "event_type": {
                                    "type": "string",
                                    "description": "Event identifier (e.g. plan.created, plan.updated).",
                                },
                                "category": {"type": "string"},
                                "severity": {"type": "string"},
                                "source": {"type": "string"},
                                "ref_type": {"type": "string"},
                                "ref_id": {"type": "string"},
                                "broadcast": {"type": "boolean"},
                                "user_id": {"type": "integer"},
                                "actor_name": {"type": "string"},
                                "actor_user_id": {"type": "integer"},
                                "title": {
                                    "type": "string",
                                    "description": "Required only for custom event types.",
                                },
                                "body": {"type": "string"},
                                "payload": {
                                    "type": "object",
                                    "description": (
                                        "Structured event payload. Built-in plan events expect "
                                        "payload.planTitle (plan.created) and payload.changes "
                                        "(plan.updated)."
                                    ),
                                },
                            },
                        }
                    },
                },
                tags=["write", "structured", "agent"],
            ),
            MetaContractEndpoint(
                id="notifications.mark_read",
                method="PATCH",
                path="/api/v1/notifications/{notification_id}/read",
                summary="Mark a single notification as read.",
            ),
            MetaContractEndpoint(
                id="notifications.mark_all_read",
                method="POST",
                path="/api/v1/notifications/mark-all-read",
                summary="Mark all notifications as read for the current user.",
            ),
        ],
    )


def _builtin_devtools_codegen() -> MetaContract:
    return MetaContract(
        id="devtools.codegen",
        name="Developer Tasks & Codegen",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="devtools lane",
        audience=["dev"],
        summary=(
            "Code generation tasks, database migrations, and developer utilities. "
            "Tasks discovered from tools/codegen/manifest.ts."
        ),
        provides=[
            "codegen_tasks",
            "migration_management",
            "test_runner",
        ],
        relates_to=["plans.management"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="codegen.tasks",
                method="GET",
                path="/api/v1/devtools/codegen/tasks",
                summary="List available codegen tasks.",
            ),
            MetaContractEndpoint(
                id="codegen.run",
                method="POST",
                path="/api/v1/devtools/codegen/run",
                summary="Execute a codegen task.",
            ),
            MetaContractEndpoint(
                id="codegen.migrations_status",
                method="GET",
                path="/api/v1/devtools/codegen/migrations/status",
                summary="Database migration status across all scopes.",
            ),
        ],
    )


def _builtin_ui_catalog() -> MetaContract:
    return MetaContract(
        id="ui.catalog",
        name="UI Component Catalog",
        endpoint="/api/v1/meta/ui/contract",
        version="1.0.0",
        auth_required=False,
        owner="frontend lane",
        audience=["dev", "agent"],
        summary=(
            "Queryable catalog of UI components, composition patterns, and "
            "agent guidance. Backend-owned source of truth — agents query "
            "these endpoints instead of parsing the generated JSON file."
        ),
        provides=[
            "ui_components",
            "ui_patterns",
            "ui_guidance",
            "overlay_widget_api",
            "badge_system",
        ],
        relates_to=["devtools.codegen", "plans.management"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="ui.contract",
                method="GET",
                path="/api/v1/meta/ui/contract",
                summary="Catalog summary: counts, categories, version.",
                auth_required=False,
                tags=["discovery"],
            ),
            MetaContractEndpoint(
                id="ui.components",
                method="GET",
                path="/api/v1/meta/ui/components",
                summary="List/search UI components. Supports ?q= and ?category= filters.",
                auth_required=False,
                tags=["components"],
            ),
            MetaContractEndpoint(
                id="ui.component_detail",
                method="GET",
                path="/api/v1/meta/ui/components/{component_id}",
                summary="Single component with exports, examples, and use_instead_of.",
                auth_required=False,
                tags=["components"],
            ),
            MetaContractEndpoint(
                id="ui.patterns",
                method="GET",
                path="/api/v1/meta/ui/patterns",
                summary="Composition patterns (sidebar, overlay, filterable list). Supports ?topic= filter.",
                auth_required=False,
                tags=["patterns"],
            ),
            MetaContractEndpoint(
                id="ui.pattern_detail",
                method="GET",
                path="/api/v1/meta/ui/patterns/{pattern_id}",
                summary="Single pattern with step-by-step recipe.",
                auth_required=False,
                tags=["patterns"],
            ),
            MetaContractEndpoint(
                id="ui.guidance",
                method="GET",
                path="/api/v1/meta/ui/guidance",
                summary="Agent coding rules and pre-coding checklist.",
                auth_required=False,
                tags=["guidance"],
            ),
        ],
    )


def _builtin_user_assistant() -> MetaContract:
    return MetaContract(
        id="user.assistant",
        name="User AI Assistant",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="user-experience lane",
        summary=(
            "User-facing AI assistant capabilities: asset management, "
            "generation, scene editing, character work, and project help."
        ),
        provides=[
            "asset_browsing",
            "asset_editing",
            "generation_assistance",
            "scene_management",
            "character_assistance",
            "prompt_authoring",
        ],
        relates_to=["prompts.authoring", "blocks.discovery"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="user.assets.list",
                method="POST",
                path="/api/v1/assets/search",
                summary="Browse and search user assets with filters.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "body": {
                            "type": "object",
                            "description": "AssetSearchRequest payload (filters, pagination, query).",
                        },
                    },
                    "required": ["body"],
                },
            ),
            MetaContractEndpoint(
                id="user.assets.analyze",
                method="POST",
                path="/api/v1/assets/{asset_id}/enrich",
                summary="Run asset enrichment/analysis for a single asset.",
            ),
            MetaContractEndpoint(
                id="user.generations.create",
                method="POST",
                path="/api/v1/generations",
                summary="Create a new generation (image/video).",
            ),
            MetaContractEndpoint(
                id="user.generations.list",
                method="GET",
                path="/api/v1/generations",
                summary="List user's generations with status.",
            ),
            MetaContractEndpoint(
                id="user.prompts.families",
                method="GET",
                path="/api/v1/prompts/families",
                summary="Browse prompt families for authoring.",
            ),
            MetaContractEndpoint(
                id="user.scenes.list",
                method="GET",
                path="/api/v1/game/scenes/{scene_id}",
                summary="Fetch a scene graph by scene ID.",
            ),
            MetaContractEndpoint(
                id="user.characters.list",
                method="GET",
                path="/api/v1/characters",
                summary="List characters in the current world.",
            ),
            MetaContractEndpoint(
                id="user.assistant.send",
                method="POST",
                path="/api/v1/meta/agents/bridge/send",
                summary="Send a message to the AI assistant.",
            ),
        ],
    )


def _builtin_testing_catalog() -> MetaContract:
    return MetaContract(
        id="testing.catalog",
        name="Test Suite Catalog",
        endpoint="/api/v1/dev/testing/contract",
        version="1.0.0",
        auth_required=False,
        owner="platform",
        audience=["dev", "agent"],
        summary=(
            "Live test suite discovery, conventions, and coverage-gap detection. "
            "Suites self-register via TEST_SUITE dict literals (AST-extracted). "
            "Agents query guidance and coverage endpoints when creating tests."
        ),
        provides=[
            "test_suites",
            "test_guidance",
            "test_conventions",
            "coverage_gaps",
            "plan_evidence_linking",
        ],
        relates_to=["plans.management", "devtools.codegen", "ui.catalog"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="testing.contract",
                method="GET",
                path="/api/v1/dev/testing/contract",
                summary="Catalog summary: suite count, layers, kinds, categories.",
                auth_required=False,
                tags=["discovery"],
            ),
            MetaContractEndpoint(
                id="testing.catalog",
                method="GET",
                path="/api/v1/dev/testing/catalog",
                summary="List/filter test suites. Supports ?layer=, ?category=, ?kind= filters.",
                auth_required=False,
                tags=["suites"],
            ),
            MetaContractEndpoint(
                id="testing.validate",
                method="GET",
                path="/api/v1/dev/testing/catalog/validate",
                summary="Validate all suite metadata (paths exist, required fields).",
                auth_required=False,
                tags=["validation"],
            ),
            MetaContractEndpoint(
                id="testing.guidance",
                method="GET",
                path="/api/v1/dev/testing/guidance",
                summary="Conventions, TEST_SUITE template, and pre-creation checklist for agents.",
                auth_required=False,
                tags=["guidance"],
            ),
            MetaContractEndpoint(
                id="testing.coverage_gaps",
                method="GET",
                path="/api/v1/dev/testing/coverage-gaps",
                summary="Find source paths not covered by any test suite. Supports ?scope= prefix filter.",
                auth_required=False,
                tags=["coverage"],
            ),
        ],
    )


_BUILTIN_FACTORIES = {
    "prompts.analysis": _builtin_prompts_analysis,
    "prompts.authoring": _builtin_prompts_authoring,
    "blocks.discovery": _builtin_blocks_discovery,
    "plans.management": _builtin_plans_management,
    "game.authoring": _builtin_game_authoring,
    "notifications": _builtin_notifications,
    "devtools.codegen": _builtin_devtools_codegen,
    "ui.catalog": _builtin_ui_catalog,
    "testing.catalog": _builtin_testing_catalog,
    "user.assistant": _builtin_user_assistant,
}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class MetaContractRegistry(SimpleRegistry[str, MetaContract]):
    """Plugin-aware registry for meta contract surfaces."""

    def __init__(self) -> None:
        super().__init__(
            name="MetaContractRegistry",
            allow_overwrite=True,
            seed_on_init=True,
            plugin_aware=True,
        )
        self._by_plugin: Dict[str, Set[str]] = {}

    def _get_item_key(self, item: MetaContract) -> str:
        return item.id

    def _seed_defaults(self) -> None:
        for factory in _BUILTIN_FACTORIES.values():
            contract = factory()
            self.register(contract.id, contract)

    def update_version(self, contract_id: str, version: str) -> None:
        """Update the version of a registered contract (called at import time)."""
        contract = self.get_or_none(contract_id)
        if contract is not None:
            contract.version = version

    # -- Plugin helpers ----------------------------------------------------

    def register_plugin_contract(
        self, plugin_id: str, contract: MetaContract
    ) -> None:
        contract.source_plugin_id = plugin_id
        self.register(contract.id, contract)
        self._by_plugin.setdefault(plugin_id, set()).add(contract.id)

    def register_plugin_contracts(
        self, plugin_id: str, contracts: List[MetaContract]
    ) -> None:
        for c in contracts:
            self.register_plugin_contract(plugin_id, c)

    def list_by_plugin(self, plugin_id: str) -> List[MetaContract]:
        return [
            self._items[cid]
            for cid in self._by_plugin.get(plugin_id, set())
            if cid in self._items
        ]

    def unregister_by_plugin(self, plugin_id: str) -> int:
        contract_ids = list(self._by_plugin.pop(plugin_id, set()))
        for cid in contract_ids:
            self.unregister(cid)
        return len(contract_ids)


# Global singleton
meta_contract_registry = MetaContractRegistry()
