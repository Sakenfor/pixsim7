"""
API v1 routers

Note: Many modules have been moved to plugins. Only core/shared modules remain here.
"""
from . import (
    auth, users, assets, admin, services, accounts, automation, generations, websocket,
    npc_state, llm_cache, analytics, plugins,
    dev_architecture, dev_info, dev_prompt_inspector, dev_prompt_import, dev_prompt_library, dev_ontology, dev_prompt_categories
)

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
]
