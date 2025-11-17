"""
Backend Plugin System - Type Definitions

Enables dynamic loading of API routers as plugins.
Future-proof for sandboxed community plugins.
"""

from typing import Protocol, Callable, Any, Optional
from fastapi import APIRouter
from pydantic import BaseModel


class PluginManifest(BaseModel):
    """Plugin metadata"""
    id: str                          # Unique identifier (e.g., "game-stealth")
    name: str                        # Display name
    version: str                     # Semver (e.g., "1.0.0")
    description: str                 # Short description
    author: str = "PixSim Team"      # Plugin author

    # API configuration
    prefix: str = "/api/v1"          # URL prefix
    tags: list[str] = []             # OpenAPI tags

    # Dependencies
    dependencies: list[str] = []     # Other plugin IDs this depends on
    requires_db: bool = True         # Needs database
    requires_redis: bool = False     # Needs Redis

    # Lifecycle
    enabled: bool = True             # Is plugin enabled?

    # Permissions (future: for sandboxed plugins)
    permissions: list[str] = []      # e.g., ["db:read", "db:write", "redis:read"]


class BackendPlugin(Protocol):
    """
    Backend plugin interface.

    Each plugin module should export:
    - manifest: PluginManifest
    - router: APIRouter
    - Optional: on_load(), on_enable(), on_disable()
    """

    manifest: PluginManifest
    router: APIRouter

    def on_load(self, app: Any) -> None:
        """
        Called when plugin is loaded (before app starts).
        Use for setup that doesn't require runtime state.
        """
        ...

    def on_enable(self) -> None:
        """
        Called when plugin is enabled (after app starts).
        Use for starting background tasks, connecting to services, etc.
        """
        ...

    def on_disable(self) -> None:
        """
        Called when plugin is disabled.
        Use for cleanup, stopping tasks, etc.
        """
        ...


class PluginHooks:
    """
    Hook system for plugins to extend behavior.
    Allows plugins to react to events without tight coupling.
    """

    def __init__(self):
        self._hooks: dict[str, list[Callable]] = {}

    def register(self, event: str, callback: Callable) -> None:
        """Register a callback for an event"""
        if event not in self._hooks:
            self._hooks[event] = []
        self._hooks[event].append(callback)

    async def emit(self, event: str, *args, **kwargs) -> list[Any]:
        """Emit an event, calling all registered callbacks"""
        results = []
        for callback in self._hooks.get(event, []):
            result = await callback(*args, **kwargs) if callable(callback) else None
            results.append(result)
        return results

    def clear(self, event: Optional[str] = None) -> None:
        """Clear hooks for an event, or all hooks if event is None"""
        if event:
            self._hooks.pop(event, None)
        else:
            self._hooks.clear()


# Global hook system
plugin_hooks = PluginHooks()


# Common hook events
class PluginEvents:
    """Standard plugin event names"""

    # Lifecycle
    PLUGIN_LOADED = "plugin:loaded"
    PLUGIN_ENABLED = "plugin:enabled"
    PLUGIN_DISABLED = "plugin:disabled"

    # Game events (plugins can subscribe)
    SESSION_CREATED = "session:created"
    SESSION_UPDATED = "session:updated"
    INTERACTION_EXECUTED = "interaction:executed"
    NPC_SPAWNED = "npc:spawned"
    LOCATION_CHANGED = "location:changed"

    # System events
    APP_STARTUP = "app:startup"
    APP_SHUTDOWN = "app:shutdown"
