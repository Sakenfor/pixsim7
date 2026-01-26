"""Entity Loader Registry for Generic Links

Provides a centralized registry for entity loader functions that load
template and runtime entities by kind and ID for use in link sync operations.

Each domain registers its entity loaders on service startup.

Usage:
    # Register a loader
    registry = get_entity_loader_registry()

    async def load_character_instance(entity_id, db):
        return await db.get(CharacterInstance, entity_id)

    registry.register_loader('characterInstance', load_character_instance)

    # Load an entity
    entity = await registry.load('characterInstance', 'abc-123', db)
"""
from typing import Any, Callable, Awaitable, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession


# Type alias for loader functions
EntityLoaderFn = Callable[[Any, AsyncSession], Awaitable[Any]]


class EntityLoaderRegistry:
    """Registry of entity loader functions for different entity kinds

    Maps entity kinds (e.g., 'characterInstance', 'npc', 'item') to loader functions
    that fetch the entity from the database.
    """

    def __init__(self):
        self._loaders: Dict[str, EntityLoaderFn] = {}

    def register_loader(self, entity_kind: str, loader_fn: EntityLoaderFn) -> None:
        """Register an entity loader function

        Args:
            entity_kind: Entity kind identifier (e.g., 'characterInstance', 'npc')
            loader_fn: Async function that loads entity by ID and db session

        Example:
            async def load_npc(npc_id, db):
                return await db.get(GameNPC, npc_id)

            registry.register_loader('npc', load_npc)
        """
        if not entity_kind:
            raise ValueError("entity_kind cannot be empty")

        if not callable(loader_fn):
            raise ValueError("loader_fn must be callable")

        self._loaders[entity_kind] = loader_fn

    async def load(
        self,
        entity_kind: str,
        entity_id: Any,
        db: AsyncSession
    ) -> Any:
        """Load an entity by kind and ID

        Args:
            entity_kind: Entity kind identifier
            entity_id: Entity ID (UUID, int, etc.)
            db: Database session

        Returns:
            Loaded entity instance

        Raises:
            ValueError: If no loader is registered for the entity kind
        """
        loader = self._loaders.get(entity_kind)
        if not loader:
            raise ValueError(
                f"No loader registered for entity kind '{entity_kind}'. "
                f"Available loaders: {list(self._loaders.keys())}"
            )

        return await loader(entity_id, db)

    def has_loader(self, entity_kind: str) -> bool:
        """Check if a loader is registered for an entity kind

        Args:
            entity_kind: Entity kind identifier

        Returns:
            True if loader exists, False otherwise
        """
        return entity_kind in self._loaders

    def unregister_loader(self, entity_kind: str) -> bool:
        """Unregister an entity loader

        Args:
            entity_kind: Entity kind identifier to remove

        Returns:
            True if loader was removed, False if it didn't exist
        """
        if entity_kind in self._loaders:
            del self._loaders[entity_kind]
            return True
        return False

    def list_loaders(self) -> list[str]:
        """List all registered entity kinds

        Returns:
            List of entity kind identifiers with registered loaders
        """
        return list(self._loaders.keys())


# Global singleton instance
_entity_loader_registry = EntityLoaderRegistry()


def get_entity_loader_registry() -> EntityLoaderRegistry:
    """Get the global entity loader registry instance

    Returns:
        The singleton EntityLoaderRegistry instance
    """
    return _entity_loader_registry


def _register_model_loader(
    registry: EntityLoaderRegistry,
    entity_kind: str,
    model: type,
    id_parser: Callable[[Any], Any],
) -> None:
    async def load_entity(entity_id: Any, db: AsyncSession):
        return await db.get(model, id_parser(entity_id))

    registry.register_loader(entity_kind, load_entity)


def register_link_type_loaders(
    registry: Optional[EntityLoaderRegistry] = None,
) -> None:
    """Register entity loaders based on link type specs."""
    from pixsim7.backend.main.services.links.link_types import get_link_type_registry

    registry = registry or get_entity_loader_registry()

    for spec in get_link_type_registry().list_specs():
        if not registry.has_loader(spec.template_kind):
            _register_model_loader(
                registry,
                spec.template_kind,
                spec.template_model,
                spec.template_id_parser,
            )
        if not registry.has_loader(spec.runtime_kind):
            _register_model_loader(
                registry,
                spec.runtime_kind,
                spec.runtime_model,
                spec.runtime_id_parser,
            )


def register_default_loaders():
    """Register default entity loaders for standard entity types

    This function should be called on service startup to register loaders
    for core entity types (characterInstance, npc, item, etc.).

    Domain-specific loaders can be registered in their respective modules.
    """
    from pixsim7.backend.main.domain.game.core.models import GameLocation, GameScene
    from pixsim7.backend.main.domain.assets.models import Asset

    registry = get_entity_loader_registry()

    # Link type loaders (template/runtime pairs)
    from pixsim7.backend.main.services.links.link_types import register_default_link_types
    register_default_link_types()
    register_link_type_loaders(registry)

    # GameLocation loader
    async def load_location(location_id: int, db: AsyncSession):
        """Load GameLocation by ID"""
        return await db.get(GameLocation, location_id)

    registry.register_loader('location', load_location)

    # Asset loader
    async def load_asset(asset_id: int, db: AsyncSession):
        """Load Asset by ID"""
        return await db.get(Asset, asset_id)

    registry.register_loader('asset', load_asset)

    # GameScene loader
    async def load_scene(scene_id: int, db: AsyncSession):
        """Load GameScene by ID"""
        return await db.get(GameScene, scene_id)

    registry.register_loader('scene', load_scene)

    # User loader
    async def load_user(user_id: int, db: AsyncSession):
        """Load User by ID"""
        from pixsim7.backend.main.domain import User
        return await db.get(User, user_id)

    registry.register_loader('user', load_user)

    # Generation loader
    async def load_generation(generation_id: int, db: AsyncSession):
        """Load Generation by ID"""
        from pixsim7.backend.main.domain import Generation
        return await db.get(Generation, generation_id)

    registry.register_loader('generation', load_generation)

    # Workspace loader
    async def load_workspace(workspace_id: int, db: AsyncSession):
        """Load Workspace by ID"""
        from pixsim7.backend.main.domain import Workspace
        return await db.get(Workspace, workspace_id)

    registry.register_loader('workspace', load_workspace)

    # ProviderAccount loader
    async def load_account(account_id: int, db: AsyncSession):
        """Load ProviderAccount by ID"""
        from pixsim7.backend.main.domain.providers import ProviderAccount
        return await db.get(ProviderAccount, account_id)

    registry.register_loader('account', load_account)

    # TODO: Add loaders for other entity types as they are implemented
    # - propTemplate, prop
    # - world, session
    # etc.
