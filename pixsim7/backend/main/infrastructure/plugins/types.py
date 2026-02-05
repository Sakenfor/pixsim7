"""
Backend Plugin System - Type Definitions

Enables dynamic loading of API routers as plugins.
Future-proof for sandboxed community plugins.

Plugin Architecture:
    kind (coarse shape) + provides (fine-grained hooks)

    Load order: stats → behavior → content → feature → route → tools
    (explicit depends_on can override)

    See PLUGIN_KIND_CONFIG for kind → defaults mapping.
"""

import inspect
from typing import Protocol, Callable, Any, Optional, Literal, Union
from fastapi import APIRouter
from pydantic import BaseModel, Field, model_validator

# Import FrontendPluginManifest at runtime (not TYPE_CHECKING) so Pydantic can resolve
# the forward reference in PluginManifest.frontend_manifest field
from .frontend_manifest import FrontendPluginManifest


# =============================================================================
# Plugin Kind System
# =============================================================================

PluginKind = Literal[
    "route",        # Core API routes (always loaded)
    "feature",      # Gameplay features (API + frontend)
    "tools",        # Frontend-only tools (no backend routes)
    "behavior",     # Behavior extensions (conditions, effects, scoring, profiles)
    "stats",        # Stat package definitions
    "content",      # Data-only content (archetypes, activities, items)
    "integration",  # External service integrations (AI providers, analytics)
]

PluginProvides = Literal[
    "api_routes",           # Exposes API endpoints
    "frontend_tools",       # Provides frontend gizmo tools
    "frontend_interactions",  # Provides frontend interactions
    "frontend_helpers",     # Provides frontend session helpers
    "frontend_gating",      # Provides frontend custom gating conditions
    "frontend_scene_views", # Provides frontend scene view modes
    "frontend_control_centers",  # Provides frontend control center modes
    "behavior_conditions",  # Registers behavior conditions
    "behavior_effects",     # Registers behavior effects
    "behavior_scoring",     # Registers scoring factors
    "behavior_profiles",    # Registers behavior profiles
    "behavior_traits",      # Registers trait effect mappings
    "tag_effects",          # Registers tag effects
    "stat_packages",        # Registers stat packages
    "component_schemas",    # Registers NPC component schemas
    "npc_surfaces",         # Registers NPC body surfaces
    "content_packs",        # Provides content data (archetypes, activities)
    "external_services",    # Integrates external services
    "composition_packages", # Registers composition role packages
    "analyzers",            # Registers prompt/asset analyzers
]

# Load order priority (lower = earlier)
PLUGIN_KIND_LOAD_ORDER: dict[str, int] = {
    "stats": 10,
    "behavior": 20,
    "content": 30,
    "feature": 40,
    "route": 50,
    "integration": 60,
    "tools": 70,  # Tools can be last (frontend-only)
}

# Kind → default configuration
PLUGIN_KIND_CONFIG: dict[str, dict] = {
    "route": {
        "router_required": True,
        "default_provides": ["api_routes"],
        "expected_provides": ["api_routes"],
        "forbidden_provides": [],
    },
    "feature": {
        "router_required": True,
        "default_provides": ["api_routes", "frontend_interactions"],
        "expected_provides": ["api_routes", "frontend_interactions", "component_schemas"],
        "forbidden_provides": [],
    },
    "tools": {
        "router_required": False,
        "default_provides": ["frontend_tools"],
        "expected_provides": ["frontend_tools"],
        "forbidden_provides": ["api_routes"],  # Warn if tools plugin has routes
    },
    "behavior": {
        "router_required": False,
        "default_provides": ["behavior_conditions", "behavior_effects", "behavior_scoring"],
        "expected_provides": [
            "behavior_conditions", "behavior_effects", "behavior_scoring",
            "behavior_profiles", "behavior_traits", "tag_effects",
        ],
        "forbidden_provides": ["frontend_tools", "frontend_interactions"],
    },
    "stats": {
        "router_required": False,
        "default_provides": ["stat_packages"],
        "expected_provides": ["stat_packages"],
        "forbidden_provides": ["api_routes", "frontend_tools"],
    },
    "content": {
        "router_required": False,
        "default_provides": ["content_packs"],
        "expected_provides": ["content_packs", "composition_packages"],
        "forbidden_provides": ["api_routes"],  # Content should be data-only
    },
    "integration": {
        "router_required": True,  # Integrations usually expose endpoints
        "default_provides": ["external_services", "api_routes"],
        "expected_provides": ["external_services", "api_routes"],
        "forbidden_provides": [],
    },
}


def get_kind_config(kind: str) -> dict:
    """Get configuration for a plugin kind."""
    return PLUGIN_KIND_CONFIG.get(kind, PLUGIN_KIND_CONFIG["feature"])


def get_load_order(kind: str) -> int:
    """Get load order priority for a plugin kind."""
    return PLUGIN_KIND_LOAD_ORDER.get(kind, 50)


# =============================================================================
# Plugin Manifest
# =============================================================================

class PluginManifest(BaseModel):
    """
    Plugin metadata and configuration.

    Architecture:
        - kind: Coarse plugin shape (drives defaults, validation, load order)
        - provides: Fine-grained hooks this plugin registers
        - depends_on: Explicit load-order dependencies (supplements kind order)

    Example:
        # Simple tools plugin
        manifest = PluginManifest(
            id="my-tools",
            name="My Tools",
            kind="tools",
            # provides defaults to ["frontend_tools"]
        )

        # Behavior extension plugin
        manifest = PluginManifest(
            id="personality",
            name="Personality System",
            kind="behavior",
            provides=["behavior_profiles", "behavior_traits", "tag_effects"],
        )
    """
    id: str                          # Unique identifier (e.g., "game-stealth")
    name: str                        # Display name
    version: str                     # Semver (e.g., "1.0.0")
    description: str                 # Short description
    author: str = "PixSim Team"      # Plugin author

    # Plugin type (coarse shape)
    kind: PluginKind = "feature"

    # Fine-grained capabilities this plugin provides
    # If not specified, defaults based on kind (see PLUGIN_KIND_CONFIG)
    provides: list[str] = []

    # API configuration
    prefix: str = "/api/v1"          # URL prefix (empty string normalizes to /api/v1)
    prefix_raw: bool = False         # If True, use prefix exactly as-is (no normalization)
    tags: list[str] = []             # OpenAPI tags

    # Dependencies
    dependencies: list[str] = []     # Other plugin IDs this depends on (legacy)
    depends_on: list[str] = []       # Explicit load-order dependencies
    requires_db: bool = True         # Needs database
    requires_redis: bool = False     # Needs Redis

    # Lifecycle
    enabled: bool = True             # Is plugin enabled?
    required: bool = False           # Is plugin required? (fail-fast if load fails in dev/CI)

    # Frontend manifest for dynamic interaction/helper/tool registration
    # Can be a FrontendPluginManifest instance or dict (for backwards compatibility)
    # See infrastructure/plugins/frontend_manifest.py for canonical schema
    frontend_manifest: Optional[Union[dict, FrontendPluginManifest]] = None

    # Plugin-contributed codegen tasks (escape hatch for custom type generation)
    # Prefer using the standard frontend_manifest schema instead
    codegen_tasks: list[dict] = Field(default_factory=list)

    # Permissions - see pixsim7/backend/main/infrastructure/plugins/permissions.py
    # for canonical permission definitions
    permissions: list[str] = []
    """
    List of required permissions for this plugin.

    Permissions control what capability APIs the plugin can access via PluginContext.
    See PluginPermission enum in permissions.py for available permissions.

    Common permissions:
    - "world:read" - read world metadata, locations, NPCs
    - "session:read" - read session flags, relationships
    - "session:write" - mutate session flags, relationships
    - "npc:read" - read NPC data
    - "npc:write" - mutate NPC state
    - "behavior:extend_conditions" - register custom behavior conditions
    - "behavior:extend_effects" - register custom activity effects
    - "generation:submit" - submit generation requests
    - "log:emit" - emit structured logs (recommended for all plugins)
    - "admin:routes" - expose admin-only endpoints

    Permission groups (expand to multiple permissions):
    - "group:readonly" - read-only world/session access + logging
    - "group:gameplay" - full session/NPC read/write + logging
    - "group:behavior" - behavior extensions + read access
    - "group:event_handler" - event subscription + logging
    - "group:generation" - generation submit/read + world/session read
    - "group:admin" - admin routes + read access

    Examples:
        # Read-only plugin (analytics, exports)
        permissions=["world:read", "session:read", "log:emit"]

        # Gameplay plugin (stealth, romance)
        permissions=["group:gameplay"]

        # Behavior extension
        permissions=["group:behavior", "behavior:configure_simulation"]

        # Event handler
        permissions=["event:subscribe", "log:emit"]
    """

    @model_validator(mode="after")
    def _apply_kind_defaults(self) -> "PluginManifest":
        """Apply default provides based on kind if not specified."""
        if not self.provides:
            config = get_kind_config(self.kind)
            object.__setattr__(self, "provides", config.get("default_provides", []))
        # Merge dependencies and depends_on for backwards compatibility
        if self.dependencies and not self.depends_on:
            object.__setattr__(self, "depends_on", self.dependencies)
        return self

    @property
    def router_required(self) -> bool:
        """Whether this plugin kind requires a router export."""
        return get_kind_config(self.kind).get("router_required", True)

    @property
    def load_order(self) -> int:
        """Load order priority (lower = earlier)."""
        return get_load_order(self.kind)

    def validate_provides(self) -> list[str]:
        """
        Validate provides against kind expectations.
        Returns list of warnings (empty if valid).
        """
        warnings = []
        config = get_kind_config(self.kind)

        # Check for forbidden provides
        forbidden = config.get("forbidden_provides", [])
        for p in self.provides:
            if p in forbidden:
                warnings.append(
                    f"Plugin '{self.id}' (kind={self.kind}) declares '{p}' "
                    f"which is unexpected for this kind"
                )

        return warnings


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
        """
        Emit an event, calling all registered callbacks.

        Supports both sync and async callbacks.
        Exceptions in callbacks are caught and logged to prevent cascade failures.
        """
        import structlog
        logger = structlog.get_logger(__name__)

        results = []
        for callback in self._hooks.get(event, []):
            if not callable(callback):
                results.append(None)
                continue

            try:
                result = callback(*args, **kwargs)
                if inspect.isawaitable(result):
                    result = await result
                results.append(result)
            except Exception as e:
                callback_name = callback.__name__ if hasattr(callback, '__name__') else str(callback)
                logger.error(
                    "Hook callback failed",
                    event=event,
                    callback=callback_name,
                    error=str(e),
                    exc_info=True
                )
                results.append(None)
        return results

    def emit_sync(self, event: str, *args, **kwargs) -> None:
        """
        Emit an event from synchronous code, calling only sync callbacks.
        Async callbacks will be skipped with a warning.
        Exceptions in callbacks are caught and logged to prevent cascade failures.

        Use this when emitting events from non-async contexts (e.g., plugin loading).
        """
        import structlog
        logger = structlog.get_logger(__name__)

        for callback in self._hooks.get(event, []):
            if not callable(callback):
                continue

            try:
                result = callback(*args, **kwargs)
                if inspect.isawaitable(result):
                    # Can't await in sync context, skip async callbacks
                    logger.warning(
                        f"Skipping async callback for {event} in sync context",
                        callback=callback.__name__ if hasattr(callback, '__name__') else str(callback)
                    )
                    continue
            except Exception as e:
                callback_name = callback.__name__ if hasattr(callback, '__name__') else str(callback)
                logger.error(
                    "Hook callback failed (sync)",
                    event=event,
                    callback=callback_name,
                    error=str(e),
                    exc_info=True
                )

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

    # Stat system
    STAT_PACKAGES_REGISTER = "stat:packages_register"

    # NPC Surface system
    NPC_SURFACES_REGISTER = "npc:surfaces_register"

    # Analyzer system
    ANALYZERS_REGISTER = "analyzers:register"

    # System events
    APP_STARTUP = "app:startup"
    APP_SHUTDOWN = "app:shutdown"


class PluginErrorCode:
    """
    Standard error codes for plugin system failures.

    Use these codes in logs and error responses for consistent debugging.
    Format: ERR_{CATEGORY}_{SPECIFIC}
    """

    # Loading errors
    MANIFEST_NOT_FOUND = "ERR_LOAD_MANIFEST_NOT_FOUND"
    MANIFEST_INVALID = "ERR_LOAD_MANIFEST_INVALID"
    MANIFEST_ID_MISMATCH = "ERR_LOAD_MANIFEST_ID_MISMATCH"
    ROUTER_MISSING = "ERR_LOAD_ROUTER_MISSING"
    SPEC_FAILED = "ERR_LOAD_SPEC_FAILED"
    MODULE_EXEC_FAILED = "ERR_LOAD_MODULE_EXEC_FAILED"

    # Permission errors
    PERMISSION_INVALID = "ERR_PERM_INVALID"
    PERMISSION_DENIED = "ERR_PERM_DENIED"
    PERMISSION_UNKNOWN = "ERR_PERM_UNKNOWN"

    # Dependency errors
    DEPENDENCY_MISSING = "ERR_DEP_MISSING"
    DEPENDENCY_DISABLED = "ERR_DEP_DISABLED"
    DEPENDENCY_CIRCULAR = "ERR_DEP_CIRCULAR"

    # Lifecycle errors
    ON_LOAD_FAILED = "ERR_LIFECYCLE_ON_LOAD"
    ON_ENABLE_FAILED = "ERR_LIFECYCLE_ON_ENABLE"
    ON_DISABLE_FAILED = "ERR_LIFECYCLE_ON_DISABLE"

    # Behavior extension errors
    CONDITION_EVAL_FAILED = "ERR_BEHAVIOR_CONDITION_EVAL"
    EFFECT_APPLY_FAILED = "ERR_BEHAVIOR_EFFECT_APPLY"
    CONDITION_TIMEOUT = "ERR_BEHAVIOR_CONDITION_TIMEOUT"
    EFFECT_TIMEOUT = "ERR_BEHAVIOR_EFFECT_TIMEOUT"

    # Capability errors
    CAPABILITY_DB_UNAVAILABLE = "ERR_CAP_DB_UNAVAILABLE"
    CAPABILITY_REDIS_UNAVAILABLE = "ERR_CAP_REDIS_UNAVAILABLE"
    CAPABILITY_INVALID_INPUT = "ERR_CAP_INVALID_INPUT"
