"""
Authoring workflow plugin integration.

Registers workflows exposed by backend plugins into the AuthoringWorkflowRegistry.
Mirrors the pattern in analyzer_plugins.py.
"""

from __future__ import annotations

import logging
from typing import Iterable, List, Optional

from pixsim7.backend.main.infrastructure.plugins.types import (
    plugin_hooks,
    PluginEvents,
)
from pixsim7.backend.main.services.prompt.authoring_workflow_registry import (
    authoring_workflow_registry,
    AuthoringWorkflow,
)

logger = logging.getLogger(__name__)
_hooks_registered = False


def setup_authoring_workflow_plugin_hooks() -> None:
    """
    Register plugin hooks for workflow discovery.

    Call before plugin loading so workflows are registered on load.
    """
    global _hooks_registered
    if _hooks_registered:
        return

    try:
        plugin_hooks.register(
            PluginEvents.WORKFLOWS_REGISTER, _on_workflows_register
        )
        plugin_hooks.register(PluginEvents.PLUGIN_DISABLED, _on_plugin_disabled)
        _hooks_registered = True
    except Exception as exc:
        logger.warning(
            "workflow_plugin_hooks_failed",
            exc_info=exc,
        )


def _on_workflows_register(
    *, plugin_id: str, plugin: Optional[dict] = None
) -> None:
    """Plugin hook: register authoring workflows exposed by a plugin."""
    if not plugin or not plugin.get("enabled", False):
        return

    module = plugin.get("module")
    if not module:
        return

    manifest = plugin.get("manifest")
    if manifest and "workflows" not in (manifest.provides or []) and not _module_has_workflows(module):
        return

    workflows = _collect_workflows(module, plugin_id)
    if not workflows:
        return

    authoring_workflow_registry.register_plugin_workflows(plugin_id, workflows)
    logger.info(
        "authoring_workflows_registered",
        extra={"plugin_id": plugin_id, "count": len(workflows)},
    )


def _on_plugin_disabled(plugin_id: str) -> None:
    """Plugin hook: unregister workflows for a disabled plugin."""
    removed = authoring_workflow_registry.unregister_by_plugin(plugin_id)
    if removed:
        logger.info(
            "authoring_workflows_unregistered",
            extra={"plugin_id": plugin_id, "count": removed},
        )


def _module_has_workflows(module: object) -> bool:
    return any(
        hasattr(module, attr)
        for attr in ("AUTHORING_WORKFLOWS", "get_authoring_workflows")
    )


def _collect_workflows(
    module: object, plugin_id: str
) -> List[AuthoringWorkflow]:
    collected: List[AuthoringWorkflow] = []

    get_fn = getattr(module, "get_authoring_workflows", None)
    if callable(get_fn):
        try:
            result = get_fn()
            collected.extend(_normalize_workflows(result, plugin_id))
        except Exception as exc:
            logger.warning(
                "workflow_plugin_get_failed",
                extra={"plugin_id": plugin_id, "error": str(exc)},
            )

    if hasattr(module, "AUTHORING_WORKFLOWS"):
        collected.extend(
            _normalize_workflows(
                getattr(module, "AUTHORING_WORKFLOWS"), plugin_id
            )
        )

    # Dedupe by id (last wins)
    seen: dict[str, AuthoringWorkflow] = {}
    for wf in collected:
        if wf.id in seen:
            logger.warning(
                "workflow_plugin_duplicate_id",
                extra={"plugin_id": plugin_id, "workflow_id": wf.id},
            )
        seen[wf.id] = wf
    return list(seen.values())


def _normalize_workflows(
    value: object, plugin_id: str
) -> List[AuthoringWorkflow]:
    if value is None:
        return []
    if isinstance(value, AuthoringWorkflow):
        return [value]
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        items: List[AuthoringWorkflow] = []
        for item in value:
            items.extend(_normalize_workflows(item, plugin_id))
        return items
    logger.warning(
        "workflow_plugin_invalid_type",
        extra={"plugin_id": plugin_id, "type": type(value).__name__},
    )
    return []
