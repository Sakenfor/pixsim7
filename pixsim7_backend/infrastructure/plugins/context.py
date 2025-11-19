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

from typing import Optional, Any, Callable
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis
import structlog

from .permissions import PluginPermission, PermissionDeniedError, PermissionDeniedBehavior
from .types import PluginManifest


# ===== BASE CAPABILITY API =====

class BaseCapabilityAPI:
    """
    Base class for capability APIs.

    Provides permission checking and logging for all capability methods.
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
    ):
        self.plugin_id = plugin_id
        self.permissions = permissions
        self.logger = logger

    def _check_permission(
        self,
        required: str,
        capability_name: str,
        behavior: PermissionDeniedBehavior = PermissionDeniedBehavior.RAISE,
    ) -> bool:
        """
        Check if plugin has required permission.

        Args:
            required: Required permission (e.g., "world:read")
            capability_name: Name of capability being accessed (for error messages)
            behavior: What to do if permission is denied

        Returns:
            True if permission granted, False if denied (and behavior != RAISE)

        Raises:
            PermissionDeniedError: If permission denied and behavior == RAISE
        """
        if required not in self.permissions:
            if behavior == PermissionDeniedBehavior.RAISE:
                raise PermissionDeniedError(self.plugin_id, required, capability_name)
            elif behavior == PermissionDeniedBehavior.WARN:
                self.logger.warning(
                    "Permission denied",
                    plugin_id=self.plugin_id,
                    required_permission=required,
                    capability=capability_name,
                )
            # SILENT: do nothing
            return False
        return True


# ===== WORLD READ API =====

class WorldReadAPI(BaseCapabilityAPI):
    """
    Read-only access to world metadata and configuration.

    Required permission: world:read
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
        db: Optional[AsyncSession] = None,
    ):
        super().__init__(plugin_id, permissions, logger)
        self.db = db

    async def get_world(self, world_id: int) -> Optional[dict]:
        """
        Get world metadata by ID.

        Returns:
            World data (id, name, meta, flags) or None if not found/no permission
        """
        if not self._check_permission(
            PluginPermission.WORLD_READ.value,
            "WorldReadAPI.get_world",
            PermissionDeniedBehavior.WARN,
        ):
            return None

        if not self.db:
            self.logger.error("WorldReadAPI requires database access")
            return None

        from pixsim7_backend.domain.game.world import GameWorld

        result = await self.db.execute(
            "SELECT id, name, description, meta, flags FROM game_worlds WHERE id = :world_id",
            {"world_id": world_id}
        )
        row = result.fetchone()

        if not row:
            return None

        self.logger.debug(
            "get_world",
            plugin_id=self.plugin_id,
            world_id=world_id,
        )

        return {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "meta": row[3],
            "flags": row[4],
        }

    async def get_world_config(self, world_id: int, key: str) -> Optional[Any]:
        """
        Get a specific config value from world.meta.

        Args:
            world_id: World ID
            key: Dot-separated key path (e.g., "behavior.enabledPlugins")

        Returns:
            Config value or None if not found
        """
        world = await self.get_world(world_id)
        if not world or not world.get("meta"):
            return None

        # Navigate nested keys
        value = world["meta"]
        for part in key.split("."):
            if isinstance(value, dict):
                value = value.get(part)
            else:
                return None

        return value

    async def list_world_locations(self, world_id: int) -> list[dict]:
        """
        List all locations in a world.

        Returns:
            List of location dicts (id, name, location_type, meta)
        """
        if not self._check_permission(
            PluginPermission.WORLD_READ.value,
            "WorldReadAPI.list_world_locations",
            PermissionDeniedBehavior.WARN,
        ):
            return []

        if not self.db:
            return []

        result = await self.db.execute(
            "SELECT id, name, location_type, meta FROM game_locations WHERE world_id = :world_id",
            {"world_id": world_id}
        )

        locations = [
            {
                "id": row[0],
                "name": row[1],
                "location_type": row[2],
                "meta": row[3],
            }
            for row in result.fetchall()
        ]

        self.logger.debug(
            "list_world_locations",
            plugin_id=self.plugin_id,
            world_id=world_id,
            count=len(locations),
        )

        return locations

    async def list_world_npcs(self, world_id: int) -> list[dict]:
        """
        List all NPCs in a world.

        Returns:
            List of NPC dicts (id, name, role, meta)
        """
        if not self._check_permission(
            PluginPermission.WORLD_READ.value,
            "WorldReadAPI.list_world_npcs",
            PermissionDeniedBehavior.WARN,
        ):
            return []

        if not self.db:
            return []

        result = await self.db.execute(
            "SELECT id, name, role, meta FROM game_npcs WHERE world_id = :world_id",
            {"world_id": world_id}
        )

        npcs = [
            {
                "id": row[0],
                "name": row[1],
                "role": row[2],
                "meta": row[3],
            }
            for row in result.fetchall()
        ]

        self.logger.debug(
            "list_world_npcs",
            plugin_id=self.plugin_id,
            world_id=world_id,
            count=len(npcs),
        )

        return npcs


# ===== SESSION READ API =====

class SessionReadAPI(BaseCapabilityAPI):
    """
    Read-only access to session state.

    Required permission: session:read
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
        db: Optional[AsyncSession] = None,
    ):
        super().__init__(plugin_id, permissions, logger)
        self.db = db

    async def get_session(self, session_id: int) -> Optional[dict]:
        """
        Get session state by ID.

        Returns:
            Session data (id, world_id, flags, relationships) or None
        """
        if not self._check_permission(
            PluginPermission.SESSION_READ.value,
            "SessionReadAPI.get_session",
            PermissionDeniedBehavior.WARN,
        ):
            return None

        if not self.db:
            self.logger.error("SessionReadAPI requires database access")
            return None

        result = await self.db.execute(
            "SELECT id, world_id, flags, relationships FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            return None

        self.logger.debug(
            "get_session",
            plugin_id=self.plugin_id,
            session_id=session_id,
        )

        return {
            "id": row[0],
            "world_id": row[1],
            "flags": row[2] or {},
            "relationships": row[3] or {},
        }

    async def get_session_flag(self, session_id: int, flag_key: str) -> Optional[Any]:
        """
        Get a specific flag from session.flags.

        Args:
            session_id: Session ID
            flag_key: Dot-separated flag path (e.g., "stealth.pickpocket_attempts")

        Returns:
            Flag value or None if not found
        """
        session = await self.get_session(session_id)
        if not session:
            return None

        # Navigate nested keys
        value = session["flags"]
        for part in flag_key.split("."):
            if isinstance(value, dict):
                value = value.get(part)
            else:
                return None

        return value

    async def get_relationship(self, session_id: int, npc_key: str) -> Optional[dict]:
        """
        Get relationship state for an NPC.

        Args:
            session_id: Session ID
            npc_key: NPC key (e.g., "npc:123" or "role:friend")

        Returns:
            Relationship dict or None if not found
        """
        session = await self.get_session(session_id)
        if not session:
            return None

        return session["relationships"].get(npc_key)


# ===== SESSION MUTATIONS API =====

class SessionMutationsAPI(BaseCapabilityAPI):
    """
    Write access to session state (flags, relationships).

    Required permission: session:write
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
        db: Optional[AsyncSession] = None,
    ):
        super().__init__(plugin_id, permissions, logger)
        self.db = db

    async def set_session_flag(
        self,
        session_id: int,
        flag_key: str,
        value: Any,
    ) -> bool:
        """
        Set a flag in session.flags.

        Args:
            session_id: Session ID
            flag_key: Flag key (will be namespaced under plugin ID)
            value: Flag value (must be JSON-serializable)

        Returns:
            True if successful, False otherwise
        """
        if not self._check_permission(
            PluginPermission.SESSION_WRITE.value,
            "SessionMutationsAPI.set_session_flag",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        if not self.db:
            self.logger.error("SessionMutationsAPI requires database access")
            return False

        from pixsim7_backend.domain.game.session import GameSession

        # Fetch session
        result = await self.db.execute(
            "SELECT id, flags FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            self.logger.warning(
                "Session not found",
                plugin_id=self.plugin_id,
                session_id=session_id,
            )
            return False

        session_id_db, flags = row
        flags = flags or {}

        # Namespace flag under plugin ID
        namespaced_key = f"plugin:{self.plugin_id}:{flag_key}"

        # Set flag
        flags[namespaced_key] = value

        # Update session
        await self.db.execute(
            "UPDATE game_sessions SET flags = :flags WHERE id = :session_id",
            {"flags": flags, "session_id": session_id}
        )
        await self.db.commit()

        self.logger.info(
            "set_session_flag",
            plugin_id=self.plugin_id,
            session_id=session_id,
            flag_key=namespaced_key,
        )

        return True

    async def update_relationship(
        self,
        session_id: int,
        npc_key: str,
        updates: dict,
    ) -> bool:
        """
        Update relationship state for an NPC.

        Args:
            session_id: Session ID
            npc_key: NPC key (e.g., "npc:123")
            updates: Partial relationship data to merge (affinity, trust, etc.)

        Returns:
            True if successful, False otherwise
        """
        if not self._check_permission(
            PluginPermission.SESSION_WRITE.value,
            "SessionMutationsAPI.update_relationship",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        if not self.db:
            return False

        # Fetch session
        result = await self.db.execute(
            "SELECT id, relationships FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            return False

        session_id_db, relationships = row
        relationships = relationships or {}

        # Get existing relationship or create new
        if npc_key not in relationships:
            relationships[npc_key] = {}

        # Merge updates
        relationships[npc_key].update(updates)

        # Track plugin provenance
        if "meta" not in relationships[npc_key]:
            relationships[npc_key]["meta"] = {}
        relationships[npc_key]["meta"]["last_modified_by"] = self.plugin_id

        # Update session
        await self.db.execute(
            "UPDATE game_sessions SET relationships = :relationships WHERE id = :session_id",
            {"relationships": relationships, "session_id": session_id}
        )
        await self.db.commit()

        self.logger.info(
            "update_relationship",
            plugin_id=self.plugin_id,
            session_id=session_id,
            npc_key=npc_key,
            updates=list(updates.keys()),
        )

        return True


# ===== COMPONENT API =====

class ComponentAPI(BaseCapabilityAPI):
    """
    Access to NPC ECS components (entity-component system).

    Required permission: session:write (for write operations)

    Provides structured access to NPC components stored in session.flags.npcs.
    Plugins can define and manage their own components using namespaced keys.
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
        db: Optional[AsyncSession] = None,
    ):
        super().__init__(plugin_id, permissions, logger)
        self.db = db

    async def get_component(
        self,
        session_id: int,
        npc_id: int,
        component_name: str,
        default: Any = None,
    ) -> Optional[dict]:
        """
        Get a component from an NPC entity.

        Args:
            session_id: Session ID
            npc_id: NPC ID
            component_name: Component name (will be namespaced for plugin components)
            default: Default value if component doesn't exist

        Returns:
            Component data dict or default value

        Example:
            # Get plugin component
            romance_data = await ctx.components.get_component(
                session_id=123,
                npc_id=456,
                component_name="romance",  # Auto-namespaced to "plugin:my_plugin:romance"
                default={}
            )

            # Get core component (requires exact name)
            core = await ctx.components.get_component(
                session_id=123,
                npc_id=456,
                component_name="core",
                default={}
            )
        """
        if not self._check_permission(
            PluginPermission.SESSION_READ.value,
            "ComponentAPI.get_component",
            PermissionDeniedBehavior.WARN,
        ):
            return default

        if not self.db:
            self.logger.error("ComponentAPI requires database access")
            return default

        # Fetch session
        result = await self.db.execute(
            "SELECT id, flags FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            self.logger.warning(
                "Session not found",
                plugin_id=self.plugin_id,
                session_id=session_id,
            )
            return default

        session_id_db, flags = row
        flags = flags or {}

        # Namespace component name for non-core components
        # Core components: "core", "romance", "stealth", "mood", "behavior", "interactions"
        core_components = {"core", "romance", "stealth", "mood", "behavior", "interactions", "quests"}
        if component_name not in core_components and not component_name.startswith("plugin:"):
            component_name = f"plugin:{self.plugin_id}:{component_name}"

        # Use ECS helper to get component
        from pixsim7_backend.domain.game.ecs import get_npc_component

        # Create a simple object to mimic session
        class SessionStub:
            def __init__(self, flags_data):
                self.flags = flags_data

        session_stub = SessionStub(flags)
        component_data = get_npc_component(session_stub, npc_id, component_name, default=default)

        self.logger.debug(
            "get_component",
            plugin_id=self.plugin_id,
            session_id=session_id,
            npc_id=npc_id,
            component_name=component_name,
            found=component_data != default,
        )

        return component_data

    async def set_component(
        self,
        session_id: int,
        npc_id: int,
        component_name: str,
        value: dict,
        validate: bool = True,
    ) -> bool:
        """
        Set a component for an NPC entity.

        Args:
            session_id: Session ID
            npc_id: NPC ID
            component_name: Component name (will be namespaced for plugin components)
            value: Component data (must be a dict)
            validate: Whether to validate against component schema (if available)

        Returns:
            True if successful, False otherwise

        Example:
            success = await ctx.components.set_component(
                session_id=123,
                npc_id=456,
                component_name="romance",
                value={
                    "arousal": 0.5,
                    "stage": "dating",
                    "customStats": {"kissCount": 3}
                }
            )
        """
        if not self._check_permission(
            PluginPermission.SESSION_WRITE.value,
            "ComponentAPI.set_component",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        if not self.db:
            self.logger.error("ComponentAPI requires database access")
            return False

        # Fetch session
        result = await self.db.execute(
            "SELECT id, flags FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            self.logger.warning(
                "Session not found",
                plugin_id=self.plugin_id,
                session_id=session_id,
            )
            return False

        session_id_db, flags = row
        flags = flags or {}

        # Namespace component name for non-core components
        core_components = {"core", "romance", "stealth", "mood", "behavior", "interactions", "quests"}
        if component_name not in core_components and not component_name.startswith("plugin:"):
            component_name = f"plugin:{self.plugin_id}:{component_name}"

        # Use ECS helper to set component
        from pixsim7_backend.domain.game.ecs import set_npc_component

        # Create a simple object to mimic session
        class SessionStub:
            def __init__(self, flags_data):
                self.flags = flags_data

        session_stub = SessionStub(flags)
        set_npc_component(session_stub, npc_id, component_name, value, validate=validate)

        # Update session in database
        await self.db.execute(
            "UPDATE game_sessions SET flags = :flags WHERE id = :session_id",
            {"flags": session_stub.flags, "session_id": session_id}
        )
        await self.db.commit()

        self.logger.info(
            "set_component",
            plugin_id=self.plugin_id,
            session_id=session_id,
            npc_id=npc_id,
            component_name=component_name,
        )

        return True

    async def update_component(
        self,
        session_id: int,
        npc_id: int,
        component_name: str,
        updates: dict,
        validate: bool = True,
    ) -> bool:
        """
        Update specific fields in a component (partial update).

        Args:
            session_id: Session ID
            npc_id: NPC ID
            component_name: Component name (will be namespaced for plugin components)
            updates: Partial component data to merge
            validate: Whether to validate against component schema (if available)

        Returns:
            True if successful, False otherwise

        Example:
            success = await ctx.components.update_component(
                session_id=123,
                npc_id=456,
                component_name="romance",
                updates={"arousal": 0.6}  # Only update arousal
            )
        """
        if not self._check_permission(
            PluginPermission.SESSION_WRITE.value,
            "ComponentAPI.update_component",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        if not self.db:
            return False

        # Fetch session
        result = await self.db.execute(
            "SELECT id, flags FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            return False

        session_id_db, flags = row
        flags = flags or {}

        # Namespace component name
        core_components = {"core", "romance", "stealth", "mood", "behavior", "interactions", "quests"}
        if component_name not in core_components and not component_name.startswith("plugin:"):
            component_name = f"plugin:{self.plugin_id}:{component_name}"

        # Use ECS helper to update component
        from pixsim7_backend.domain.game.ecs import update_npc_component

        class SessionStub:
            def __init__(self, flags_data):
                self.flags = flags_data

        session_stub = SessionStub(flags)
        update_npc_component(session_stub, npc_id, component_name, updates, validate=validate)

        # Update session in database
        await self.db.execute(
            "UPDATE game_sessions SET flags = :flags WHERE id = :session_id",
            {"flags": session_stub.flags, "session_id": session_id}
        )
        await self.db.commit()

        self.logger.info(
            "update_component",
            plugin_id=self.plugin_id,
            session_id=session_id,
            npc_id=npc_id,
            component_name=component_name,
            updates=list(updates.keys()),
        )

        return True

    async def delete_component(
        self,
        session_id: int,
        npc_id: int,
        component_name: str,
    ) -> bool:
        """
        Delete a component from an NPC entity.

        Args:
            session_id: Session ID
            npc_id: NPC ID
            component_name: Component name (will be namespaced for plugin components)

        Returns:
            True if successful, False otherwise

        Note:
            Core components cannot be deleted. Only plugin-owned components can be removed.
        """
        if not self._check_permission(
            PluginPermission.SESSION_WRITE.value,
            "ComponentAPI.delete_component",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        if not self.db:
            return False

        # Fetch session
        result = await self.db.execute(
            "SELECT id, flags FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            return False

        session_id_db, flags = row
        flags = flags or {}

        # Namespace component name
        core_components = {"core", "romance", "stealth", "mood", "behavior", "interactions", "quests"}
        if component_name in core_components:
            self.logger.warning(
                "Cannot delete core component",
                plugin_id=self.plugin_id,
                component_name=component_name,
            )
            return False

        if not component_name.startswith("plugin:"):
            component_name = f"plugin:{self.plugin_id}:{component_name}"

        # Use ECS helper to delete component
        from pixsim7_backend.domain.game.ecs import delete_npc_component

        class SessionStub:
            def __init__(self, flags_data):
                self.flags = flags_data

        session_stub = SessionStub(flags)
        delete_npc_component(session_stub, npc_id, component_name)

        # Update session in database
        await self.db.execute(
            "UPDATE game_sessions SET flags = :flags WHERE id = :session_id",
            {"flags": session_stub.flags, "session_id": session_id}
        )
        await self.db.commit()

        self.logger.info(
            "delete_component",
            plugin_id=self.plugin_id,
            session_id=session_id,
            npc_id=npc_id,
            component_name=component_name,
        )

        return True


# ===== LOGGING API =====

class LoggingAPI(BaseCapabilityAPI):
    """
    Structured logging for plugins.

    Required permission: log:emit
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
    ):
        super().__init__(plugin_id, permissions, logger)

    def info(self, message: str, **kwargs):
        """Log info message"""
        if self._check_permission(
            PluginPermission.LOG_EMIT.value,
            "LoggingAPI.info",
            PermissionDeniedBehavior.SILENT,
        ):
            self.logger.info(message, plugin_id=self.plugin_id, **kwargs)

    def warning(self, message: str, **kwargs):
        """Log warning message"""
        if self._check_permission(
            PluginPermission.LOG_EMIT.value,
            "LoggingAPI.warning",
            PermissionDeniedBehavior.SILENT,
        ):
            self.logger.warning(message, plugin_id=self.plugin_id, **kwargs)

    def error(self, message: str, **kwargs):
        """Log error message"""
        if self._check_permission(
            PluginPermission.LOG_EMIT.value,
            "LoggingAPI.error",
            PermissionDeniedBehavior.SILENT,
        ):
            self.logger.error(message, plugin_id=self.plugin_id, **kwargs)

    def debug(self, message: str, **kwargs):
        """Log debug message"""
        if self._check_permission(
            PluginPermission.LOG_EMIT.value,
            "LoggingAPI.debug",
            PermissionDeniedBehavior.SILENT,
        ):
            self.logger.debug(message, plugin_id=self.plugin_id, **kwargs)


# ===== BEHAVIOR EXTENSION API =====

class BehaviorExtensionAPI(BaseCapabilityAPI):
    """
    Register custom behavior conditions and effects.

    Required permissions:
    - behavior:extend_conditions
    - behavior:extend_effects
    - behavior:configure_simulation
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
    ):
        super().__init__(plugin_id, permissions, logger)

    def register_condition_evaluator(
        self,
        condition_name: str,
        evaluator: Callable,
        description: Optional[str] = None,
        required_context: Optional[list[str]] = None,
    ) -> bool:
        """
        Register a custom behavior condition evaluator.

        Args:
            condition_name: Condition name (will be namespaced)
            evaluator: Callable that takes context dict and returns bool
            description: Human-readable description
            required_context: List of required context keys

        Returns:
            True if registered, False if permission denied

        Example:
            def has_disguise(context):
                session_flags = context.get('session_flags', {})
                return session_flags.get('stealth', {}).get('has_disguise', False)

            ctx.behavior.register_condition_evaluator(
                'has_disguise',
                has_disguise,
                description='Check if player has a disguise',
                required_context=['session_flags']
            )
        """
        if not self._check_permission(
            PluginPermission.BEHAVIOR_EXTEND_CONDITIONS.value,
            "BehaviorExtensionAPI.register_condition_evaluator",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        # Namespace condition ID
        condition_id = f"plugin:{self.plugin_id}:{condition_name}"

        # Register in global registry
        from .behavior_registry import behavior_registry

        success = behavior_registry.register_condition(
            condition_id=condition_id,
            plugin_id=self.plugin_id,
            evaluator=evaluator,
            description=description,
            required_context=required_context,
        )

        if success:
            self.logger.info(
                "Registered behavior condition",
                plugin_id=self.plugin_id,
                condition_id=condition_id,
            )

        return success

    def register_effect_handler(
        self,
        effect_name: str,
        handler: Callable,
        description: Optional[str] = None,
        default_params: Optional[dict] = None,
    ) -> bool:
        """
        Register a custom activity effect handler.

        Args:
            effect_name: Effect name (will be namespaced)
            handler: Callable that applies the effect (context, params) -> result
            description: Human-readable description
            default_params: Default parameters for this effect

        Returns:
            True if registered, False if permission denied

        Example:
            def arousal_boost_effect(context, params):
                boost = params.get('amount', 0.1)
                # Apply arousal boost logic
                return {'arousal_delta': boost}

            ctx.behavior.register_effect_handler(
                'arousal_boost',
                arousal_boost_effect,
                description='Increase NPC arousal',
                default_params={'amount': 0.1}
            )
        """
        if not self._check_permission(
            PluginPermission.BEHAVIOR_EXTEND_EFFECTS.value,
            "BehaviorExtensionAPI.register_effect_handler",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        # Namespace effect ID
        effect_id = f"effect:plugin:{self.plugin_id}:{effect_name}"

        # Register in global registry
        from .behavior_registry import behavior_registry

        success = behavior_registry.register_effect(
            effect_id=effect_id,
            plugin_id=self.plugin_id,
            handler=handler,
            description=description,
            default_params=default_params,
        )

        if success:
            self.logger.info(
                "Registered behavior effect",
                plugin_id=self.plugin_id,
                effect_id=effect_id,
            )

        return success

    def register_simulation_config(
        self,
        config_name: str,
        config_fn: Callable,
        description: Optional[str] = None,
        priority: int = 100,
    ) -> bool:
        """
        Register a simulation config provider.

        Args:
            config_name: Config provider name (will be namespaced)
            config_fn: Function that returns simulation config dict
            description: Human-readable description
            priority: Priority (lower = higher priority, defaults have priority 1000)

        Returns:
            True if registered, False if permission denied

        Example:
            def performance_config():
                return {
                    'max_active_npcs': 5,
                    'update_frequency_seconds': 300,
                }

            ctx.behavior.register_simulation_config(
                'performance',
                performance_config,
                description='Performance-optimized simulation settings',
                priority=50  # Higher priority than defaults
            )
        """
        if not self._check_permission(
            PluginPermission.BEHAVIOR_CONFIGURE_SIMULATION.value,
            "BehaviorExtensionAPI.register_simulation_config",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        # Namespace provider ID
        provider_id = f"plugin:{self.plugin_id}:{config_name}"

        # Register in global registry
        from .behavior_registry import behavior_registry

        success = behavior_registry.register_simulation_config(
            provider_id=provider_id,
            plugin_id=self.plugin_id,
            config_fn=config_fn,
            description=description,
            priority=priority,
        )

        if success:
            self.logger.info(
                "Registered simulation config provider",
                plugin_id=self.plugin_id,
                provider_id=provider_id,
                priority=priority,
            )

        return success

    def register_component_schema(
        self,
        component_name: str,
        schema: dict,
        description: Optional[str] = None,
        metrics: Optional[dict] = None,
    ) -> bool:
        """
        Register a component schema and associated metrics for a plugin.

        Args:
            component_name: Component name (will be namespaced if not already)
            schema: Component schema (JSON schema or dict of field definitions)
            description: Human-readable description
            metrics: Metric definitions (metricId -> {type, min, max, path, ...})

        Returns:
            True if registered, False if permission denied

        Example:
            success = ctx.behavior.register_component_schema(
                component_name="romance",  # Auto-namespaced to "plugin:game-romance"
                schema={
                    "arousal": {"type": "float", "min": 0, "max": 1},
                    "stage": {"type": "string", "enum": ["none", "flirting", "dating", "partner"]},
                    "consentLevel": {"type": "float", "min": 0, "max": 1}
                },
                description="Romance system component for NPCs",
                metrics={
                    "npcRelationship.arousal": {
                        "type": "float",
                        "min": 0,
                        "max": 1,
                        "component": "plugin:game-romance",
                        "path": "arousal",
                        "label": "Arousal"
                    },
                    "npcRelationship.romanceStage": {
                        "type": "enum",
                        "values": ["none", "flirting", "dating", "partner"],
                        "component": "plugin:game-romance",
                        "path": "stage",
                        "label": "Romance Stage"
                    }
                }
            )
        """
        if not self._check_permission(
            PluginPermission.BEHAVIOR_EXTEND_CONDITIONS.value,
            "BehaviorExtensionAPI.register_component_schema",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        # Namespace component name for plugins
        core_components = {"core", "romance", "stealth", "mood", "behavior", "interactions", "quests"}
        if component_name in core_components:
            self.logger.warning(
                "Cannot register core component name",
                plugin_id=self.plugin_id,
                component_name=component_name,
            )
            return False

        if not component_name.startswith("plugin:"):
            component_name = f"plugin:{self.plugin_id}:{component_name}"

        # Ensure metrics reference the correct component
        if metrics:
            for metric_id, metric_def in metrics.items():
                if "component" not in metric_def:
                    metric_def["component"] = component_name

        # Register in global registry
        from .behavior_registry import behavior_registry

        success = behavior_registry.register_component_schema(
            component_name=component_name,
            plugin_id=self.plugin_id,
            schema=schema,
            description=description,
            metrics=metrics,
        )

        if success:
            self.logger.info(
                "Registered component schema",
                plugin_id=self.plugin_id,
                component_name=component_name,
                metrics_count=len(metrics) if metrics else 0,
            )

        return success


# ===== PLUGIN CONTEXT =====

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
