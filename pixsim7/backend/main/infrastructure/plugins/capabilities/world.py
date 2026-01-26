"""
World Read Capability API

Provides read-only access to world metadata, locations, NPCs, and items.
"""

from typing import Optional, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from ..permissions import PluginPermission, PermissionDeniedBehavior
from ..context_base import BaseCapabilityAPI
from pixsim7.backend.main.domain.game.core.models import GameWorld, GameLocation, GameNPC, GameItem


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

        stmt = select(GameWorld).where(GameWorld.id == world_id)
        result = await self.db.execute(stmt)
        world = result.scalar_one_or_none()

        if not world:
            return None

        self.logger.debug(
            "get_world",
            plugin_id=self.plugin_id,
            world_id=world_id,
        )

        meta = world.meta or {}
        return {
            "id": world.id,
            "name": world.name,
            "description": meta.get("description"),
            "meta": meta,
            "flags": meta.get("flags", {}),
        }

    # Valid config key pattern: alphanumeric, underscores, dots for nesting
    _CONFIG_KEY_PATTERN = __import__('re').compile(r'^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$')

    async def get_world_config(self, world_id: int, key: str) -> Optional[Any]:
        """
        Get a specific config value from world.meta.

        Args:
            world_id: World ID
            key: Dot-separated key path (e.g., "behavior.enabledPlugins")

        Returns:
            Config value or None if not found
        """
        # Validate key format
        if not key or not self._CONFIG_KEY_PATTERN.match(key):
            self.logger.warning(
                "Invalid config key format",
                plugin_id=self.plugin_id,
                key=key,
            )
            return None

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

    # Maximum query result limit to prevent memory issues
    MAX_QUERY_LIMIT = 500

    async def list_world_locations(
        self,
        world_id: int,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """
        List locations in a world with pagination.

        Args:
            world_id: World ID to query
            limit: Max results to return (default 100, max 500)
            offset: Number of results to skip (for pagination)

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

        # Enforce limits
        limit = min(max(1, limit), self.MAX_QUERY_LIMIT)
        offset = max(0, offset)

        # Note: GameLocation has no direct world_id column; filter via meta if present
        stmt = select(GameLocation).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        rows = result.scalars().all()

        # Filter by world_id from meta and build response
        locations = []
        for loc in rows:
            loc_meta = loc.meta or {}
            if loc_meta.get("world_id") == world_id:
                locations.append({
                    "id": loc.id,
                    "name": loc.name,
                    "location_type": loc_meta.get("location_type"),
                    "meta": loc_meta,
                })

        self.logger.debug(
            "list_world_locations",
            plugin_id=self.plugin_id,
            world_id=world_id,
            count=len(locations),
            limit=limit,
            offset=offset,
        )

        return locations

    async def get_location(self, location_id: int) -> Optional[dict]:
        """
        Get location by ID.

        Returns:
            Location data (id, name, asset_id, default_spawn, meta) or None if not found
        """
        if not self._check_permission(
            PluginPermission.WORLD_READ.value,
            "WorldReadAPI.get_location",
            PermissionDeniedBehavior.WARN,
        ):
            return None

        if not self.db:
            self.logger.error("WorldReadAPI requires database access")
            return None

        stmt = select(GameLocation).where(GameLocation.id == location_id)
        result = await self.db.execute(stmt)
        location = result.scalar_one_or_none()

        if not location:
            return None

        self.logger.debug(
            "get_location",
            plugin_id=self.plugin_id,
            location_id=location_id,
        )

        meta = location.meta or {}
        return {
            "id": location.id,
            "name": location.name,
            "x": location.x,
            "y": location.y,
            "asset_id": location.asset_id,
            "default_spawn": location.default_spawn,
            "location_type": meta.get("location_type"),
            "meta": meta,
            "stats": location.stats or {},
        }

    async def list_world_npcs(
        self,
        world_id: int,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """
        List NPCs in a world with pagination.

        Args:
            world_id: World ID to query
            limit: Max results to return (default 100, max 500)
            offset: Number of results to skip (for pagination)

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

        # Enforce limits
        limit = min(max(1, limit), self.MAX_QUERY_LIMIT)
        offset = max(0, offset)

        # Note: GameNPC has no direct world_id column; filter via personality meta if present
        stmt = select(GameNPC).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        rows = result.scalars().all()

        # Filter by world_id from personality and build response
        npcs = []
        for npc in rows:
            npc_meta = npc.personality or {}
            if npc_meta.get("world_id") == world_id:
                npcs.append({
                    "id": npc.id,
                    "name": npc.name,
                    "role": npc_meta.get("role"),
                    "meta": npc_meta,
                })

        self.logger.debug(
            "list_world_npcs",
            plugin_id=self.plugin_id,
            world_id=world_id,
            count=len(npcs),
            limit=limit,
            offset=offset,
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

        stmt = select(GameNPC).where(GameNPC.id == npc_id)
        result = await self.db.execute(stmt)
        npc = result.scalar_one_or_none()

        if not npc:
            return None

        self.logger.debug(
            "get_npc",
            plugin_id=self.plugin_id,
            npc_id=npc_id,
        )

        # Note: GameNPC has no separate meta column; personality serves as metadata
        personality = npc.personality or {}
        return {
            "id": npc.id,
            "name": npc.name,
            "personality": personality,
            "meta": personality.get("meta", {}),
            "home_location_id": npc.home_location_id,
        }

    async def list_world_items(
        self,
        world_id: int,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """
        List items in a world with pagination.

        Args:
            world_id: World ID to query
            limit: Max results to return (default 100, max 500)
            offset: Number of results to skip (for pagination)

        Returns:
            List of item dicts (id, name, description, meta)
        """
        if not self._check_permission(
            PluginPermission.WORLD_READ.value,
            "WorldReadAPI.list_world_items",
            PermissionDeniedBehavior.WARN,
        ):
            return []

        if not self.db:
            return []

        # Enforce limits
        limit = min(max(1, limit), self.MAX_QUERY_LIMIT)
        offset = max(0, offset)

        stmt = select(GameItem).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        rows = result.scalars().all()

        items = []
        for item in rows:
            meta = item.meta or {}
            if meta.get("world_id") == world_id:
                items.append({
                    "id": item.id,
                    "name": item.name,
                    "description": item.description,
                    "meta": meta,
                })

        self.logger.debug(
            "list_world_items",
            plugin_id=self.plugin_id,
            world_id=world_id,
            count=len(items),
            limit=limit,
            offset=offset,
        )

        return items

    async def get_item(self, item_id: int) -> Optional[dict]:
        """
        Get item by ID.

        Returns:
            Item data (id, name, description, meta) or None if not found
        """
        if not self._check_permission(
            PluginPermission.WORLD_READ.value,
            "WorldReadAPI.get_item",
            PermissionDeniedBehavior.WARN,
        ):
            return None

        if not self.db:
            self.logger.error("WorldReadAPI requires database access")
            return None

        stmt = select(GameItem).where(GameItem.id == item_id)
        result = await self.db.execute(stmt)
        item = result.scalar_one_or_none()

        if not item:
            return None

        self.logger.debug(
            "get_item",
            plugin_id=self.plugin_id,
            item_id=item_id,
        )

        meta = item.meta or {}
        return {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "meta": meta,
        }
