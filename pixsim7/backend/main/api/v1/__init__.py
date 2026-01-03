"""
API v1 routers.

Note: Many modules have been moved to plugins. Only core/shared modules remain here.
"""
from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING

__all__ = [
    "auth",
    "users",
    "generations",
    "assets",
    "admin",
    "services",
    "accounts",
    "automation",
    "websocket",
    # Narrative & NPC modules
    "npc_state",
    "llm_cache",
    "analytics",
    "plugins",
    # Dev tools
    "dev_architecture",
    "dev_info",
    "dev_prompt_inspector",
    "dev_prompt_import",
    "dev_prompt_library",
    "dev_ontology",
    "dev_prompt_categories",
    "dev_sql",
]

if TYPE_CHECKING:
    from . import (
        accounts,
        admin,
        analytics,
        assets,
        auth,
        automation,
        dev_architecture,
        dev_info,
        dev_ontology,
        dev_prompt_categories,
        dev_prompt_import,
        dev_prompt_inspector,
        dev_prompt_library,
        dev_sql,
        generations,
        llm_cache,
        npc_state,
        plugins,
        services,
        users,
        websocket,
    )


def __getattr__(name: str):
    if name in __all__:
        module = import_module(f"{__name__}.{name}")
        globals()[name] = module
        return module
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
