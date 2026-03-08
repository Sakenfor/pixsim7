"""
Base classes and protocols for git-like versioning.

This module defines the abstract interfaces that versioned entities must implement,
and provides a base service class with common operations.

Usage:
    1. Define your Family and Entity models implementing the protocols
    2. Create a concrete service extending VersioningServiceBase
    3. Set class-level config attributes and implement get_timeline_metadata()
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import (
    Any,
    Dict,
    Generic,
    List,
    Optional,
    Protocol,
    TypeVar,
    runtime_checkable,
)
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


# =============================================================================
# PROTOCOLS - Define what versioned entities must look like
# =============================================================================

@runtime_checkable
class VersionFamilyProtocol(Protocol):
    """
    Protocol for version family entities (groups versions together).

    Implementations: AssetVersionFamily, PromptFamily
    """
    id: UUID
    user_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    # Optional fields that implementations may have
    name: Optional[str]
    description: Optional[str]
    tags: List[str]


@runtime_checkable
class VersionedEntityProtocol(Protocol):
    """
    Protocol for versioned entities (individual versions).

    Implementations: Asset (with version fields), PromptVersion
    """
    id: Any  # int for Asset, UUID for PromptVersion

    # Version metadata
    version_family_id: Optional[Any]  # Links to family
    version_number: Optional[int]
    parent_version_id: Optional[Any]  # For PromptVersion
    # OR parent_asset_id for Asset - handled via parent_id_attr config

    # Timestamps
    created_at: datetime


# Type variables for generic service
TFamily = TypeVar("TFamily", bound=VersionFamilyProtocol)
TEntity = TypeVar("TEntity")  # Can't bound to protocol due to property differences


# =============================================================================
# DATA CLASSES - Shared data structures
# =============================================================================

@dataclass
class VersionContext:
    """
    Context for creating a new versioned entity.

    Returned by resolve_version_intent() to tell creation logic
    what version metadata to apply to the new entity.
    """
    family_id: Optional[UUID]
    version_number: Optional[int]
    parent_id: Optional[Any]  # int or UUID depending on entity type
    version_message: Optional[str]

    @property
    def is_versioned(self) -> bool:
        """Whether this context represents a versioned entity."""
        return self.family_id is not None


@dataclass
class TimelineEntry:
    """
    A single entry in a version timeline.

    Generic structure that works for any versioned entity.
    """
    entity_id: Any
    version_number: int
    version_message: Optional[str]
    parent_id: Optional[Any]
    is_head: bool
    created_at: Optional[datetime]

    # Optional metadata (entity-specific)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "entity_id": self.entity_id,
            "version_number": self.version_number,
            "version_message": self.version_message,
            "parent_id": self.parent_id,
            "is_head": self.is_head,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            **self.metadata,
        }


@dataclass
class FamilyStats:
    """Statistics for a version family."""
    version_count: int
    latest_version_number: int
    oldest_version_number: int = 1

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version_count": self.version_count,
            "latest_version_number": self.latest_version_number,
            "oldest_version_number": self.oldest_version_number,
        }


# =============================================================================
# BASE SERVICE - Common versioning operations
# =============================================================================

class VersioningServiceBase(ABC, Generic[TFamily, TEntity]):
    """
    Abstract base class for versioning services.

    Subclasses configure entity mapping via class-level attributes:

        family_model         — SQLModel class for families (REQUIRED)
        entity_model         — SQLModel class for versioned entities (REQUIRED)
        entity_id_attr       — PK column name on entity (default "id")
        family_id_attr       — FK column linking entity -> family (default "version_family_id")
        parent_id_attr       — FK column linking entity -> parent entity (REQUIRED)
        version_number_attr  — column for version number (default "version_number")
        version_message_attr — column for version message (default "version_message")
        head_id_attr         — FK on *family* pointing to HEAD entity (None = no HEAD)

    The only abstract method is get_timeline_metadata().

    Type Parameters:
        TFamily: The family model type (e.g., AssetVersionFamily)
        TEntity: The versioned entity type (e.g., Asset)
    """

    # -- Config attributes (set by subclasses) --------------------------------
    family_model: type
    entity_model: type
    entity_id_attr: str = "id"
    family_id_attr: str = "version_family_id"
    parent_id_attr: str  # REQUIRED — varies per entity
    version_number_attr: str = "version_number"
    version_message_attr: str = "version_message"
    head_id_attr: Optional[str] = None  # None = no HEAD (e.g. Prompt)

    def __init__(self, db: AsyncSession):
        self.db = db
        self._validate_config()

    @staticmethod
    def _coerce_uuid(value: Any) -> UUID:
        """Safely coerce a UUID-like value (asyncpg UUID, str, etc.) to stdlib UUID."""
        if isinstance(value, UUID):
            return value
        return UUID(str(value))

    def _validate_config(self) -> None:
        """Fail fast if required config attributes are missing."""
        missing = [
            attr for attr in ("family_model", "entity_model", "parent_id_attr")
            if not getattr(type(self), attr, None)
        ]
        if missing:
            raise TypeError(
                f"{type(self).__name__} must set class attributes: "
                f"{', '.join(missing)}"
            )

    # =========================================================================
    # ENTITY ACCESSORS — concrete defaults using config attrs
    # Subclasses can still override via MRO if needed.
    # =========================================================================

    def get_family_model(self) -> type:
        """Return the SQLModel class for families."""
        return self.family_model

    def get_entity_model(self) -> type:
        """Return the SQLModel class for versioned entities."""
        return self.entity_model

    def get_parent_id(self, entity: TEntity) -> Optional[Any]:
        """Get the parent entity ID from an entity."""
        return getattr(entity, self.parent_id_attr)

    def get_entity_id(self, entity: TEntity) -> Any:
        """Get the entity's primary key."""
        return getattr(entity, self.entity_id_attr)

    def get_version_number(self, entity: TEntity) -> Optional[int]:
        """Get the version number from an entity."""
        return getattr(entity, self.version_number_attr)

    def get_version_message(self, entity: TEntity) -> Optional[str]:
        """Get the version message from an entity."""
        return getattr(entity, self.version_message_attr)

    def get_head_id(self, family: TFamily) -> Optional[Any]:
        """Get the HEAD entity ID from a family (if applicable)."""
        if self.head_id_attr is None:
            return None
        return getattr(family, self.head_id_attr)

    def build_family_id_filter(self, family_id: UUID):
        """Build SQLAlchemy filter for matching family_id on entities."""
        return getattr(self.entity_model, self.family_id_attr) == family_id

    def build_entity_id_filter(self, entity_id: Any):
        """Build SQLAlchemy filter for matching entity by ID."""
        return getattr(self.entity_model, self.entity_id_attr) == entity_id

    def build_parent_id_filter(self, parent_id: Any):
        """Build SQLAlchemy filter for matching parent_id on entities."""
        return getattr(self.entity_model, self.parent_id_attr) == parent_id

    @abstractmethod
    def get_timeline_metadata(self, entity: TEntity) -> Dict[str, Any]:
        """Extract entity-specific metadata for timeline entries."""
        ...

    # =========================================================================
    # COMMON OPERATIONS - Shared implementations
    # =========================================================================

    async def get_family(self, family_id: UUID) -> Optional[TFamily]:
        """Get a version family by ID."""
        FamilyModel = self.get_family_model()
        result = await self.db.execute(
            select(FamilyModel).where(FamilyModel.id == family_id)
        )
        return result.scalar_one_or_none()

    async def get_entity(self, entity_id: Any) -> Optional[TEntity]:
        """Get a versioned entity by ID."""
        EntityModel = self.get_entity_model()
        result = await self.db.execute(
            select(EntityModel).where(self.build_entity_id_filter(entity_id))
        )
        return result.scalar_one_or_none()

    async def get_family_for_entity(self, entity_id: Any) -> Optional[TFamily]:
        """Get the version family for an entity, if it belongs to one."""
        EntityModel = self.get_entity_model()
        family_col = getattr(EntityModel, self.family_id_attr)
        result = await self.db.execute(
            select(family_col).where(self.build_entity_id_filter(entity_id))
        )
        family_id_raw = result.scalar_one_or_none()
        if not family_id_raw:
            return None
        return await self.get_family(self._coerce_uuid(family_id_raw))

    async def get_family_stats(self, family_id: UUID) -> FamilyStats:
        """
        Get derived statistics for a family.

        Computed at query time to avoid concurrency issues.
        """
        EntityModel = self.get_entity_model()
        id_col = getattr(EntityModel, self.entity_id_attr)
        version_col = getattr(EntityModel, self.version_number_attr)
        result = await self.db.execute(
            select(
                func.count(id_col).label("version_count"),
                func.max(version_col).label("max_version"),
                func.min(version_col).label("min_version"),
            ).where(self.build_family_id_filter(family_id))
        )
        row = result.one()
        return FamilyStats(
            version_count=row.version_count or 0,
            latest_version_number=row.max_version or 0,
            oldest_version_number=row.min_version or 1,
        )

    async def get_next_version_number(
        self,
        family_id: UUID,
        lock: bool = True
    ) -> int:
        """
        Get the next version number for a family.

        Args:
            family_id: The family to get next version for
            lock: Whether to use SELECT FOR UPDATE (for concurrency safety)

        Returns:
            Next version number (max + 1)
        """
        if lock:
            # Lock family row to prevent concurrent version assignment
            FamilyModel = self.get_family_model()
            await self.db.execute(
                select(FamilyModel)
                .where(FamilyModel.id == family_id)
                .with_for_update()
            )

        EntityModel = self.get_entity_model()
        version_col = getattr(EntityModel, self.version_number_attr)
        result = await self.db.execute(
            select(func.max(version_col))
            .where(self.build_family_id_filter(family_id))
        )
        max_version = result.scalar() or 0
        return max_version + 1

    async def get_versions(
        self,
        family_id: UUID,
        order_asc: bool = True
    ) -> List[TEntity]:
        """Get all versions in a family, ordered by version number."""
        EntityModel = self.get_entity_model()
        version_col = getattr(EntityModel, self.version_number_attr)
        order = version_col.asc() if order_asc else version_col.desc()
        result = await self.db.execute(
            select(EntityModel)
            .where(self.build_family_id_filter(family_id))
            .order_by(order)
        )
        return list(result.scalars().all())

    async def get_timeline(self, family_id: UUID) -> List[TimelineEntry]:
        """
        Get timeline view of all versions in a family.

        Returns versions as TimelineEntry objects with HEAD indicator.
        """
        versions = await self.get_versions(family_id)
        family = await self.get_family(family_id)
        head_id = self.get_head_id(family) if family else None

        timeline = []
        for entity in versions:
            entity_id = self.get_entity_id(entity)
            timeline.append(TimelineEntry(
                entity_id=entity_id,
                version_number=self.get_version_number(entity) or 0,
                version_message=self.get_version_message(entity),
                parent_id=self.get_parent_id(entity),
                is_head=entity_id == head_id,
                created_at=getattr(entity, 'created_at', None),
                metadata=self.get_timeline_metadata(entity),
            ))

        return timeline

    async def get_ancestry(
        self,
        entity_id: Any,
        max_depth: int = 50
    ) -> List[TEntity]:
        """
        Get all ancestors of an entity (parent, grandparent, etc.).

        Args:
            entity_id: Starting entity
            max_depth: Maximum ancestors to return (safety limit)

        Returns:
            List of ancestors, oldest first
        """
        ancestors = []
        current_id = entity_id

        for _ in range(max_depth):
            entity = await self.get_entity(current_id)
            if not entity:
                break

            parent_id = self.get_parent_id(entity)
            if not parent_id:
                break

            parent = await self.get_entity(parent_id)
            if not parent:
                break

            ancestors.insert(0, parent)  # Insert at beginning (oldest first)
            current_id = self.get_entity_id(parent)

        return ancestors

    async def get_ancestor_ids(
        self,
        entity_id: Any,
        max_depth: int = 50
    ) -> List[Any]:
        """
        Get ancestor IDs of an entity (parent, grandparent, etc.).

        Returns IDs ordered from closest parent to oldest ancestor.
        """
        ancestor_ids: List[Any] = []
        current_id = entity_id

        for _ in range(max_depth):
            entity = await self.get_entity(current_id)
            if not entity:
                break

            parent_id = self.get_parent_id(entity)
            if not parent_id:
                break

            ancestor_ids.append(parent_id)
            current_id = parent_id

        return ancestor_ids

    async def get_descendants(self, entity_id: Any) -> List[TEntity]:
        """Get all direct descendants (children) of an entity."""
        EntityModel = self.get_entity_model()
        version_col = getattr(EntityModel, self.version_number_attr)
        result = await self.db.execute(
            select(EntityModel)
            .where(self.build_parent_id_filter(entity_id))
            .order_by(version_col.asc())
        )
        return list(result.scalars().all())

    async def get_version_chain(
        self,
        entity_id: Any,
        include_self: bool = True
    ) -> List[TEntity]:
        """
        Get the full version chain from root to this entity.

        Args:
            entity_id: The entity to get chain for
            include_self: Whether to include the entity itself

        Returns:
            List from oldest ancestor to entity (or parent if not include_self)
        """
        entity = await self.get_entity(entity_id)
        if not entity:
            return []

        ancestors = await self.get_ancestry(entity_id)

        if include_self:
            ancestors.append(entity)

        return ancestors

    # =========================================================================
    # HEAD MANAGEMENT — shared for entities with head_id_attr
    # =========================================================================

    async def on_head_changed(
        self,
        family: TFamily,
        old_head_id: Optional[Any],
        new_head_id: Any,
    ) -> None:
        """Hook called when HEAD changes. Override for side effects
        (e.g. hiding superseded versions from listings)."""

    async def set_head(self, family_id: UUID, entity_id: Any) -> TFamily:
        """
        Set which entity is the HEAD (current best) version.

        Args:
            family_id: The family to update
            entity_id: The entity to set as HEAD

        Returns:
            Updated family

        Raises:
            ValueError: If head_id_attr is None or entity doesn't belong to family
        """
        if self.head_id_attr is None:
            raise ValueError(
                f"{type(self).__name__} does not support HEAD management"
            )

        # Verify entity belongs to family
        result = await self.db.execute(
            select(self.entity_model).where(
                self.build_entity_id_filter(entity_id),
                self.build_family_id_filter(family_id),
            )
        )
        entity = result.scalar_one_or_none()
        if not entity:
            raise ValueError(
                f"Entity {entity_id} does not belong to family {family_id}"
            )

        # Update family HEAD
        family = await self.get_family(family_id)
        if not family:
            raise ValueError(f"Family {family_id} not found")

        old_head_id = self.get_head_id(family)
        setattr(family, self.head_id_attr, entity_id)
        family.updated_at = datetime.now(timezone.utc)

        await self.db.flush()
        await self.on_head_changed(family, old_head_id, entity_id)
        return family

    async def elect_new_head(self, family_id: UUID) -> Optional[Any]:
        """
        Auto-elect a new HEAD after the current HEAD is deleted.

        Strategy: Pick the entity with the highest version_number.

        Returns:
            The new head entity ID, or None if family is empty.
            No-op (returns None) if head_id_attr is None.
        """
        if self.head_id_attr is None:
            return None

        EntityModel = self.entity_model
        id_col = getattr(EntityModel, self.entity_id_attr)
        version_col = getattr(EntityModel, self.version_number_attr)

        result = await self.db.execute(
            select(id_col)
            .where(self.build_family_id_filter(family_id))
            .order_by(version_col.desc())
            .limit(1)
        )
        new_head_id = result.scalar_one_or_none()

        if new_head_id:
            family = await self.get_family(family_id)
            if family:
                old_head_id = self.get_head_id(family)
                setattr(family, self.head_id_attr, new_head_id)
                family.updated_at = datetime.now(timezone.utc)
                await self.db.flush()
                await self.on_head_changed(family, old_head_id, new_head_id)

        return new_head_id

    async def get_version_timeline(self, family_id: UUID) -> List[dict]:
        """
        Get timeline view of all versions (returns dicts for API response).

        Wraps the base get_timeline() and converts to dicts.
        """
        timeline = await self.get_timeline(family_id)
        return [entry.to_dict() for entry in timeline]

    async def upgrade_entity_to_v1(
        self,
        family: TFamily,
        entity: TEntity,
        message: str = "Initial version",
    ) -> None:
        """
        Upgrade a standalone entity to v1 of a family.

        Sets family_id, version_number=1, parent=None, and version_message.
        Flushes but does NOT create the family — caller must do that first.
        """
        setattr(entity, self.family_id_attr, family.id)
        setattr(entity, self.version_number_attr, 1)
        setattr(entity, self.parent_id_attr, None)
        setattr(entity, self.version_message_attr, message)
        await self.db.flush()
