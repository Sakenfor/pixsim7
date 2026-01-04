"""
Analyzer plugin integration.

Registers analyzers exposed by backend plugins into the AnalyzerRegistry.
"""

from __future__ import annotations

import logging
from typing import Iterable, List, Optional

from pixsim7.backend.main.infrastructure.plugins.types import (
    plugin_hooks,
    PluginEvents,
)
from pixsim7.backend.main.services.prompt.parser.registry import (
    analyzer_registry,
    AnalyzerInfo,
)

logger = logging.getLogger(__name__)
_hooks_registered = False


def setup_analyzer_plugin_hooks() -> None:
    """
    Register plugin hooks for analyzer discovery.

    Call this before plugin loading so analyzers are registered on load.
    """
    global _hooks_registered
    if _hooks_registered:
        return

    try:
        plugin_hooks.register(PluginEvents.ANALYZERS_REGISTER, _on_analyzers_register)
        plugin_hooks.register(PluginEvents.PLUGIN_DISABLED, _on_plugin_disabled)
        _hooks_registered = True
    except Exception as exc:
        logger.warning(
            "analyzer_plugin_hooks_failed",
            error=str(exc),
            error_type=exc.__class__.__name__,
        )


def _on_analyzers_register(*, plugin_id: str, plugin: Optional[dict] = None) -> None:
    """
    Plugin hook: register analyzers exposed by a plugin.
    """
    if not plugin:
        return

    if not plugin.get("enabled", False):
        return

    module = plugin.get("module")
    manifest = plugin.get("manifest")

    if not module:
        return

    if manifest and "analyzers" not in (manifest.provides or []) and not _module_has_analyzers(module):
        return

    analyzers = _collect_analyzers(module, plugin_id)
    if not analyzers:
        return

    analyzer_registry.register_plugin_analyzers(plugin_id, analyzers)
    logger.info(
        "analyzers_registered",
        plugin_id=plugin_id,
        count=len(analyzers),
    )


def _on_plugin_disabled(plugin_id: str) -> None:
    """
    Plugin hook: unregister analyzers for a disabled plugin.
    """
    removed = analyzer_registry.unregister_by_plugin(plugin_id)
    if removed:
        logger.info(
            "analyzers_unregistered",
            plugin_id=plugin_id,
            count=removed,
        )


def _module_has_analyzers(module: object) -> bool:
    return any(
        hasattr(module, attr)
        for attr in ("ANALYZERS", "get_analyzers", "register_analyzers")
    )


def _collect_analyzers(module: object, plugin_id: str) -> List[AnalyzerInfo]:
    collected: List[AnalyzerInfo] = []

    register_fn = getattr(module, "register_analyzers", None)
    if callable(register_fn):
        try:
            register_fn(_collector(collected, plugin_id))
        except Exception as exc:
            logger.warning(
                "analyzer_plugin_register_failed",
                plugin_id=plugin_id,
                error=str(exc),
                error_type=exc.__class__.__name__,
            )

    get_fn = getattr(module, "get_analyzers", None)
    if callable(get_fn):
        try:
            collected.extend(_normalize_analyzers(get_fn(), plugin_id))
        except Exception as exc:
            logger.warning(
                "analyzer_plugin_get_failed",
                plugin_id=plugin_id,
                error=str(exc),
                error_type=exc.__class__.__name__,
            )

    if hasattr(module, "ANALYZERS"):
        collected.extend(_normalize_analyzers(getattr(module, "ANALYZERS"), plugin_id))

    return _dedupe_analyzers(collected, plugin_id)


def _collector(out: List[AnalyzerInfo], plugin_id: str):
    def _register(analyzer: object) -> None:
        normalized = _normalize_analyzers(analyzer, plugin_id=plugin_id)
        out.extend(normalized)

    return _register


def _normalize_analyzers(value: object, plugin_id: Optional[str]) -> List[AnalyzerInfo]:
    if value is None:
        return []

    if isinstance(value, AnalyzerInfo):
        return [value]

    if isinstance(value, dict):
        try:
            return [AnalyzerInfo(**value)]
        except Exception as exc:
            logger.warning(
                "analyzer_plugin_invalid_dict",
                plugin_id=plugin_id,
                error=str(exc),
                error_type=exc.__class__.__name__,
            )
            return []

    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        items: List[AnalyzerInfo] = []
        for item in value:
            items.extend(_normalize_analyzers(item, plugin_id))
        return items

    logger.warning(
        "analyzer_plugin_invalid_type",
        plugin_id=plugin_id,
        value_type=type(value).__name__,
    )
    return []


def _dedupe_analyzers(
    analyzers: List[AnalyzerInfo],
    plugin_id: str,
) -> List[AnalyzerInfo]:
    deduped: dict[str, AnalyzerInfo] = {}
    for analyzer in analyzers:
        if analyzer.id in deduped:
            logger.warning(
                "analyzer_plugin_duplicate_id",
                plugin_id=plugin_id,
                analyzer_id=analyzer.id,
            )
            continue
        deduped[analyzer.id] = analyzer
    return list(deduped.values())
