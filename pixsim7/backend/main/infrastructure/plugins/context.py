"""
Plugin Context and Capability APIs

Provides plugins with restricted, permission-aware access to system capabilities.

Instead of giving plugins direct access to DB sessions, services, and internal modules,
PluginContext exposes narrow, well-typed capability APIs that:
- Check permissions before granting access
- Log all plugin actions for observability
- Provide safe, validated interfaces to world/session/NPC state
- Make future sandboxing/out-of-process plugins feasible

See: claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md Phase 16.3
"""

from typing import Optional, Set
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from .permissions import PermissionDeniedError
from .capabilities import (
    WorldReadAPI,
    SessionReadAPI,
    SessionMutationsAPI,
    ComponentAPI,
    BehaviorExtensionAPI,
    LoggingAPI,
)


# Permission constants for capability discovery
_CAPABILITY_PERMISSIONS = {
    'world': ['world:read'],
    'session': ['session:read'],
    'session_write': ['session:write'],
    'components': ['session:write'],
    'behavior': ['behavior:extend_conditions', 'behavior:extend_effects'],
    'log': ['log:emit'],
}


class PluginContext:
    """
    Main context object provided to plugins.

    Provides permission-gated access to capability APIs instead of
    direct access to internal services, DB sessions, etc.

    Available capability APIs:
    - ctx.world: Read world metadata, locations, NPCs
    - ctx.session: Read session flags, relationships
    - ctx.session_write: Mutate session flags, relationships
    - ctx.components: Read/write NPC ECS components (namespaced per plugin)
    - ctx.behavior: Register custom behavior conditions, effects, configs
    - ctx.log: Structured logging

    Usage in plugin routes:
        @router.get("/something")
        async def my_endpoint(ctx: PluginContext = Depends(get_plugin_context("my_plugin"))):
            world = await ctx.world.get_world(world_id)
            await ctx.session.set_session_flag(session_id, "my_flag", True)

            # Use component API (auto-namespaced)
            romance_data = await ctx.components.get_component(session_id, npc_id, "romance", default={})
            await ctx.components.update_component(session_id, npc_id, "romance", {"arousal": 0.5})

            ctx.log.info("Did something")
    """

    # Type hints for IDE autocomplete
    plugin_id: str
    permissions: Set[str]
    world: WorldReadAPI
    session: SessionReadAPI
    session_write: SessionMutationsAPI
    components: ComponentAPI
    behavior: BehaviorExtensionAPI
    log: LoggingAPI

    def __init__(
        self,
        plugin_id: str,
        permissions: list[str],
        db: Optional[AsyncSession] = None,
        redis: Optional[Redis] = None,
    ):
        self.plugin_id = plugin_id
        self.permissions = set(permissions)

        # Create bound logger
        from pixsim_logging import configure_logging
        self.logger = configure_logging(f"plugin.{plugin_id}")

        # Initialize capability APIs
        self.world = WorldReadAPI(plugin_id, self.permissions, self.logger, db)
        self.session = SessionReadAPI(plugin_id, self.permissions, self.logger, db)
        self.session_write = SessionMutationsAPI(plugin_id, self.permissions, self.logger, db)
        self.components = ComponentAPI(plugin_id, self.permissions, self.logger, db)
        self.behavior = BehaviorExtensionAPI(plugin_id, self.permissions, self.logger)
        self.log = LoggingAPI(plugin_id, self.permissions, self.logger)

        # Store raw resources (for future capability APIs)
        self._db = db
        self._redis = redis

    def has_permission(self, permission: str) -> bool:
        """
        Check if plugin has a specific permission.

        Useful for conditional feature enablement.
        """
        return permission in self.permissions

    def require_permission(self, permission: str) -> None:
        """
        Require a permission (raise error if not granted).

        Args:
            permission: Required permission

        Raises:
            PermissionDeniedError: If permission not granted
        """
        if permission not in self.permissions:
            raise PermissionDeniedError(
                self.plugin_id,
                permission,
                "PluginContext.require_permission"
            )

    def get_available_capabilities(self) -> dict[str, bool]:
        """
        Get available capabilities based on plugin's permissions.

        Returns:
            Dict mapping capability names to availability.
            True = has required permission(s), False = missing permission(s).

        Example:
            caps = ctx.get_available_capabilities()
            if caps['world']:
                world = await ctx.world.get_world(world_id)
        """
        result = {}
        for capability, required_perms in _CAPABILITY_PERMISSIONS.items():
            # Capability available if ANY of the required permissions are granted
            result[capability] = any(p in self.permissions for p in required_perms)
        return result
