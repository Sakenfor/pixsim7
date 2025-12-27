"""
Component Capability API

Provides access to NPC ECS (Entity-Component-System) components.
"""

from typing import Optional, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from ..permissions import PluginPermission, PermissionDeniedBehavior
from ..context_base import BaseCapabilityAPI
from pixsim7.backend.main.domain.game.core.models import GameSession


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
        stmt = select(GameSession).where(GameSession.id == session_id)
        result = await self.db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            self.logger.warning(
                "Session not found",
                plugin_id=self.plugin_id,
                session_id=session_id,
            )
            return default

        flags = session.flags or {}

        # Namespace component name for non-core components
        # Core components: "core", "romance", "stealth", "mood", "behavior", "interactions"
        core_components = {"core", "romance", "stealth", "mood", "behavior", "interactions", "quests"}
        if component_name not in core_components and not component_name.startswith("plugin:"):
            component_name = f"plugin:{self.plugin_id}:{component_name}"

        # Use ECS helper to get component
        from pixsim7.backend.main.domain.game.core.ecs import get_npc_component

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
        stmt = select(GameSession).where(GameSession.id == session_id)
        result = await self.db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            self.logger.warning(
                "Session not found",
                plugin_id=self.plugin_id,
                session_id=session_id,
            )
            return False

        flags = session.flags or {}

        # Namespace component name for non-core components
        core_components = {"core", "romance", "stealth", "mood", "behavior", "interactions", "quests"}
        if component_name not in core_components and not component_name.startswith("plugin:"):
            component_name = f"plugin:{self.plugin_id}:{component_name}"

        # Use ECS helper to set component
        from pixsim7.backend.main.domain.game.core.ecs import set_npc_component

        # Create a simple object to mimic session
        class SessionStub:
            def __init__(self, flags_data):
                self.flags = flags_data

        session_stub = SessionStub(flags)
        set_npc_component(session_stub, npc_id, component_name, value, validate=validate)

        # Update session in database
        session.flags = session_stub.flags
        self.db.add(session)
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
        stmt = select(GameSession).where(GameSession.id == session_id)
        result = await self.db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            return False

        flags = session.flags or {}

        # Namespace component name
        core_components = {"core", "romance", "stealth", "mood", "behavior", "interactions", "quests"}
        if component_name not in core_components and not component_name.startswith("plugin:"):
            component_name = f"plugin:{self.plugin_id}:{component_name}"

        # Use ECS helper to update component
        from pixsim7.backend.main.domain.game.core.ecs import update_npc_component

        class SessionStub:
            def __init__(self, flags_data):
                self.flags = flags_data

        session_stub = SessionStub(flags)
        update_npc_component(session_stub, npc_id, component_name, updates, validate=validate)

        # Update session in database
        session.flags = session_stub.flags
        self.db.add(session)
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
        stmt = select(GameSession).where(GameSession.id == session_id)
        result = await self.db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            return False

        flags = session.flags or {}

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
        from pixsim7.backend.main.domain.game.core.ecs import delete_npc_component

        class SessionStub:
            def __init__(self, flags_data):
                self.flags = flags_data

        session_stub = SessionStub(flags)
        delete_npc_component(session_stub, npc_id, component_name)

        # Update session in database
        session.flags = session_stub.flags
        self.db.add(session)
        await self.db.commit()

        self.logger.info(
            "delete_component",
            plugin_id=self.plugin_id,
            session_id=session_id,
            npc_id=npc_id,
            component_name=component_name,
        )

        return True
