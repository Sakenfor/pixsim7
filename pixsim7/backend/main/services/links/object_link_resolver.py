"""
ObjectLink Generic Resolver Service

Provides unified resolution of template↔runtime entity links using:
- EntityLoaderRegistry for entity loading
- MappingRegistry for field mapping configurations
- LinkService for link resolution
- StatEngine for stat normalization

This is the main entry point for generic link-based entity resolution.
"""
from typing import Any, Dict, Optional
from uuid import UUID
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.services.links.entity_loaders import get_entity_loader_registry
from pixsim7.backend.main.services.links.mapping_registry import get_mapping_registry
from pixsim7.backend.main.services.links.link_service import LinkService
from pixsim7.backend.main.domain.links import ObjectLink
from pixsim7.backend.main.services.prompt.context.mapping import (
    get_nested_value,
    set_nested_value,
)
from pixsim7.backend.main.domain.game.stats import StatEngine, create_stat_engine


@dataclass
class EntityRef:
    """Reference to a resolved entity"""
    kind: str
    entity_id: Any
    entity: Any  # The loaded entity object


class ObjectLinkResolver:
    """Generic resolver for ObjectLink-based entity resolution"""

    def __init__(
        self,
        db: AsyncSession,
        stat_engine: Optional[StatEngine] = None
    ):
        self.db = db
        self.loader_registry = get_entity_loader_registry()
        self.mapping_registry = get_mapping_registry()
        self.link_service = LinkService(db)
        self.stat_engine = stat_engine or create_stat_engine()

    async def load_entity(self, entity_kind: str, entity_id: Any) -> Any:
        """Load an entity using the loader registry

        Args:
            entity_kind: Entity type (e.g., 'characterInstance', 'npc', 'location')
            entity_id: Entity identifier (UUID, int, etc.)

        Returns:
            Loaded entity instance

        Raises:
            ValueError: If no loader registered for entity_kind
        """
        if not self.loader_registry.has_loader(entity_kind):
            available = self.loader_registry.list_loaders()
            raise ValueError(
                f"No loader registered for entity kind '{entity_kind}'. "
                f"Available loaders: {available}"
            )

        return await self.loader_registry.load(entity_kind, entity_id, self.db)

    async def resolve_template_to_runtime(
        self,
        template_kind: str,
        template_id: str,
        context: Optional[Dict] = None
    ) -> Optional[EntityRef]:
        """Resolve a template entity to its linked runtime entity

        Delegates to LinkService.get_active_link_for_template() for canonical
        sync_enabled + activation + priority filtering logic.

        Args:
            template_kind: Template entity type (e.g., 'characterInstance')
            template_id: Template entity ID
            context: Optional context for activation conditions

        Returns:
            EntityRef with runtime entity, or None if no link
        """
        # Delegate to LinkService for canonical filtering logic
        link = await self.link_service.get_active_link_for_template(
            template_kind,
            template_id,
            context
        )

        if not link:
            return None

        # Load the runtime entity
        runtime_entity = await self.load_entity(link.runtime_kind, link.runtime_id)

        return EntityRef(
            kind=link.runtime_kind,
            entity_id=link.runtime_id,
            entity=runtime_entity
        )

    async def resolve_prompt_context(
        self,
        template_kind: str,
        template_id: str,
        context: Optional[Dict] = None,
        runtime_kind: Optional[str] = None,
        runtime_id: Optional[Any] = None
    ) -> Dict[str, Any]:
        """Resolve prompt context from template and runtime entities

        Args:
            template_kind: Template entity type
            template_id: Template entity ID
            context: Optional context for link activation
            runtime_kind: Optional runtime entity type (if known)
            runtime_id: Optional runtime entity ID (if known)

        Returns:
            Resolved context dictionary with merged fields
        """
        # 1. Load template entity
        template_entity = await self.load_entity(template_kind, template_id)

        # 2. Resolve runtime entity via link if not provided
        runtime_entity = None
        if runtime_id and runtime_kind:
            runtime_entity = await self.load_entity(runtime_kind, runtime_id)
        else:
            runtime_ref = await self.resolve_template_to_runtime(
                template_kind, template_id, context
            )
            if runtime_ref:
                runtime_entity = runtime_ref.entity
                runtime_kind = runtime_ref.kind

        # 3. Get field mapping
        if runtime_kind:
            mapping_id = f"{template_kind}->{runtime_kind}"
            field_mappings = self.mapping_registry.get(mapping_id)

            if not field_mappings:
                raise ValueError(
                    f"No mapping registered for '{mapping_id}'. "
                    f"Available: {list(self.mapping_registry.list_mappings().keys())}"
                )

            # 4. Apply field mappings
            resolved_data = {}
            for field_key, mapping in field_mappings.items():
                value = self._resolve_field(
                    mapping,
                    template_entity,
                    runtime_entity
                )
                if value is not None:
                    set_nested_value(resolved_data, mapping.target_path, value)

            return resolved_data

        # No runtime entity, return template data only
        return {"template": template_entity}

    def _resolve_field(self, mapping, template_entity, runtime_entity):
        """Resolve a single field using authority/fallback logic"""
        # Determine which sources are available
        source_entities = {}
        if template_entity and hasattr(mapping, 'source_paths'):
            if 'template' in mapping.source_paths or 'instance' in mapping.source_paths:
                source_entities['template'] = template_entity
                source_entities['instance'] = template_entity  # Backward compat

        if runtime_entity and hasattr(mapping, 'source_paths'):
            if 'runtime' in mapping.source_paths or 'npc' in mapping.source_paths:
                source_entities['runtime'] = runtime_entity
                source_entities['npc'] = runtime_entity  # Backward compat

        # Try primary source
        primary_source = mapping.source
        if primary_source in source_entities:
            path = getattr(mapping, f"{primary_source}_path", None)
            if not path and hasattr(mapping, 'source_paths'):
                path = mapping.source_paths.get(primary_source)

            if path:
                value = get_nested_value(source_entities[primary_source], path)
                if value is not None:
                    return value

        # Try fallback
        if mapping.fallback and mapping.fallback != "none":
            if mapping.fallback in source_entities:
                path = getattr(mapping, f"{mapping.fallback}_path", None)
                if not path and hasattr(mapping, 'source_paths'):
                    path = mapping.source_paths.get(mapping.fallback)

                if path:
                    return get_nested_value(source_entities[mapping.fallback], path)

        return None
