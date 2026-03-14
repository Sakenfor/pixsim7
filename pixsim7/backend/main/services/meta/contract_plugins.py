"""
Meta contract plugin integration.

Registers contracts exposed by backend plugins into the MetaContractRegistry.
"""

from __future__ import annotations

import logging
from typing import Iterable, List, Optional

from pixsim7.backend.main.infrastructure.plugins.types import (
    plugin_hooks,
    PluginEvents,
)
from pixsim7.backend.main.services.meta.contract_registry import (
    meta_contract_registry,
    MetaContract,
)

logger = logging.getLogger(__name__)
_hooks_registered = False


def setup_meta_contract_plugin_hooks() -> None:
    """Register plugin hooks for meta contract discovery."""
    global _hooks_registered
    if _hooks_registered:
        return

    try:
        plugin_hooks.register(
            PluginEvents.CONTRACTS_REGISTER, _on_contracts_register
        )
        plugin_hooks.register(PluginEvents.PLUGIN_DISABLED, _on_plugin_disabled)
        _hooks_registered = True
    except Exception as exc:
        logger.warning(
            "contract_plugin_hooks_failed",
            exc_info=exc,
        )


def _on_contracts_register(
    *, plugin_id: str, plugin: Optional[dict] = None
) -> None:
    """Plugin hook: register meta contracts exposed by a plugin."""
    if not plugin or not plugin.get("enabled", False):
        return

    module = plugin.get("module")
    if not module:
        return

    manifest = plugin.get("manifest")
    if (
        manifest
        and "contracts" not in (manifest.provides or [])
        and not _module_has_contracts(module)
    ):
        return

    contracts = _collect_contracts(module, plugin_id)
    if not contracts:
        return

    meta_contract_registry.register_plugin_contracts(plugin_id, contracts)
    logger.info(
        "meta_contracts_registered",
        extra={"plugin_id": plugin_id, "count": len(contracts)},
    )


def _on_plugin_disabled(plugin_id: str) -> None:
    """Plugin hook: unregister contracts for a disabled plugin."""
    removed = meta_contract_registry.unregister_by_plugin(plugin_id)
    if removed:
        logger.info(
            "meta_contracts_unregistered",
            extra={"plugin_id": plugin_id, "count": removed},
        )


def _module_has_contracts(module: object) -> bool:
    return any(
        hasattr(module, attr)
        for attr in ("META_CONTRACTS", "get_meta_contracts")
    )


def _collect_contracts(
    module: object, plugin_id: str
) -> List[MetaContract]:
    collected: List[MetaContract] = []

    get_fn = getattr(module, "get_meta_contracts", None)
    if callable(get_fn):
        try:
            result = get_fn()
            collected.extend(_normalize(result, plugin_id))
        except Exception as exc:
            logger.warning(
                "contract_plugin_get_failed",
                extra={"plugin_id": plugin_id, "error": str(exc)},
            )

    if hasattr(module, "META_CONTRACTS"):
        collected.extend(
            _normalize(getattr(module, "META_CONTRACTS"), plugin_id)
        )

    seen: dict[str, MetaContract] = {}
    for c in collected:
        seen[c.id] = c
    return list(seen.values())


def _normalize(value: object, plugin_id: str) -> List[MetaContract]:
    if value is None:
        return []
    if isinstance(value, MetaContract):
        return [value]
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        items: List[MetaContract] = []
        for item in value:
            items.extend(_normalize(item, plugin_id))
        return items
    return []
