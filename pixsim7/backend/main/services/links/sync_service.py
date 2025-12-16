"""Generic Sync Service for Template↔Runtime Links

Provides generic sync operations using the FieldMapping system and entity loaders.
This service is entity-agnostic and can be extended for domain-specific sync logic.

Usage:
    service = GenericSyncService(db)

    # Build a snapshot using generic resolver
    snapshot = await service.build_snapshot(link_id, prefer_live=True)

    # Sync a link (requires domain-specific implementation)
    result = await service.sync_link(link_id, direction='template_to_runtime')
"""
from typing import Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.services.links.link_service import LinkService
from pixsim7.backend.main.services.links.mapping_registry import get_mapping_registry
from pixsim7.backend.main.services.links.entity_loaders import get_entity_loader_registry
from pixsim7.backend.main.services.prompt_context.generic_resolver import resolve_entity_context


class GenericSyncService:
    """Generic service for syncing template↔runtime entities via links

    Provides infrastructure for building snapshots and syncing entities.
    Domain-specific sync logic can be added by extending this class or
    by using the entity loader registry to inject domain loaders.
    """

    def __init__(self, db: AsyncSession):
        """Initialize sync service

        Args:
            db: Database session
        """
        self.db = db
        self.link_service = LinkService(db)
        self.mapping_registry = get_mapping_registry()
        self.entity_loader_registry = get_entity_loader_registry()

    async def build_snapshot(
        self,
        link_id: UUID,
        prefer_live: bool = True
    ) -> Dict[str, Any]:
        """Build a snapshot using the generic_resolver

        Loads the linked entities, retrieves the mapping, and calls the
        generic resolver to produce a merged snapshot.

        Args:
            link_id: Link UUID
            prefer_live: If True, prefer runtime values over template values

        Returns:
            Snapshot dict with merged field values

        Raises:
            ValueError: If link not found or mapping not registered
        """
        # Get link
        link = await self.link_service.get_link(link_id)
        if not link:
            raise ValueError(f"Link {link_id} not found")

        # Get mapping
        mapping = self.mapping_registry.get(link.mapping_id)
        if not mapping:
            raise ValueError(
                f"Mapping {link.mapping_id} not registered. "
                f"Available mappings: {list(self.mapping_registry.list_mappings().keys())}"
            )

        # Load entities
        template_entity = await self._load_entity(link.template_kind, link.template_id)
        runtime_entity = await self._load_entity(link.runtime_kind, link.runtime_id)

        # Build snapshot via generic resolver
        sources = {
            "template": template_entity,
            "runtime": runtime_entity,
            "link_data": link
        }

        snapshot = resolve_entity_context(
            entity_type=link.runtime_kind,
            mapping=mapping,
            sources=sources,
            entity_id=str(link.runtime_id),
            entity_name=getattr(runtime_entity, 'name', None),
            template_id=link.template_id,
            prefer_live=prefer_live
        )

        return snapshot

    async def sync_link(
        self,
        link_id: UUID,
        direction: Optional[str] = None
    ) -> Dict[str, Any]:
        """Sync a link in the specified direction

        NOTE: This is a placeholder implementation. Domain-specific sync logic
        should be implemented by extending this class or by using domain-specific
        sync services (e.g., CharacterNPCSyncService).

        Args:
            link_id: Link UUID
            direction: Sync direction (overrides link.sync_direction if provided)

        Returns:
            Sync result dict with changes

        Raises:
            ValueError: If link not found or sync disabled
            NotImplementedError: Placeholder - requires domain implementation
        """
        # Get link
        link = await self.link_service.get_link(link_id)
        if not link:
            raise ValueError(f"Link {link_id} not found")

        if not link.sync_enabled:
            return {
                "synced": False,
                "reason": "sync_disabled"
            }

        # Determine direction
        sync_direction = direction or link.sync_direction

        # Get mapping
        mapping = self.mapping_registry.get(link.mapping_id)
        if not mapping:
            raise ValueError(f"Mapping {link.mapping_id} not found")

        # Load entities
        template_entity = await self._load_entity(link.template_kind, link.template_id)
        runtime_entity = await self._load_entity(link.runtime_kind, link.runtime_id)

        # TODO: Implement sync logic
        # This is a placeholder - domain-specific services should provide
        # actual sync implementations
        raise NotImplementedError(
            "Generic sync logic not implemented. "
            "Use domain-specific sync services (e.g., CharacterNPCSyncService) "
            "or extend this class with domain-specific sync logic."
        )

        # Placeholder for future implementation:
        # changes = {}
        #
        # if sync_direction in ['bidirectional', 'template_to_runtime']:
        #     changes['template_to_runtime'] = await self._sync_template_to_runtime(
        #         mapping, template_entity, runtime_entity
        #     )
        #
        # if sync_direction in ['bidirectional', 'runtime_to_template']:
        #     changes['runtime_to_template'] = await self._sync_runtime_to_template(
        #         mapping, template_entity, runtime_entity
        #     )
        #
        # # Update link metadata
        # link.last_synced_at = datetime.utcnow()
        # link.last_sync_direction = sync_direction
        # await self.db.flush()
        #
        # return {
        #     "synced": True,
        #     "direction": sync_direction,
        #     "changes": changes
        # }

    async def _load_entity(self, entity_kind: str, entity_id: Any) -> Any:
        """Load an entity by kind and ID using entity loader registry

        Args:
            entity_kind: Entity kind identifier (e.g., 'character', 'npc')
            entity_id: Entity ID

        Returns:
            Loaded entity instance

        Raises:
            ValueError: If no loader registered for entity kind
        """
        return await self.entity_loader_registry.load(
            entity_kind,
            entity_id,
            self.db
        )


# Domain-specific sync logic examples:
#
# class CharacterNPCLinkSyncService(GenericSyncService):
#     """Character-NPC specific sync implementation"""
#
#     async def sync_link(self, link_id: UUID, direction: Optional[str] = None):
#         # Use CharacterNPCSyncService for actual sync
#         ...
#
# class ItemLinkSyncService(GenericSyncService):
#     """Item template-instance specific sync implementation"""
#
#     async def sync_link(self, link_id: UUID, direction: Optional[str] = None):
#         # Implement item-specific sync logic
#         ...
