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
        relates_to=["prompts.authoring"],
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
        relates_to=["prompts.analysis", "blocks.discovery"],
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
        ],
        relates_to=["prompts.authoring", "prompts.analysis"],
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
        ],
    )


_BUILTIN_FACTORIES = {
    "prompts.analysis": _builtin_prompts_analysis,
    "prompts.authoring": _builtin_prompts_authoring,
    "blocks.discovery": _builtin_blocks_discovery,
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
