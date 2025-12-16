"""
World Read Capability API

Provides read-only access to world metadata, locations, and NPCs.
"""

from typing import Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from ..permissions import PluginPermission, PermissionDeniedBehavior
from ..context_base import BaseCapabilityAPI


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

        from pixsim7.backend.main.domain.game.world import GameWorld

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

    async def get_npc(self, npc_id: int) -> Optional[dict]:
        """
        Get NPC by ID.

        Returns:
            NPC data (id, name, personality, meta, home_location_id) or None if not found
        """
        if not self._check_permission(
            PluginPermission.WORLD_READ.value,
            "WorldReadAPI.get_npc",
            PermissionDeniedBehavior.WARN,
        ):
            return None

        if not self.db:
            self.logger.error("WorldReadAPI requires database access")
            return None

        from pixsim7.backend.main.domain.game.core.models import GameNPC

        result = await self.db.execute(
            "SELECT id, name, personality, meta, home_location_id FROM game_npcs WHERE id = :npc_id",
            {"npc_id": npc_id}
        )
        row = result.fetchone()

        if not row:
            return None

        self.logger.debug(
            "get_npc",
            plugin_id=self.plugin_id,
            npc_id=npc_id,
        )

        return {
            "id": row[0],
            "name": row[1],
            "personality": row[2],
            "meta": row[3],
            "home_location_id": row[4],
        }
