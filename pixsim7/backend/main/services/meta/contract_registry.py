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
from pixsim7.backend.main.services.docs.plan_authoring_policy import (
    PLAN_AUTHORING_CONTRACT_ENDPOINT,
)


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


def _inject_focus_tags(
    endpoints: List[MetaContractEndpoint],
    parent_tag: str,
    *,
    group_consolidation: Optional[Dict[str, str]] = None,
) -> List[str]:
    """Inject ``parent_tag:group`` focus tags into *endpoints* in-place.

    For each endpoint, the *first* tag (if any) is treated as the domain key.
    That key is optionally consolidated via *group_consolidation*, then
    combined with *parent_tag* to form a sub-focus tag
    ``{parent_tag}:{group}`` which is appended to the endpoint's tags list.

    Returns the sorted list of unique child focus tags that were emitted —
    ready to be spread into the contract's ``provides`` list.
    """
    consolidation = group_consolidation or {}
    for ep in endpoints:
        if not ep.tags:
            continue
        domain = ep.tags[0]
        # Skip tags that are already focus-tagged or are generic ops
        if domain in ("read", "write"):
            domain = ep.tags[1] if len(ep.tags) > 1 else None
        if not domain or ":" in domain:
            continue
        group = consolidation.get(domain, domain)
        focus_tag = f"{parent_tag}:{group}"
        if focus_tag not in ep.tags:
            ep.tags.append(focus_tag)

    return sorted({
        t for ep in endpoints for t in ep.tags
        if ":" in t and t.startswith(f"{parent_tag}:")
    })


def _builtin_prompts_authoring(version: str = "unknown") -> MetaContract:
    # Auto-generate authoring-mode CRUD sub-endpoints from the spec
    try:
        from pixsim7.backend.main.api.v1.prompts.meta import authoring_mode_crud_spec
        from pixsim7.backend.main.services.crud.registry import spec_to_meta_sub_endpoints
        auto_endpoints = spec_to_meta_sub_endpoints(authoring_mode_crud_spec)
    except ImportError:
        auto_endpoints = []

    all_endpoints = [
        # -- Family CRUD --
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
        # -- Version CRUD --
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
        # -- Analysis & discovery --
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
        # -- Authoring mode CRUD (auto-generated from spec) --
        *auto_endpoints,
    ]

    # Consolidate bare tags into focus groups for the user.assistant UI
    _PROMPT_GROUP_CONSOLIDATION = {
        "authoring-modes": "modes",
    }
    child_groups = _inject_focus_tags(
        all_endpoints, "prompt_authoring",
        group_consolidation=_PROMPT_GROUP_CONSOLIDATION,
    )

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
            "prompt_authoring",
            *child_groups,
            "prompt_families",
            "prompt_family_crud",
            "prompt_versions",
            "authoring_workflows",
            "authoring_modes",
            "authoring_mode_crud",
            "generation_hints",
            "valid_values",
        ],
        relates_to=["prompts.analysis", "blocks.discovery", "user.assistant"],
        sub_endpoints=all_endpoints,
    )


def _builtin_blocks_discovery() -> MetaContract:
    all_endpoints = [
        MetaContractEndpoint(
            id="blocks.tag_dictionary",
            method="GET",
            path="/api/v1/block-templates/meta/blocks/tag-dictionary",
            summary="Canonical tag dictionary with keys, values, and usage stats.",
            tags=["vocabulary"],
        ),
        MetaContractEndpoint(
            id="blocks.catalog",
            method="GET",
            path="/api/v1/block-templates/meta/blocks/catalog",
            summary="High-level catalog of all primitives by category.",
            tags=["catalog"],
        ),
        MetaContractEndpoint(
            id="blocks.matrix",
            method="GET",
            path="/api/v1/block-templates/meta/blocks/matrix",
            summary="Category x role matrix showing what slots are populated.",
            tags=["catalog"],
        ),
        MetaContractEndpoint(
            id="blocks.content_packs",
            method="GET",
            path="/api/v1/block-templates/meta/content-packs/manifests",
            summary="Loaded content pack manifests with block counts.",
            tags=["catalog"],
        ),
        MetaContractEndpoint(
            id="blocks.roles",
            method="GET",
            path="/api/v1/block-templates/blocks/roles",
            summary="Available composition roles for block primitives.",
            tags=["catalog"],
        ),
        MetaContractEndpoint(
            id="blocks.tags",
            method="GET",
            path="/api/v1/block-templates/blocks/tags",
            summary="Compact tag key to values index.",
            tags=["vocabulary"],
        ),
        MetaContractEndpoint(
            id="blocks.vocabulary_validate",
            method="POST",
            path="/api/v1/block-templates/meta/vocabulary/validate",
            summary="Validate tags and ontology IDs against canonical vocabulary.",
            tags=["vocabulary"],
        ),
        MetaContractEndpoint(
            id="blocks.vocabulary_suggest",
            method="GET",
            path="/api/v1/block-templates/meta/vocabulary/suggest",
            summary="Suggest canonical tags based on partial input.",
            tags=["vocabulary"],
        ),
    ]

    # Blocks serve prompt authoring — surface as prompt_authoring:vocabulary,
    # prompt_authoring:catalog children so the focus drill-down works.
    child_groups = _inject_focus_tags(all_endpoints, "prompt_authoring")

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
            *child_groups,
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
        sub_endpoints=all_endpoints,
    )


def _builtin_plans_management() -> MetaContract:
    return MetaContract(
        id="plans.management",
        name="Plan Management",
        endpoint=None,
        version="2.4.0",
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
            "plan_authoring_policy",
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
                    "x-policy-ref": PLAN_AUTHORING_CONTRACT_ENDPOINT,
                },
                tags=["create", "planning"],
            ),
            MetaContractEndpoint(
                id="plans.meta_authoring_contract",
                method="GET",
                path=PLAN_AUTHORING_CONTRACT_ENDPOINT,
                summary=(
                    "Canonical plan authoring rules (required/suggested fields) "
                    "by principal type."
                ),
                tags=["agent", "planning", "policy"],
            ),
            MetaContractEndpoint(
                id="plans.list",
                method="GET",
                path="/api/v1/dev/plans",
                summary="List all plans with filters, text search, and optional compact payload mode.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "properties": {
                                "q": {"type": "string"},
                                "status": {"type": "string"},
                                "owner": {"type": "string"},
                                "namespace": {"type": "string"},
                                "priority": {"type": "string"},
                                "plan_type": {"type": "string"},
                                "tag": {"type": "string"},
                                "compact": {"type": "boolean"},
                                "include_hidden": {"type": "boolean"},
                                "limit": {"type": "integer"},
                                "offset": {"type": "integer"},
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
                path="/api/v1/dev/plans/{plan_id}",
                summary="Update plan fields with optional git commit traceability for audit trail.",
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
                                "commit_sha": {
                                    "type": "string",
                                    "description": "Git commit SHA to record on the audit event.",
                                },
                                "auto_head": {
                                    "type": "boolean",
                                    "description": "Resolve current HEAD as commit_sha if not provided.",
                                },
                                "verify_commits": {
                                    "type": "boolean",
                                    "description": "Verify commit SHA exists in the repo.",
                                },
                            },
                        },
                    },
                    "required": ["plan_id", "body"],
                },
                tags=["update", "planning", "git"],
            ),
            MetaContractEndpoint(
                id="plans.progress",
                method="POST",
                path="/api/v1/dev/plans/progress/{plan_id}",
                summary=(
                    "Log in-flight checkpoint progress with optional git commit traceability. "
                    "Supports point deltas, execution metadata, and commit SHA evidence."
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
                                "append_tests": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Checkpoint-linked test suite IDs (alias for test_suite evidence).",
                                },
                                "note": {"type": "string"},
                                "sync_plan_stage": {"type": "boolean"},
                                "commit_sha": {
                                    "type": "string",
                                    "description": "Git commit SHA to record as evidence (7-40 hex chars).",
                                },
                                "append_commits": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Additional commit SHAs to append as evidence.",
                                },
                                "commit_range": {
                                    "type": "string",
                                    "description": "Git range (e.g. 'abc123..def456') — auto-expanded via rev-list.",
                                },
                                "auto_head": {
                                    "type": "boolean",
                                    "description": "Resolve current HEAD as commit_sha if not provided.",
                                },
                                "verify_commits": {
                                    "type": "boolean",
                                    "description": "Verify commit SHAs exist in the repo (default true).",
                                },
                            },
                        },
                    },
                    "required": ["plan_id", "body"],
                },
                tags=["update", "progress", "planning", "git"],
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


def _species_meta_endpoints() -> list:
    """Generate species CRUD MetaContractEndpoints for game.authoring."""
    try:
        from pixsim7.backend.main.api.v1.species_meta import species_crud_spec
        from pixsim7.backend.main.services.crud.registry import spec_to_meta_sub_endpoints
        eps = spec_to_meta_sub_endpoints(species_crud_spec)
        # Re-tag for game_authoring:characters focus group
        for ep in eps:
            ep.tags = ["game_authoring", "game_authoring:characters"]
        return eps
    except ImportError:
        return []


def _builtin_game_authoring(version: str = "unknown") -> MetaContract:
    # Auto-generate sub-endpoints from the entity CRUD registry so that new
    # game entity types are automatically surfaced in the contract (and in the
    # AI assistant focus system) without manual wiring.
    #
    # group_consolidation merges related domain tags into logical focus groups.
    # The spec tags (e.g. ["runtime", "npcs"]) provide the domain; the mapping
    # consolidates them: "npcs" → "characters", "locations" → "worlds", etc.
    # Result: endpoints tagged game_authoring + game_authoring:characters etc.
    _GROUP_CONSOLIDATION = {
        "locations": "worlds",
        "worlds": "worlds",
        "npcs": "characters",
        "characters": "characters",
        "scenes": "scenes",
        "items": "items",
    }
    try:
        from pixsim7.backend.main.services.entity_crud.crud_router import (
            entity_specs_to_meta_sub_endpoints,
        )
        auto_endpoints = entity_specs_to_meta_sub_endpoints(
            tag="game_authoring",
            group_consolidation=_GROUP_CONSOLIDATION,
        )
    except Exception:
        auto_endpoints = []

    # Derive child focus groups from generated endpoints
    child_groups = sorted({
        t for ep in auto_endpoints for t in ep.tags
        if ":" in t and t.startswith("game_authoring:")
    })

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
            "game_authoring",
            "game_authoring:characters",
            "species_crud",
            *child_groups,
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
                tags=["game_authoring"],
            ),
            # Species vocabulary CRUD (blocks DB, but conceptually part of
            # character/creature authoring — agents use species when creating characters).
            *_species_meta_endpoints(),
            # Character registry endpoints (mounted outside /api/v1/game/ so
            # not auto-discovered by entity_crud, listed explicitly here).
            MetaContractEndpoint(
                id="characters.list",
                method="GET",
                path="/api/v1/characters",
                summary="List all characters. Filter by category, species, archetype.",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            MetaContractEndpoint(
                id="characters.create",
                method="POST",
                path="/api/v1/characters",
                summary="Create a character with species, visual_traits, personality, and behavioral patterns.",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            MetaContractEndpoint(
                id="characters.get",
                method="GET",
                path="/api/v1/characters/{character_id}",
                summary="Get a character by ID with full detail.",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            MetaContractEndpoint(
                id="characters.update",
                method="PUT",
                path="/api/v1/characters/{character_id}",
                summary="Update a character (full replace).",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            MetaContractEndpoint(
                id="characters.expand_template",
                method="POST",
                path="/api/v1/characters/expand-template",
                summary="Expand a character's visual description template using species + visual_traits.",
                tags=["game_authoring", "game_authoring:characters"],
            ),
            *auto_endpoints,
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


def _builtin_assets_management() -> MetaContract:
    all_endpoints = [
        # -- Search & browse --
        MetaContractEndpoint(
            id="assets.search",
            method="POST",
            path="/api/v1/assets/search",
            summary="Search assets with filters, sorting, and pagination.",
            tags=["search"],
        ),
        MetaContractEndpoint(
            id="assets.groups",
            method="POST",
            path="/api/v1/assets/groups",
            summary="Grouped asset listing (by generation, date, etc.).",
            tags=["search"],
        ),
        MetaContractEndpoint(
            id="assets.filter_options",
            method="POST",
            path="/api/v1/assets/filter-options",
            summary="Available filter options for the current result set.",
            tags=["search"],
        ),
        MetaContractEndpoint(
            id="assets.autocomplete",
            method="GET",
            path="/api/v1/assets/autocomplete",
            summary="Autocomplete suggestions for asset search.",
            tags=["search"],
        ),
        # -- CRUD --
        MetaContractEndpoint(
            id="assets.get",
            method="GET",
            path="/api/v1/assets/{asset_id}",
            summary="Get asset details by ID.",
            tags=["crud"],
        ),
        MetaContractEndpoint(
            id="assets.delete",
            method="DELETE",
            path="/api/v1/assets/{asset_id}",
            summary="Delete an asset.",
            tags=["crud"],
        ),
        MetaContractEndpoint(
            id="assets.archive",
            method="PATCH",
            path="/api/v1/assets/{asset_id}/archive",
            summary="Archive or unarchive an asset.",
            tags=["crud"],
        ),
        # -- Upload --
        MetaContractEndpoint(
            id="assets.upload",
            method="POST",
            path="/api/v1/assets/upload",
            summary="Upload a new asset (file or URL).",
            tags=["upload"],
        ),
        MetaContractEndpoint(
            id="assets.upload_from_url",
            method="POST",
            path="/api/v1/assets/upload-from-url",
            summary="Upload asset from a remote URL.",
            tags=["upload"],
        ),
        MetaContractEndpoint(
            id="assets.reupload",
            method="POST",
            path="/api/v1/assets/{asset_id}/reupload",
            summary="Re-upload / replace an asset's file.",
            tags=["upload"],
        ),
        # -- Tags --
        MetaContractEndpoint(
            id="assets.tags_assign",
            method="POST",
            path="/api/v1/assets/{asset_id}/tags/assign",
            summary="Assign tags to an asset.",
            tags=["tags"],
        ),
        MetaContractEndpoint(
            id="assets.tags_suggest",
            method="GET",
            path="/api/v1/assets/{asset_id}/tags/suggest",
            summary="AI-suggested tags for an asset.",
            tags=["tags"],
        ),
        MetaContractEndpoint(
            id="assets.bulk_tags",
            method="POST",
            path="/api/v1/assets/bulk/tags",
            summary="Bulk tag assignment across multiple assets.",
            tags=["tags"],
        ),
        # -- Enrichment --
        MetaContractEndpoint(
            id="assets.enrich",
            method="POST",
            path="/api/v1/assets/{asset_id}/enrich",
            summary="Run AI enrichment (captioning, tagging) on an asset.",
            tags=["enrichment"],
        ),
        # -- Versioning --
        MetaContractEndpoint(
            id="assets.versions",
            method="GET",
            path="/api/v1/assets/{asset_id}/versions",
            summary="List version history for an asset.",
            tags=["versioning"],
        ),
        MetaContractEndpoint(
            id="assets.ancestry",
            method="GET",
            path="/api/v1/assets/{asset_id}/ancestry",
            summary="Get full ancestry chain for an asset.",
            tags=["versioning"],
        ),
        MetaContractEndpoint(
            id="assets.version_family",
            method="GET",
            path="/api/v1/assets/versions/families/{family_id}",
            summary="Get version family details.",
            tags=["versioning"],
        ),
        # -- Generation context --
        MetaContractEndpoint(
            id="assets.generation_context",
            method="GET",
            path="/api/v1/assets/{asset_id}/generation-context",
            summary="Retrieve the generation context that produced this asset.",
            tags=["context"],
        ),
    ]

    child_groups = _inject_focus_tags(all_endpoints, "asset_management")

    return MetaContract(
        id="assets.management",
        name="Asset Management",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="asset lane",
        summary=(
            "Asset CRUD, search, upload, tagging, enrichment, versioning, "
            "and generation-context retrieval."
        ),
        provides=[
            "asset_management",
            *child_groups,
        ],
        relates_to=["user.assistant"],
        sub_endpoints=all_endpoints,
    )


def _builtin_generation_assistance() -> MetaContract:
    all_endpoints = [
        # -- Create --
        MetaContractEndpoint(
            id="generations.create",
            method="POST",
            path="/api/v1/generations",
            summary="Create a new generation request.",
            tags=["create"],
        ),
        MetaContractEndpoint(
            id="generations.simple_i2v",
            method="POST",
            path="/api/v1/generations/simple-image-to-video",
            summary="Quick image-to-video generation shortcut.",
            tags=["create"],
        ),
        MetaContractEndpoint(
            id="generations.validate",
            method="POST",
            path="/api/v1/generations/validate",
            summary="Validate generation parameters before submitting.",
            tags=["create"],
        ),
        # -- Status --
        MetaContractEndpoint(
            id="generations.get",
            method="GET",
            path="/api/v1/generations/{generation_id}",
            summary="Get generation status and details.",
            tags=["status"],
        ),
        MetaContractEndpoint(
            id="generations.list",
            method="GET",
            path="/api/v1/generations",
            summary="List generations with filters and pagination.",
            tags=["status"],
        ),
        MetaContractEndpoint(
            id="generations.operations",
            method="GET",
            path="/api/v1/generation-operations",
            summary="Available generation operation types and metadata.",
            tags=["status"],
        ),
        # -- Lifecycle --
        MetaContractEndpoint(
            id="generations.cancel",
            method="POST",
            path="/api/v1/generations/{generation_id}/cancel",
            summary="Cancel a running generation.",
            tags=["lifecycle"],
        ),
        MetaContractEndpoint(
            id="generations.retry",
            method="POST",
            path="/api/v1/generations/{generation_id}/retry",
            summary="Retry a failed generation.",
            tags=["lifecycle"],
        ),
        MetaContractEndpoint(
            id="generations.pause",
            method="POST",
            path="/api/v1/generations/{generation_id}/pause",
            summary="Pause a running generation.",
            tags=["lifecycle"],
        ),
        MetaContractEndpoint(
            id="generations.resume",
            method="POST",
            path="/api/v1/generations/{generation_id}/resume",
            summary="Resume a paused generation.",
            tags=["lifecycle"],
        ),
        MetaContractEndpoint(
            id="generations.delete",
            method="DELETE",
            path="/api/v1/generations/{generation_id}",
            summary="Delete a generation record.",
            tags=["lifecycle"],
        ),
        # -- Batches --
        MetaContractEndpoint(
            id="generations.batches_list",
            method="GET",
            path="/api/v1/generation-batches",
            summary="List generation batches.",
            tags=["batches"],
        ),
        MetaContractEndpoint(
            id="generations.batch_detail",
            method="GET",
            path="/api/v1/generation-batches/{batch_id}",
            summary="Get batch details with generation breakdown.",
            tags=["batches"],
        ),
        # -- Chains --
        MetaContractEndpoint(
            id="generations.chains_list",
            method="GET",
            path="/api/v1/generation-chains",
            summary="List generation chains.",
            tags=["chains"],
        ),
        MetaContractEndpoint(
            id="generations.chain_create",
            method="POST",
            path="/api/v1/generation-chains",
            summary="Create a generation chain definition.",
            tags=["chains"],
        ),
        MetaContractEndpoint(
            id="generations.chain_execute",
            method="POST",
            path="/api/v1/generation-chains/{chain_id}/execute",
            summary="Execute a saved generation chain.",
            tags=["chains"],
        ),
    ]

    child_groups = _inject_focus_tags(all_endpoints, "generation_assistance")

    return MetaContract(
        id="generation.assistance",
        name="Generation Assistance",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="generation lane",
        summary=(
            "Generation creation, status tracking, lifecycle management, "
            "batch operations, and chain workflows."
        ),
        provides=[
            "generation_assistance",
            *child_groups,
        ],
        relates_to=["user.assistant"],
        sub_endpoints=all_endpoints,
    )


def _builtin_user_assistant() -> MetaContract:
    return MetaContract(
        id="user.assistant",
        name="User AI Assistant",
        endpoint=None,
        version="1.2.0",
        auth_required=True,
        owner="user-experience lane",
        summary=(
            "User-facing AI assistant capabilities: asset management, "
            "generation, game authoring, and project help."
        ),
        provides=[
            "asset_management",
            "generation_assistance",
            "game_authoring",
            "prompt_authoring",
        ],
        relates_to=[
            "assets.management",
            "generation.assistance",
            "prompts.authoring",
            "blocks.discovery",
            "game.authoring",
        ],
        sub_endpoints=[],
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
            MetaContractEndpoint(
                id="testing.sync",
                method="POST",
                path="/api/v1/dev/testing/sync",
                summary="Sync test suites from filesystem discovery into DB.",
                tags=["sync"],
            ),
            MetaContractEndpoint(
                id="testing.suites_db",
                method="GET",
                path="/api/v1/dev/testing/suites",
                summary="Query suites from DB (fast, no filesystem scan). Requires prior sync.",
                auth_required=False,
                tags=["suites", "db"],
            ),
        ],
    )


def _builtin_project_files() -> MetaContract:
    return MetaContract(
        id="project.files",
        name="Project File Access",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="platform",
        summary="Read-only access to project source files for AI agents reviewing plans and code.",
        audience=["dev"],
        provides=[
            "project_file_read",
            "project_file_list",
            "project_file_search",
        ],
        sub_endpoints=[
            MetaContractEndpoint(
                id="files_read",
                method="GET",
                path="/api/v1/files/read",
                summary="Read a project file with line numbers. Provide path (relative), optional offset and limit.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "description": "Query parameters",
                            "properties": {
                                "path": {"type": "string", "description": "Relative file path (e.g. 'pixsim7/backend/main/services/foo.py')"},
                                "offset": {"type": "integer", "description": "Start line (1-based, default 1)"},
                                "limit": {"type": "integer", "description": "Max lines (default 500, max 2000)"},
                            },
                            "required": ["path"],
                        },
                    },
                },
            ),
            MetaContractEndpoint(
                id="files_list",
                method="GET",
                path="/api/v1/files/list",
                summary="List files in a project directory with sizes. Supports glob patterns.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "description": "Query parameters",
                            "properties": {
                                "path": {"type": "string", "description": "Relative directory path (default: project root)"},
                                "pattern": {"type": "string", "description": "Glob pattern (e.g. '*.py', '**/*.ts')"},
                            },
                        },
                    },
                },
            ),
            MetaContractEndpoint(
                id="files_search",
                method="GET",
                path="/api/v1/files/search",
                summary="Search for text/regex patterns across project files. Returns matching lines with paths.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "params": {
                            "type": "object",
                            "description": "Query parameters",
                            "properties": {
                                "pattern": {"type": "string", "description": "Text or regex pattern to search for"},
                                "path": {"type": "string", "description": "Directory to search in (default: root)"},
                                "glob": {"type": "string", "description": "File glob filter (e.g. '*.py')"},
                                "max_results": {"type": "integer", "description": "Max matches (default 50, max 200)"},
                            },
                            "required": ["pattern"],
                        },
                    },
                },
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
    "assets.management": _builtin_assets_management,
    "generation.assistance": _builtin_generation_assistance,
    "devtools.codegen": _builtin_devtools_codegen,
    "ui.catalog": _builtin_ui_catalog,
    "testing.catalog": _builtin_testing_catalog,
    "user.assistant": _builtin_user_assistant,
    "project.files": _builtin_project_files,
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
