"""
Plugin Catalog Service

Business logic for plugin management:
- Listing available plugins
- Enabling/disabling plugins per user
- Managing plugin settings
- Seeding built-in plugins
"""
from typing import Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlmodel import col

from pixsim7.backend.main.domain.plugin_catalog import (
    PluginCatalogEntry,
    UserPluginState,
)
from pixsim7.backend.main.shared.schemas.plugin_schemas import (
    PluginResponse,
    PluginMetadata,
)


# ===== BUILT-IN PLUGINS =====
# These are seeded on startup if not present in the database

BUILTIN_PLUGINS = [
    {
        "plugin_id": "scene-view:comic-panels",
        "name": "Comic Panel View",
        "description": "Displays scene beats as sequential comic frames with optional captions",
        "version": "1.0.0",
        "author": "PixSim7 Team",
        "icon": "📚",
        "family": "scene",
        "plugin_type": "ui-overlay",
        "tags": ["scene", "comic", "panels", "overlay"],
        "bundle_url": "/plugins/scene/comic-panel-view/plugin.js",
        "manifest_url": "/plugins/scene/comic-panel-view/manifest.json",
        "is_builtin": True,
        "metadata": {
            "permissions": ["ui:overlay", "read:session", "read:world"],
            "surfaces": ["overlay", "hud", "panel"],
            "default": True,
        },
    },
    # Add more built-in plugins here as they're created
]


class PluginCatalogService:
    """Service for managing the plugin catalog"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== CATALOG OPERATIONS =====

    async def get_available_plugins(
        self,
        user_id: int,
        family: Optional[str] = None,
        include_disabled: bool = True,
    ) -> list[PluginResponse]:
        """
        Get all available plugins with user's enabled state

        Args:
            user_id: Current user ID
            family: Optional filter by plugin family
            include_disabled: Include plugins disabled by user

        Returns:
            List of plugins with enabled state
        """
        # Build query for catalog entries
        query = select(PluginCatalogEntry).where(
            PluginCatalogEntry.is_available == True
        )

        if family:
            query = query.where(PluginCatalogEntry.family == family)

        result = await self.db.execute(query)
        catalog_entries = result.scalars().all()

        # Get user's plugin states
        state_query = select(UserPluginState).where(
            UserPluginState.user_id == user_id
        )
        state_result = await self.db.execute(state_query)
        user_states = {s.plugin_id: s for s in state_result.scalars().all()}

        # Build response
        plugins = []
        for entry in catalog_entries:
            user_state = user_states.get(entry.plugin_id)

            # Determine enabled state:
            # - If user has explicit state, use it
            # - Otherwise, built-in plugins are enabled by default
            if user_state is not None:
                is_enabled = user_state.is_enabled
            else:
                is_enabled = entry.is_builtin  # Built-ins enabled by default

            if not include_disabled and not is_enabled:
                continue

            plugins.append(self._to_response(entry, is_enabled))

        return plugins

    async def get_plugin(
        self,
        plugin_id: str,
        user_id: int,
    ) -> Optional[PluginResponse]:
        """Get a single plugin by ID with user's enabled state"""
        # Get catalog entry
        query = select(PluginCatalogEntry).where(
            PluginCatalogEntry.plugin_id == plugin_id
        )
        result = await self.db.execute(query)
        entry = result.scalar_one_or_none()

        if not entry:
            return None

        # Get user state
        state_query = select(UserPluginState).where(
            and_(
                UserPluginState.user_id == user_id,
                UserPluginState.plugin_id == plugin_id,
            )
        )
        state_result = await self.db.execute(state_query)
        user_state = state_result.scalar_one_or_none()

        is_enabled = user_state.is_enabled if user_state else entry.is_builtin

        return self._to_response(entry, is_enabled)

    async def get_enabled_plugins(self, user_id: int) -> list[PluginResponse]:
        """Get only enabled plugins for a user"""
        return await self.get_available_plugins(
            user_id=user_id,
            include_disabled=False,
        )

    # ===== USER STATE OPERATIONS =====

    async def enable_plugin(
        self,
        plugin_id: str,
        user_id: int,
        workspace_id: Optional[int] = None,
    ) -> bool:
        """
        Enable a plugin for a user

        Returns:
            True if plugin was enabled, False if plugin not found
        """
        # Verify plugin exists
        query = select(PluginCatalogEntry).where(
            PluginCatalogEntry.plugin_id == plugin_id
        )
        result = await self.db.execute(query)
        entry = result.scalar_one_or_none()

        if not entry:
            return False

        # Upsert user state
        state_query = select(UserPluginState).where(
            and_(
                UserPluginState.user_id == user_id,
                UserPluginState.plugin_id == plugin_id,
                UserPluginState.workspace_id == workspace_id,
            )
        )
        state_result = await self.db.execute(state_query)
        user_state = state_result.scalar_one_or_none()

        now = datetime.utcnow()

        if user_state:
            user_state.is_enabled = True
            user_state.enabled_at = now
            user_state.updated_at = now
        else:
            user_state = UserPluginState(
                user_id=user_id,
                plugin_id=plugin_id,
                workspace_id=workspace_id,
                is_enabled=True,
                enabled_at=now,
            )
            self.db.add(user_state)

        await self.db.commit()
        return True

    async def disable_plugin(
        self,
        plugin_id: str,
        user_id: int,
        workspace_id: Optional[int] = None,
    ) -> bool:
        """
        Disable a plugin for a user

        Returns:
            True if plugin was disabled, False if plugin not found
        """
        # Verify plugin exists
        query = select(PluginCatalogEntry).where(
            PluginCatalogEntry.plugin_id == plugin_id
        )
        result = await self.db.execute(query)
        entry = result.scalar_one_or_none()

        if not entry:
            return False

        # Upsert user state
        state_query = select(UserPluginState).where(
            and_(
                UserPluginState.user_id == user_id,
                UserPluginState.plugin_id == plugin_id,
                UserPluginState.workspace_id == workspace_id,
            )
        )
        state_result = await self.db.execute(state_query)
        user_state = state_result.scalar_one_or_none()

        now = datetime.utcnow()

        if user_state:
            user_state.is_enabled = False
            user_state.disabled_at = now
            user_state.updated_at = now
        else:
            user_state = UserPluginState(
                user_id=user_id,
                plugin_id=plugin_id,
                workspace_id=workspace_id,
                is_enabled=False,
                disabled_at=now,
            )
            self.db.add(user_state)

        await self.db.commit()
        return True

    # ===== CATALOG MANAGEMENT =====

    async def create_plugin(
        self,
        plugin_id: str,
        name: str,
        family: str,
        bundle_url: str,
        **kwargs,
    ) -> PluginCatalogEntry:
        """Create a new plugin catalog entry"""
        entry = PluginCatalogEntry(
            plugin_id=plugin_id,
            name=name,
            family=family,
            bundle_url=bundle_url,
            **kwargs,
        )
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def seed_builtin_plugins(self) -> int:
        """
        Seed built-in plugins if not already present

        Returns:
            Number of plugins seeded
        """
        seeded = 0

        for plugin_data in BUILTIN_PLUGINS:
            # Check if already exists
            query = select(PluginCatalogEntry).where(
                PluginCatalogEntry.plugin_id == plugin_data["plugin_id"]
            )
            result = await self.db.execute(query)
            existing = result.scalar_one_or_none()

            if not existing:
                entry = PluginCatalogEntry(**plugin_data)
                self.db.add(entry)
                seeded += 1

        if seeded > 0:
            await self.db.commit()

        return seeded

    # ===== HELPERS =====

    def _to_response(
        self,
        entry: PluginCatalogEntry,
        is_enabled: bool,
    ) -> PluginResponse:
        """Convert catalog entry to response model"""
        metadata = entry.meta or {}

        return PluginResponse(
            plugin_id=entry.plugin_id,
            name=entry.name,
            description=entry.description,
            version=entry.version,
            author=entry.author,
            icon=entry.icon,
            family=entry.family,
            plugin_type=entry.plugin_type,
            tags=entry.tags or [],
            bundle_url=entry.bundle_url,
            manifest_url=entry.manifest_url,
            is_builtin=entry.is_builtin,
            is_enabled=is_enabled,
            metadata=PluginMetadata(
                permissions=metadata.get("permissions", []),
                surfaces=metadata.get("surfaces", []),
                default=metadata.get("default", False),
            ),
        )
