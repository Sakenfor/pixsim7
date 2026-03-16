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
from typing import Dict, List, Optional, Set

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry


@dataclass
class MetaContractEndpoint:
    """An endpoint exposed by a meta contract."""

    id: str
    method: str
    path: str
    summary: str


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
            "pre-authoring checks, constraints, idempotency, and examples."
        ),
        provides=[
            "prompt_families",
            "prompt_versions",
            "authoring_workflows",
            "valid_values",
        ],
        relates_to=["prompts.analysis", "blocks.discovery", "user.assistant"],
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
        version="2.2.0",
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
            ),
            MetaContractEndpoint(
                id="plans.create",
                method="POST",
                path="/api/v1/dev/plans",
                summary="Create a new plan (Document + PlanRegistry). Supports parent_id for sub-plans.",
            ),
            MetaContractEndpoint(
                id="plans.list",
                method="GET",
                path="/api/v1/dev/plans",
                summary="List all plans with children, filterable by status/owner.",
            ),
            MetaContractEndpoint(
                id="plans.detail",
                method="GET",
                path="/api/v1/dev/plans/{plan_id}",
                summary="Get plan with full metadata, markdown, checkpoints, and children.",
            ),
            MetaContractEndpoint(
                id="plans.update",
                method="PATCH",
                path="/api/v1/dev/plans/update/{plan_id}",
                summary="Update plan fields: title/status/stage/owner/priority/summary/markdown plus tags, code paths, companions, handoffs, and dependencies.",
            ),
            MetaContractEndpoint(
                id="plans.documents",
                method="GET",
                path="/api/v1/dev/plans/documents/{plan_id}",
                summary="Companion and handoff documents for a plan.",
            ),
            MetaContractEndpoint(
                id="plans.activity",
                method="GET",
                path="/api/v1/dev/plans/activity",
                summary="Recent change activity across all plans (default 7-day lookback).",
            ),
            MetaContractEndpoint(
                id="plans.settings_get",
                method="GET",
                path="/api/v1/dev/plans/settings",
                summary="Read runtime plan mode flags, including DB-only mode.",
            ),
            MetaContractEndpoint(
                id="plans.settings_update",
                method="PATCH",
                path="/api/v1/dev/plans/settings",
                summary="Toggle runtime plan mode flags (admin, applies to current backend process).",
            ),
            MetaContractEndpoint(
                id="plans.sync",
                method="POST",
                path="/api/v1/dev/plans/sync",
                summary="Sync filesystem plan manifests into the DB (disabled when PLANS_DB_ONLY_MODE=1).",
            ),
        ],
    )


def _builtin_notifications() -> MetaContract:
    return MetaContract(
        id="notifications",
        name="Notifications",
        endpoint=None,
        version="1.0.0",
        auth_required=True,
        owner="platform",
        summary=(
            "Broadcast and targeted notifications for plan events, feature "
            "announcements, and agent actions."
        ),
        provides=[
            "notification_list",
            "notification_create",
            "notification_read_status",
        ],
        relates_to=["plans.management"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="notifications.list",
                method="GET",
                path="/api/v1/notifications",
                summary="List notifications for current user (broadcasts + targeted). Supports category filter and unread_only.",
            ),
            MetaContractEndpoint(
                id="notifications.create",
                method="POST",
                path="/api/v1/notifications",
                summary="Create a notification (broadcast or targeted to a user).",
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
        endpoint=None,
        version="1.0.0",
        auth_required=False,
        owner="frontend lane",
        audience=["dev"],
        summary=(
            "Machine-readable catalog of shared UI components, hooks, icons, "
            "and composition patterns. Prevents ad-hoc inline UI."
        ),
        provides=[
            "ui_components",
            "ui_hooks",
            "ui_icons",
            "ui_patterns",
            "agent_guidance",
        ],
        relates_to=["devtools.codegen", "plans.management"],
        sub_endpoints=[
            MetaContractEndpoint(
                id="ui.catalog_file",
                method="GET",
                path="docs/ui-component-catalog.generated.json",
                summary="Generated catalog JSON (filesystem, not an API endpoint).",
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
                method="GET",
                path="/api/v1/assets",
                summary="Browse and search user assets with filters.",
            ),
            MetaContractEndpoint(
                id="user.assets.analyze",
                method="POST",
                path="/api/v1/assets/{asset_id}/analyze",
                summary="Run AI analysis on an asset.",
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
                path="/api/v1/game/scenes",
                summary="List available scenes.",
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


_BUILTIN_FACTORIES = {
    "prompts.analysis": _builtin_prompts_analysis,
    "prompts.authoring": _builtin_prompts_authoring,
    "blocks.discovery": _builtin_blocks_discovery,
    "plans.management": _builtin_plans_management,
    "notifications": _builtin_notifications,
    "devtools.codegen": _builtin_devtools_codegen,
    "ui.catalog": _builtin_ui_catalog,
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
