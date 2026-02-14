"""
Plugin Catalog Service

Business logic for plugin management:
- Listing available plugins
- Enabling/disabling plugins per user
- Managing plugin settings
- Seeding built-in plugins
"""
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from pixsim7.backend.main.domain.plugin_catalog import (
    PluginCatalogEntry,
    UserPluginState,
)
from pixsim7.backend.main.shared.schemas.plugin_schemas import (
    PluginResponse,
    PluginMetadata,
    PluginSyncItem,
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
        "bundle_url": None,
        "manifest_url": None,
        "is_builtin": True,
        "is_required": False,
        "source": "source",
        "meta": {
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
            is_enabled = self._resolve_enabled_state(entry, user_state)

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

        is_enabled = self._resolve_enabled_state(entry, user_state)

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

        now = datetime.now(timezone.utc)

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
        if entry.is_required:
            raise ValueError(f"Plugin '{plugin_id}' is required and cannot be disabled")

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

        now = datetime.now(timezone.utc)

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
        bundle_url: Optional[str] = None,
        **kwargs,
    ) -> PluginCatalogEntry:
        """Create a new plugin catalog entry"""
        payload = self._normalize_plugin_data(kwargs)
        entry = PluginCatalogEntry(
            plugin_id=plugin_id,
            name=name,
            family=family,
            bundle_url=bundle_url,
            **payload,
        )
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def sync_frontend_plugins(self, plugins: list[PluginSyncItem]) -> tuple[int, int, list[str]]:
        """
        Sync frontend source plugins into the backend catalog.

        Creates only missing plugin entries and never overwrites existing ones.
        """
        created = 0
        skipped = 0
        created_plugin_ids: list[str] = []

        for plugin in plugins:
            query = select(PluginCatalogEntry).where(
                PluginCatalogEntry.plugin_id == plugin.plugin_id
            )
            result = await self.db.execute(query)
            existing = result.scalar_one_or_none()
            if existing:
                skipped += 1
                continue

            entry = PluginCatalogEntry(
                plugin_id=plugin.plugin_id,
                name=plugin.name,
                description=plugin.description,
                version=plugin.version,
                author=plugin.author,
                icon=plugin.icon,
                family=plugin.family,
                plugin_type=plugin.plugin_type,
                tags=plugin.tags or [],
                bundle_url=None,
                manifest_url=None,
                is_builtin=True,
                is_required=plugin.is_required,
                source="frontend-sync",
                meta=plugin.metadata or {},
            )
            self.db.add(entry)
            created += 1
            created_plugin_ids.append(plugin.plugin_id)

        if created > 0:
            await self.db.commit()

        return created, skipped, created_plugin_ids

    async def seed_builtin_plugins(self) -> int:
        """
        Seed built-in plugins if not already present

        Returns:
            Number of plugins inserted or corrected
        """
        seeded = 0

        for plugin_data in BUILTIN_PLUGINS:
            normalized = self._normalize_plugin_data(plugin_data)
            # Check if already exists
            query = select(PluginCatalogEntry).where(
                PluginCatalogEntry.plugin_id == normalized["plugin_id"]
            )
            result = await self.db.execute(query)
            existing = result.scalar_one_or_none()

            if not existing:
                entry = PluginCatalogEntry(**normalized)
                self.db.add(entry)
                seeded += 1
                continue

            # Keep canonical builtin definitions aligned without overwriting user state.
            if existing.is_builtin:
                changed = False
                for field in (
                    "name",
                    "description",
                    "version",
                    "author",
                    "icon",
                    "family",
                    "plugin_type",
                    "tags",
                    "bundle_url",
                    "manifest_url",
                    "is_required",
                    "source",
                    "meta",
                ):
                    next_value = normalized.get(field)
                    if getattr(existing, field) != next_value:
                        setattr(existing, field, next_value)
                        changed = True

                if changed:
                    existing.updated_at = datetime.now(timezone.utc)
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
            is_required=entry.is_required,
            source=entry.source,
            is_enabled=is_enabled,
            metadata=PluginMetadata(
                permissions=metadata.get("permissions", []),
                surfaces=metadata.get("surfaces", []),
                default=metadata.get("default", False),
                scene_view=metadata.get("scene_view"),
                control_center=metadata.get("control_center"),
            ),
        )

    @staticmethod
    def _normalize_plugin_data(data: dict) -> dict:
        """Normalize legacy payload keys to current model fields."""
        normalized = dict(data)
        if "metadata" in normalized and "meta" not in normalized:
            normalized["meta"] = normalized.pop("metadata")
        normalized.setdefault("source", "bundle")
        normalized.setdefault("is_required", False)
        return normalized

    @staticmethod
    def _resolve_enabled_state(
        entry: PluginCatalogEntry,
        user_state: Optional[UserPluginState],
    ) -> bool:
        """
        Compute effective enabled state.

        Required plugins are always enabled regardless of stored user state.
        """
        if entry.is_required:
            return True
        if user_state is not None:
            return user_state.is_enabled
        return entry.is_builtin
