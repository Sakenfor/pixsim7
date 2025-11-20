"""
Backend Plugin Permission System

Defines the canonical permission model for plugins, mapping high-level permissions
to specific capabilities that plugins can access.

This module provides:
- Permission definitions (what plugins can request)
- Permission validation
- Failure modes for missing/invalid permissions

See: claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md
"""

from enum import Enum
from typing import Literal
from pydantic import BaseModel


# ===== PERMISSION DEFINITIONS =====

class PluginPermission(str, Enum):
    """
    Canonical plugin permissions.

    Each permission grants access to specific capability APIs.
    Plugins declare required permissions in their manifest, and the
    PluginContext will only expose capabilities for granted permissions.
    """

    # ===== World Access =====
    WORLD_READ = "world:read"
    """
    Read world metadata, configuration, and structure.

    Grants access to:
    - WorldReadAPI: get world config, locations, NPCs, scenes
    - Read-only access to world.meta, world.flags

    Use cases: plugins that need to know world state (e.g., custom UI, analytics)
    """

    # ===== Session Access =====
    SESSION_READ = "session:read"
    """
    Read session state (flags, relationships, progress).

    Grants access to:
    - SessionReadAPI: get session flags, relationships, state
    - Read session.flags, session.relationships (immutable views)

    Use cases: plugins that display session info, analytics, exports
    """

    SESSION_WRITE = "session:write"
    """
    Mutate session state (flags, relationships).

    Grants access to:
    - SessionMutationsAPI: set flags, update relationships, modify state
    - Write to session.flags, session.relationships (validated mutations)

    Use cases: gameplay plugins that modify session state (stealth, romance, etc.)

    Constraints:
    - Cannot modify core session fields (id, user_id, world_id, created_at)
    - Cannot delete sessions
    - Mutations are logged with plugin_id for provenance
    """

    # ===== NPC/Relationship Access =====
    NPC_READ = "npc:read"
    """
    Read NPC data and relationships.

    Grants access to:
    - NPCReadAPI: get NPC config, preferences, mood, reputation
    - Read NPC.meta, NPC relationships

    Use cases: plugins that display NPC info, compute suggestions
    """

    NPC_WRITE = "npc:write"
    """
    Mutate NPC state (mood, reputation, preferences).

    Grants access to:
    - NPCMutationsAPI: update mood, reputation, preferences

    Use cases: plugins that affect NPC state based on player actions

    Constraints:
    - Cannot modify NPC identity (id, name, role)
    - Cannot delete NPCs
    - Mutations are logged with plugin_id
    """

    # ===== Behavior Extensions =====
    BEHAVIOR_EXTEND_CONDITIONS = "behavior:extend_conditions"
    """
    Register custom behavior condition evaluators.

    Grants access to:
    - BehaviorExtensionAPI.register_condition_evaluator()
    - Conditions are namespaced: "plugin:<plugin_id>:<condition_name>"

    Use cases: plugins that add custom activity selection logic

    Constraints:
    - Condition IDs must be namespaced with plugin ID
    - Conditions must return boolean (feasible/not feasible)
    - Failing conditions are treated as False (do not crash behavior system)
    """

    BEHAVIOR_EXTEND_EFFECTS = "behavior:extend_effects"
    """
    Register custom activity effect handlers.

    Grants access to:
    - BehaviorExtensionAPI.register_effect_handler()
    - Effects are namespaced: "effect:plugin:<plugin_id>:<effect_name>"

    Use cases: plugins that add custom activity outcomes (mood changes, flag sets)

    Constraints:
    - Effect IDs must be namespaced with plugin ID
    - Failing effects are skipped (do not crash behavior system)
    - Effects are logged with plugin_id
    """

    BEHAVIOR_CONFIGURE_SIMULATION = "behavior:configure_simulation"
    """
    Influence simulation tier configuration for behavior system.

    Grants access to:
    - BehaviorExtensionAPI.suggest_simulation_config()
    - Can provide default simulationConfig for worlds

    Use cases: plugins that define custom simulation tiers (e.g., performance presets)

    Constraints:
    - Cannot override user-configured simulationConfig
    - Suggestions are merged, not replaced
    """

    # ===== Generation Access =====
    GENERATION_SUBMIT = "generation:submit"
    """
    Submit generation requests.

    Grants access to:
    - GenerationAPI.submit_generation()
    - Create generation jobs via /api/v1/generations

    Use cases: plugins that generate content (scenes, dialogue, images)

    Constraints:
    - Subject to user quotas and rate limits
    - Cannot bypass generation validation
    - Cannot access other users' generations
    """

    GENERATION_READ = "generation:read"
    """
    Read generation results.

    Grants access to:
    - GenerationAPI.get_generation()
    - Read generation status, results, metadata

    Use cases: plugins that display generation progress, results
    """

    # ===== Logging & Observability =====
    LOG_EMIT = "log:emit"
    """
    Emit structured logs and metrics.

    Grants access to:
    - LoggingAPI: structured logging with plugin_id tag
    - Metrics emission (counters, gauges, timers)

    Use cases: all plugins (for debugging, monitoring, analytics)

    Constraints:
    - Logs are tagged with plugin_id automatically
    - Cannot emit logs for other plugins
    - Cannot modify log levels globally
    """

    # ===== Event Access =====
    EVENT_SUBSCRIBE = "event:subscribe"
    """
    Subscribe to event bus events.

    Grants access to:
    - EventAPI.subscribe(pattern, handler)
    - React to domain events (session:created, npc:spawned, etc.)

    Use cases: event handler plugins (metrics, webhooks, analytics)

    Constraints:
    - Can only subscribe, not emit events (use event:emit for that)
    - Failing handlers do not crash the event bus
    """

    EVENT_EMIT = "event:emit"
    """
    Emit events to the event bus.

    Grants access to:
    - EventAPI.emit(event_type, data)
    - Publish custom events

    Use cases: plugins that trigger custom workflows, integrations

    Constraints:
    - Event types must be namespaced: "plugin:<plugin_id>:<event_name>"
    - Cannot emit core system events (session:created, etc.)
    """

    # ===== Admin Access =====
    ADMIN_ROUTES = "admin:routes"
    """
    Expose admin-only endpoints.

    Grants access to:
    - Register routes under /api/v1/admin/*
    - Access admin-only data and operations

    Use cases: plugins that provide admin dashboards, diagnostics, management UI

    Constraints:
    - Requires global config flag: settings.enable_admin_plugins
    - Routes are automatically protected with admin auth middleware
    - Cannot bypass user authentication
    """

    # ===== Database Access (Restricted) =====
    DB_READ = "db:read"
    """
    Read-only database access (scoped queries).

    Grants access to:
    - DatabaseAPI: read-only query helpers
    - Query sessions, worlds, NPCs (no raw DB session)

    Use cases: plugins that need to query data beyond provided APIs

    Constraints:
    - Read-only (no INSERT/UPDATE/DELETE)
    - Scoped to user's own data (cannot access other users' data)
    - Must use provided query helpers, not raw DB session
    """

    DB_WRITE = "db:write"
    """
    Write database access (scoped mutations).

    Grants access to:
    - DatabaseAPI: write helpers for session/world mutations

    Use cases: advanced plugins that need to persist custom state

    Constraints:
    - Cannot modify core tables directly (users, accounts, etc.)
    - Cannot delete core entities (worlds, sessions, NPCs)
    - Mutations are validated and logged with plugin_id
    - Recommend using session.flags/relationships instead of DB writes
    """

    # ===== Redis Access =====
    REDIS_READ = "redis:read"
    """
    Read from Redis (cache, session state).

    Grants access to:
    - RedisAPI.get(), RedisAPI.exists()
    - Read cached data

    Use cases: plugins that need to check cache state
    """

    REDIS_WRITE = "redis:write"
    """
    Write to Redis (cache, temporary state).

    Grants access to:
    - RedisAPI.set(), RedisAPI.delete(), RedisAPI.expire()

    Use cases: plugins that cache data, track temporary state

    Constraints:
    - Keys must be namespaced: "plugin:<plugin_id>:<key>"
    - Cannot modify core cache keys
    - TTL recommended for all keys
    """


# ===== PERMISSION GROUPS =====

class PermissionGroup:
    """
    Pre-defined permission groups for common plugin patterns.

    Plugins can request groups instead of individual permissions.
    """

    # Read-only access to world/session state
    READONLY = [
        PluginPermission.WORLD_READ,
        PluginPermission.SESSION_READ,
        PluginPermission.NPC_READ,
        PluginPermission.LOG_EMIT,
    ]

    # Gameplay mechanics (modify session state)
    GAMEPLAY = [
        PluginPermission.WORLD_READ,
        PluginPermission.SESSION_READ,
        PluginPermission.SESSION_WRITE,
        PluginPermission.NPC_READ,
        PluginPermission.NPC_WRITE,
        PluginPermission.LOG_EMIT,
    ]

    # Behavior extensions (custom conditions/effects)
    BEHAVIOR = [
        PluginPermission.WORLD_READ,
        PluginPermission.SESSION_READ,
        PluginPermission.NPC_READ,
        PluginPermission.BEHAVIOR_EXTEND_CONDITIONS,
        PluginPermission.BEHAVIOR_EXTEND_EFFECTS,
        PluginPermission.LOG_EMIT,
    ]

    # Event handling (metrics, webhooks, analytics)
    EVENT_HANDLER = [
        PluginPermission.EVENT_SUBSCRIBE,
        PluginPermission.LOG_EMIT,
    ]

    # Content generation
    GENERATION = [
        PluginPermission.WORLD_READ,
        PluginPermission.SESSION_READ,
        PluginPermission.NPC_READ,
        PluginPermission.GENERATION_SUBMIT,
        PluginPermission.GENERATION_READ,
        PluginPermission.LOG_EMIT,
    ]

    # Admin/diagnostics
    ADMIN = [
        PluginPermission.WORLD_READ,
        PluginPermission.SESSION_READ,
        PluginPermission.NPC_READ,
        PluginPermission.ADMIN_ROUTES,
        PluginPermission.LOG_EMIT,
    ]


# ===== PERMISSION VALIDATION =====

class PermissionValidationResult(BaseModel):
    """Result of permission validation"""
    valid: bool
    granted: list[str]
    denied: list[str]
    unknown: list[str]
    warnings: list[str]


def validate_permissions(
    requested: list[str],
    allow_unknown: bool = False,
) -> PermissionValidationResult:
    """
    Validate a list of requested permissions.

    Args:
        requested: List of permission strings from plugin manifest
        allow_unknown: If True, unknown permissions are ignored (with warning)
                      If False, unknown permissions cause validation to fail

    Returns:
        PermissionValidationResult with validation status and details
    """
    valid_permissions = set(p.value for p in PluginPermission)

    granted = []
    denied = []
    unknown = []
    warnings = []

    for perm in requested:
        if perm in valid_permissions:
            granted.append(perm)
        else:
            unknown.append(perm)
            warnings.append(f"Unknown permission: {perm}")

    # Check for dangerous permission combinations
    if PluginPermission.DB_WRITE.value in granted:
        warnings.append(
            "Permission 'db:write' grants direct database access. "
            "Consider using session:write or npc:write instead."
        )

    if PluginPermission.ADMIN_ROUTES.value in granted:
        warnings.append(
            "Permission 'admin:routes' grants admin access. "
            "Ensure plugin is from a trusted source."
        )

    # Determine validity
    valid = len(unknown) == 0 or allow_unknown

    return PermissionValidationResult(
        valid=valid,
        granted=granted,
        denied=denied,
        unknown=unknown,
        warnings=warnings,
    )


def expand_permission_groups(permissions: list[str]) -> list[str]:
    """
    Expand permission group names to individual permissions.

    Args:
        permissions: List of permission strings (may include group names)

    Returns:
        Expanded list of individual permissions

    Example:
        expand_permission_groups(["group:gameplay", "log:emit"])
        => ["world:read", "session:read", "session:write", "npc:read", "npc:write", "log:emit"]
    """
    expanded = set()

    for perm in permissions:
        if perm.startswith("group:"):
            group_name = perm[6:].upper()
            if hasattr(PermissionGroup, group_name):
                group_perms = getattr(PermissionGroup, group_name)
                expanded.update(p.value for p in group_perms)
            else:
                # Unknown group - just add as-is (will be caught by validation)
                expanded.add(perm)
        else:
            expanded.add(perm)

    return list(expanded)


# ===== FAILURE MODES =====

class PermissionDeniedBehavior(str, Enum):
    """
    How to handle capability access when permission is missing.
    """

    RAISE = "raise"
    """
    Raise PermissionDeniedError - plugin code must handle the exception.
    Use for critical operations where failure should stop execution.
    """

    WARN = "warn"
    """
    Log a warning and return None/empty result.
    Use for optional features where plugin can continue without the capability.
    """

    SILENT = "silent"
    """
    Silently return None/empty result (no warning).
    Use for capability checks (plugin wants to test if it has permission).
    """


class PermissionDeniedError(Exception):
    """
    Raised when a plugin attempts to use a capability it doesn't have permission for.
    """

    def __init__(self, plugin_id: str, permission: str, capability: str):
        self.plugin_id = plugin_id
        self.permission = permission
        self.capability = capability
        super().__init__(
            f"Plugin '{plugin_id}' attempted to use capability '{capability}' "
            f"but lacks required permission '{permission}'"
        )


# ===== CAPABILITY METADATA =====

class CapabilityMetadata(BaseModel):
    """
    Metadata about a capability API.

    Used for documentation, validation, and diagnostics.
    """

    name: str
    """Capability API name (e.g., 'WorldReadAPI')"""

    required_permission: str
    """Permission required to access this capability"""

    description: str
    """What this capability does"""

    constraints: list[str] = []
    """Constraints and limitations"""

    examples: list[str] = []
    """Example use cases"""


# ===== CAPABILITY REGISTRY - REMOVED (Dead Code) =====
#
# NOTE: Capability registry was removed as dead code (2025-11-20)
# - Was defined and written to, but never read from anywhere in the codebase
# - Capability APIs directly check permissions via BaseCapabilityAPI._check_permission()
# - No introspection/documentation use case materialized
#
# If capability introspection is needed in the future, consider:
# - Auto-generating capability docs from CapabilityMetadata docstrings
# - Using type hints for IDE autocomplete instead of runtime registry
