"""Entity Loader Registry for Generic Links

Provides a centralized registry for entity loader functions that load
template and runtime entities by kind and ID for use in link sync operations.

Each domain registers its entity loaders on service startup.

Usage:
    # Register a loader
    registry = get_entity_loader_registry()

    async def load_character_instance(entity_id, db):
        return await db.get(CharacterInstance, entity_id)

    registry.register_loader('character', load_character_instance)

    # Load an entity
    entity = await registry.load('character', 'abc-123', db)
"""
from typing import Any, Callable, Awaitable, Dict
from sqlalchemy.ext.asyncio import AsyncSession


# Type alias for loader functions
EntityLoaderFn = Callable[[Any, AsyncSession], Awaitable[Any]]


class EntityLoaderRegistry:
    """Registry of entity loader functions for different entity kinds

    Maps entity kinds (e.g., 'character', 'npc', 'item') to loader functions
    that fetch the entity from the database.
    """

    def __init__(self):
        self._loaders: Dict[str, EntityLoaderFn] = {}

    def register_loader(self, entity_kind: str, loader_fn: EntityLoaderFn) -> None:
        """Register an entity loader function

        Args:
            entity_kind: Entity kind identifier (e.g., 'character', 'npc')
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


def register_default_loaders():
    """Register default entity loaders for standard entity types

    This function should be called on service startup to register loaders
    for core entity types (character, npc, item, etc.).

    Domain-specific loaders can be registered in their respective modules.
    """
    from pixsim7.backend.main.domain.game.entities.character_integrations import CharacterInstance
    from pixsim7.backend.main.domain.game.core.models import GameNPC, GameLocation, GameScene
    from pixsim7.backend.main.domain.assets.models import Asset

    registry = get_entity_loader_registry()

    # Character instance loader
    async def load_character_instance(instance_id: str, db: AsyncSession):
        """Load CharacterInstance by UUID"""
        from uuid import UUID
        if isinstance(instance_id, str):
            instance_id = UUID(instance_id)
        return await db.get(CharacterInstance, instance_id)

    registry.register_loader('character', load_character_instance)

    # GameNPC loader
    async def load_npc(npc_id: int, db: AsyncSession):
        """Load GameNPC by ID"""
        return await db.get(GameNPC, npc_id)

    registry.register_loader('npc', load_npc)

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
    # - itemTemplate, item
    # - propTemplate, prop
    # - world, session
    # etc.
