"""
Middleware Plugin System - Type Definitions

Enables dynamic loading of HTTP middleware as plugins.
Supports priority-based ordering and configuration.
"""

from typing import Protocol, Callable, Any, Optional, Type
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware


class MiddlewareManifest(BaseModel):
    """Middleware plugin metadata"""
    id: str                          # Unique identifier (e.g., "request-id")
    name: str                        # Display name
    version: str                     # Semver (e.g., "1.0.0")
    description: str                 # Short description
    author: str = "PixSim Team"      # Plugin author

    # Middleware configuration
    priority: int = 100              # Lower = earlier in chain (0-1000)
                                     # Recommended ranges:
                                     # 0-99: Security/auth
                                     # 100-199: Request tracking
                                     # 200-299: Logging/monitoring
                                     # 300-499: Business logic
                                     # 500-999: Response processing
                                     # 900-999: CORS (should be last)

    # Configuration
    config: dict[str, Any] = {}      # Middleware-specific configuration

    # Dependencies
    dependencies: list[str] = []     # Other middleware IDs this depends on
    requires_db: bool = False        # Needs database
    requires_redis: bool = False     # Needs Redis

    # Lifecycle
    enabled: bool = True             # Is middleware enabled?

    # Environment filtering
    environments: list[str] = []     # Empty = all environments
                                     # e.g., ["development", "production"]


class MiddlewarePlugin(Protocol):
    """
    Middleware plugin interface.

    Each middleware plugin module should export:
    - manifest: MiddlewareManifest
    - middleware_class: Type[BaseHTTPMiddleware] OR middleware_factory: Callable
    - Optional: on_load(), on_enable(), on_disable()
    """

    manifest: MiddlewareManifest
    middleware_class: Type[BaseHTTPMiddleware]

    def on_load(self, app: Any) -> None:
        """
        Called when middleware is loaded (before app starts).
        Use for setup that doesn't require runtime state.
        """
        ...

    def on_enable(self) -> None:
        """
        Called when middleware is enabled (after app starts).
        Use for starting background tasks, connecting to services, etc.
        """
        ...

    def on_disable(self) -> None:
        """
        Called when middleware is disabled.
        Use for cleanup, stopping tasks, etc.
        """
        ...


class MiddlewareHooks:
    """
    Hook system for middleware to extend behavior.
    Allows middleware to react to events without tight coupling.
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
middleware_hooks = MiddlewareHooks()


# Common hook events
class MiddlewareEvents:
    """Standard middleware event names"""

    # Lifecycle
    MIDDLEWARE_LOADED = "middleware:loaded"
    MIDDLEWARE_ENABLED = "middleware:enabled"
    MIDDLEWARE_DISABLED = "middleware:disabled"

    # Request/Response
    REQUEST_RECEIVED = "request:received"
    REQUEST_PROCESSED = "request:processed"
    RESPONSE_SENT = "response:sent"

    # System events
    APP_STARTUP = "app:startup"
    APP_SHUTDOWN = "app:shutdown"
