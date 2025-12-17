"""Entity Reference Resolver.

Service to resolve EntityRef instances to actual domain entities using
the entity loader registry.

Usage:
    from pixsim7.backend.main.services.refs import EntityRefResolver
    from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef

    resolver = EntityRefResolver(db)

    # Single resolution
    ref = EntityRef(type="asset", id=123)
    asset = await resolver.resolve(ref)

    # Batch resolution
    refs = [EntityRef(type="asset", id=1), EntityRef(type="asset", id=2)]
    results = await resolver.resolve_many(refs)
    # -> {"asset:1": Asset(...), "asset:2": Asset(...)}

    # Safe resolution (returns None on error)
    asset = await resolver.resolve_safe(ref)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.services.links.entity_loaders import get_entity_loader_registry

if TYPE_CHECKING:
    from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef


class EntityRefResolver:
    """Service to resolve EntityRef instances to actual entities.

    Uses the EntityLoaderRegistry to load entities by type and ID.
    """

    def __init__(self, db: AsyncSession):
        """Initialize resolver with database session.

        Args:
            db: Async database session for entity loading
        """
        self.db = db
        self._loader_registry = get_entity_loader_registry()

    async def resolve(self, ref: Optional["EntityRef"]) -> Optional[Any]:
        """Resolve single EntityRef to entity.

        Args:
            ref: EntityRef to resolve, or None

        Returns:
            Loaded entity instance or None if ref is None

        Raises:
            ValueError: If no loader is registered for the entity type
            Exception: Any database errors from the loader
        """
        if ref is None:
            return None

        if not self._loader_registry.has_loader(ref.type):
            raise ValueError(
                f"No loader registered for entity type '{ref.type}'. "
                f"Available loaders: {self._loader_registry.list_loaders()}"
            )

        return await self._loader_registry.load(ref.type, ref.id, self.db)

    async def resolve_safe(
        self, ref: Optional["EntityRef"], default: Any = None
    ) -> Optional[Any]:
        """Resolve EntityRef, returning default on any error.

        Args:
            ref: EntityRef to resolve, or None
            default: Value to return on error (default: None)

        Returns:
            Loaded entity instance, None if ref is None, or default on error
        """
        if ref is None:
            return None

        try:
            return await self.resolve(ref)
        except Exception:
            return default

    async def resolve_many(
        self,
        refs: List["EntityRef"],
        skip_missing: bool = False,
    ) -> Dict[str, Any]:
        """Resolve multiple EntityRefs to entities.

        Args:
            refs: List of EntityRefs to resolve
            skip_missing: If True, skip refs that fail to resolve.
                         If False, raise on first error.

        Returns:
            Dict keyed by "type:id" string with entity values
        """
        results: Dict[str, Any] = {}

        for ref in refs:
            try:
                entity = await self.resolve(ref)
                results[ref.to_string()] = entity
            except Exception:
                if not skip_missing:
                    raise

        return results

    async def resolve_many_by_type(
        self,
        refs: List["EntityRef"],
    ) -> Dict[str, Dict[int, Any]]:
        """Resolve multiple EntityRefs grouped by type.

        Args:
            refs: List of EntityRefs to resolve

        Returns:
            Nested dict: {type: {id: entity}}

        Example:
            refs = [
                EntityRef(type="asset", id=1),
                EntityRef(type="asset", id=2),
                EntityRef(type="scene", id=5),
            ]
            result = await resolver.resolve_many_by_type(refs)
            # -> {
            #     "asset": {1: Asset(...), 2: Asset(...)},
            #     "scene": {5: GameScene(...)}
            # }
        """
        results: Dict[str, Dict[int, Any]] = {}

        for ref in refs:
            entity = await self.resolve(ref)
            if ref.type not in results:
                results[ref.type] = {}
            results[ref.type][ref.id] = entity

        return results

    async def resolve_field(
        self,
        obj: Any,
        field_name: str,
    ) -> Optional[Any]:
        """Resolve EntityRef field on an object.

        Args:
            obj: Object with EntityRef field
            field_name: Name of the field containing EntityRef

        Returns:
            Resolved entity or None if field is None/not an EntityRef
        """
        from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef

        ref = getattr(obj, field_name, None)
        if isinstance(ref, EntityRef):
            return await self.resolve(ref)
        return None

    def has_loader(self, entity_type: str) -> bool:
        """Check if a loader exists for an entity type.

        Args:
            entity_type: Entity type to check

        Returns:
            True if loader exists, False otherwise
        """
        return self._loader_registry.has_loader(entity_type)

    def list_loaders(self) -> List[str]:
        """List all available entity loaders.

        Returns:
            List of entity type strings with registered loaders
        """
        return self._loader_registry.list_loaders()
