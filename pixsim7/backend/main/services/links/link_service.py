"""Generic Link Service

Provides CRUD operations for ObjectLinks - generic template↔runtime links.
Uses the mapping registry to validate that mappings exist for link types.

Usage:
    service = LinkService(db)

    # Create a link
    link = await service.create_link(
        template_kind='character',
        template_id='abc-123',
        runtime_kind='npc',
        runtime_id=456,
        mapping_id='character->npc'
    )

    # Get links for a template
    links = await service.get_links_for_template('character', 'abc-123')

    # Get active link for runtime entity
    link = await service.get_active_link_for_runtime('npc', 456, context)
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pixsim7.backend.main.domain.links import ObjectLink
from pixsim7.backend.main.services.links.mapping_registry import get_mapping_registry
from pixsim7.backend.main.services.links.activation import (
    filter_active_links,
    get_highest_priority_active_link
)


class LinkService:
    """Generic service for managing template↔runtime links

    Provides CRUD operations for ObjectLinks without domain-specific logic.
    Domain services (CharacterNPCSyncService, ItemSyncService, etc.) can
    consume this service for link management.
    """

    def __init__(self, db: AsyncSession):
        """Initialize link service

        Args:
            db: Database session for link operations
        """
        self.db = db
        self.registry = get_mapping_registry()

    async def create_link(
        self,
        template_kind: str,
        template_id: str,
        runtime_kind: str,
        runtime_id: int,
        mapping_id: Optional[str] = None,
        sync_enabled: bool = True,
        sync_direction: str = 'bidirectional',
        priority: int = 0,
        activation_conditions: Optional[Dict[str, Any]] = None,
        meta: Optional[Dict[str, Any]] = None
    ) -> ObjectLink:
        """Create a new template↔runtime link

        Args:
            template_kind: Template entity kind (e.g., 'character')
            template_id: Template entity ID (usually UUID)
            runtime_kind: Runtime entity kind (e.g., 'npc')
            runtime_id: Runtime entity ID (usually integer)
            mapping_id: Mapping ID (auto-generated if not provided)
            sync_enabled: Enable/disable sync
            sync_direction: 'bidirectional', 'template_to_runtime', 'runtime_to_template'
            priority: Priority for conflict resolution (higher wins)
            activation_conditions: Context-based activation (e.g., location, time)
            meta: Extensible metadata

        Returns:
            Created ObjectLink instance

        Raises:
            ValueError: If mapping_id is invalid or no mapping registered
        """
        # Auto-generate mapping_id if not provided
        # Format: "templateKind->runtimeKind" (e.g., "character->npc")
        if not mapping_id:
            mapping_id = f"{template_kind}->{runtime_kind}"

        # Validate mapping exists
        if not self.registry.has_mapping(mapping_id):
            raise ValueError(
                f"No mapping registered for '{mapping_id}'. "
                f"Available mappings: {list(self.registry.list_mappings().keys())}"
            )

        # Create link instance
        link = ObjectLink(
            template_kind=template_kind,
            template_id=template_id,
            runtime_kind=runtime_kind,
            runtime_id=runtime_id,
            sync_enabled=sync_enabled,
            sync_direction=sync_direction,
            mapping_id=mapping_id,
            priority=priority,
            activation_conditions=activation_conditions,
            meta=meta
        )

        self.db.add(link)
        await self.db.flush()
        await self.db.refresh(link)

        return link

    async def get_link(self, link_id: UUID) -> Optional[ObjectLink]:
        """Get link by ID

        Args:
            link_id: Link UUID

        Returns:
            ObjectLink if found, None otherwise
        """
        return await self.db.get(ObjectLink, link_id)

    async def get_links_for_template(
        self,
        template_kind: str,
        template_id: str
    ) -> List[ObjectLink]:
        """Get all links for a template entity

        Args:
            template_kind: Template entity kind
            template_id: Template entity ID

        Returns:
            List of ObjectLinks for this template
        """
        result = await self.db.execute(
            select(ObjectLink)
            .where(
                and_(
                    ObjectLink.template_kind == template_kind,
                    ObjectLink.template_id == template_id
                )
            )
        )
        return list(result.scalars().all())

    async def get_links_for_runtime(
        self,
        runtime_kind: str,
        runtime_id: int,
        active_only: bool = False,
        context: Optional[Dict[str, Any]] = None
    ) -> List[ObjectLink]:
        """Get all links for a runtime entity

        Args:
            runtime_kind: Runtime entity kind
            runtime_id: Runtime entity ID
            active_only: If True, filter by activation conditions
            context: Runtime context for activation evaluation

        Returns:
            List of ObjectLinks for this runtime entity (sorted by priority desc)
        """
        # Query all links for runtime entity
        result = await self.db.execute(
            select(ObjectLink)
            .where(
                and_(
                    ObjectLink.runtime_kind == runtime_kind,
                    ObjectLink.runtime_id == runtime_id
                )
            )
            .order_by(ObjectLink.priority.desc())
        )
        links = list(result.scalars().all())

        # Filter by activation if requested
        if active_only and context is not None:
            links = filter_active_links(links, context)

        return links

    async def get_active_link_for_runtime(
        self,
        runtime_kind: str,
        runtime_id: int,
        context: Optional[Dict[str, Any]] = None
    ) -> Optional[ObjectLink]:
        """Get highest-priority active link for a runtime entity

        Filters links by activation conditions (if context provided),
        then returns the one with the highest priority.

        Args:
            runtime_kind: Runtime entity kind
            runtime_id: Runtime entity ID
            context: Runtime context for activation evaluation

        Returns:
            Highest-priority active link, or None if no active links
        """
        # Get all links for runtime entity
        links = await self.get_links_for_runtime(runtime_kind, runtime_id)

        if not links:
            return None

        # If no context provided, return highest priority link
        if context is None:
            # Filter out links with activation conditions (inactive without context)
            links = [link for link in links if not link.activation_conditions]
            return links[0] if links else None

        # Get highest priority active link
        return get_highest_priority_active_link(links, context)

    async def update_link(
        self,
        link_id: UUID,
        **kwargs
    ) -> Optional[ObjectLink]:
        """Update link properties

        Args:
            link_id: Link UUID
            **kwargs: Fields to update (sync_enabled, priority, etc.)

        Returns:
            Updated ObjectLink if found, None otherwise
        """
        link = await self.get_link(link_id)
        if not link:
            return None

        # Update allowed fields
        allowed_fields = {
            'sync_enabled', 'sync_direction', 'priority',
            'activation_conditions', 'meta'
        }

        for key, value in kwargs.items():
            if key in allowed_fields:
                setattr(link, key, value)

        await self.db.flush()
        await self.db.refresh(link)

        return link

    async def delete_link(self, link_id: UUID) -> bool:
        """Delete a link

        Args:
            link_id: Link UUID

        Returns:
            True if link was deleted, False if not found
        """
        link = await self.get_link(link_id)
        if not link:
            return False

        await self.db.delete(link)
        await self.db.flush()

        return True
