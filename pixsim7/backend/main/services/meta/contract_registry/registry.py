"""Plugin-aware registry for meta-contract surfaces + the global singleton."""
from __future__ import annotations

from typing import Dict, List, Set

from pixsim7.backend.main.lib.registry.simple import SimpleRegistry
from .models import MetaContract
from .builtins.prompt import (
    _builtin_prompts_analysis,
    _builtin_prompts_authoring,
    _builtin_blocks_discovery,
)
from .builtins.plans import (
    _builtin_plans_management,
)
from .builtins.game import (
    _builtin_game_authoring,
)
from .builtins.media import (
    _builtin_assets_management,
    _builtin_generation_assistance,
)
from .builtins.platform import (
    _builtin_notifications,
    _builtin_chat_tabs,
    _builtin_devtools_codegen,
    _builtin_ui_catalog,
    _builtin_testing_catalog,
    _builtin_diagnostics,
    _builtin_user_assistant,
    _builtin_project_files,
)


_BUILTIN_FACTORIES = {
    "prompts.analysis": _builtin_prompts_analysis,
    "prompts.authoring": _builtin_prompts_authoring,
    "blocks.discovery": _builtin_blocks_discovery,
    "plans.management": _builtin_plans_management,
    "game.authoring": _builtin_game_authoring,
    "notifications": _builtin_notifications,
    "chat_tabs": _builtin_chat_tabs,
    "assets.management": _builtin_assets_management,
    "generation.assistance": _builtin_generation_assistance,
    "devtools.codegen": _builtin_devtools_codegen,
    "ui.catalog": _builtin_ui_catalog,
    "testing.catalog": _builtin_testing_catalog,
    "diagnostics": _builtin_diagnostics,
    "user.assistant": _builtin_user_assistant,
    "project.files": _builtin_project_files,
}


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


meta_contract_registry = MetaContractRegistry()
