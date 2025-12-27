"""
Spatial Query Service - maintains queryable index of game entities

Provides fast spatial queries over SpatialObjects (NPCs, items, props, etc.)
using in-memory indexing. Designed to be 2D-first but 3D-ready.

Architecture:
- In-memory index for MVP (can be swapped for R-tree/KD-tree later)
- Entity-agnostic: works with any SpatialObject (NPCs, items, props, players)
- Safe to rebuild from authoritative state (NPCState, ItemState, etc.)
- Emits game:entity_moved events when transforms update

Usage:
    # Register an entity
    await spatial_service.register_entity({
        "id": 123,
        "kind": "npc",
        "transform": {...},
        "tags": ["friendly", "shopkeeper"]
    })

    # Query by location
    entities = await spatial_service.query_by_location(
        world_id=1,
        location_id=42
    )

    # Query by bounds
    entities = await spatial_service.query_by_bounds(
        world_id=1,
        location_id=42,
        min_x=0, max_x=100,
        min_y=0, max_y=100
    )

    # Query by radius
    entities = await spatial_service.query_by_radius(
        world_id=1,
        x=50, y=50,
        radius=10
    )
"""
from __future__ import annotations

from typing import Optional, List, Dict, Any, Union
from dataclasses import dataclass, field
import asyncio
import logging

from pixsim7.backend.main.infrastructure.events.bus import event_bus, register_event_type

logger = logging.getLogger(__name__)

# Type alias for entity IDs (supports both int and UUID string)
EntityId = Union[int, str]


# ===== EVENT REGISTRATION =====

def _register_spatial_events():
    """Register spatial query service events for documentation"""
    register_event_type(
        "game:entity_moved",
        "Emitted when an entity's transform changes",
        payload_schema={
            "entity_type": "str (npc, item, prop, player, etc.)",
            "entity_id": "int | str (branded ID or UUID)",
            "transform": "Transform dict with worldId, locationId, position, etc.",
            "link_id": "optional str - template/runtime link identifier (e.g., 'npc_template:123')",
            "template_kind": "optional str - template type if applicable (e.g., 'npc_template')",
            "template_id": "optional int | str - template ID if applicable",
            "previous_transform": "optional Transform dict - previous state"
        },
        source="SpatialQueryService"
    )

    register_event_type(
        "game:entity_spawned",
        "Emitted when an entity is added to the spatial index",
        payload_schema={
            "entity_type": "str",
            "entity_id": "int | str (branded ID or UUID)",
            "transform": "Transform dict",
            "tags": "optional list[str]",
            "template_kind": "optional str",
            "template_id": "optional int | str"
        },
        source="SpatialQueryService"
    )

    register_event_type(
        "game:entity_despawned",
        "Emitted when an entity is removed from the spatial index",
        payload_schema={
            "entity_type": "str",
            "entity_id": "int | str (branded ID or UUID)"
        },
        source="SpatialQueryService"
    )


# Register events on module import
_register_spatial_events()


# ===== DATA STRUCTURES =====

@dataclass
class IndexedEntity:
    """
    Internal representation of a spatial entity in the index

    Mirrors SpatialObject from shared types but optimized for querying
    """
    id: EntityId  # int or str (branded ID/UUID)
    kind: str  # npc, item, prop, player, etc.
    world_id: int
    location_id: Optional[int]
    position: Dict[str, float]  # {x, y, z?}
    orientation: Optional[Dict[str, float]] = None  # {yaw?, pitch?, roll?}
    scale: Optional[Dict[str, float]] = None
    tags: List[str] = field(default_factory=list)
    meta: Dict[str, Any] = field(default_factory=dict)

    # Template link info (optional)
    template_kind: Optional[str] = None  # e.g., "npc_template"
    template_id: Optional[EntityId] = None

    # Cached for fast queries
    _x: float = 0.0
    _y: float = 0.0
    _z: float = 0.0

    def __post_init__(self):
        """Extract position components for fast access"""
        self._x = self.position.get("x", 0.0)
        self._y = self.position.get("y", 0.0)
        self._z = self.position.get("z", 0.0)


class SpatialQueryService:
    """
    Spatial query service for fast entity lookups

    This service maintains an in-memory index of all entities with spatial
    data (position, bounds, etc.) and provides efficient queries.

    Performance notes:
    - Query complexity: O(n) linear scan within location (MVP implementation)
    - For large worlds (>1000 entities/location), consider R-tree or KD-tree
    - Batch updates recommended for many concurrent changes

    Thread-safe: Uses asyncio locks for concurrent access.
    Rebuildable: Index is in-memory and can be rebuilt from authoritative state.
    """

    def __init__(self):
        # Primary index: {kind: {id: IndexedEntity}}
        self._entities: Dict[str, Dict[EntityId, IndexedEntity]] = {}

        # Secondary indexes for fast queries
        # {world_id: {location_id: {kind: set(entity_ids)}}}
        self._by_location: Dict[int, Dict[Optional[int], Dict[str, set]]] = {}

        # Lock for thread-safe updates
        self._lock = asyncio.Lock()

        logger.info("SpatialQueryService initialized")

    def _validate_transform(self, transform: Dict[str, Any]) -> None:
        """
        Validate that a transform has required fields

        Raises:
            ValueError: If transform is missing required fields
        """
        if not isinstance(transform, dict):
            raise ValueError("Transform must be a dictionary")

        if "worldId" not in transform:
            raise ValueError("Transform must include 'worldId' field")

        if "position" not in transform:
            raise ValueError("Transform must include 'position' field")

        position = transform["position"]
        if not isinstance(position, dict):
            raise ValueError("Transform position must be a dictionary")

        if "x" not in position or "y" not in position:
            raise ValueError("Transform position must include 'x' and 'y' fields")

        # Warn about optional fields if missing (helps catch errors)
        if "locationId" not in transform:
            logger.debug("Transform missing optional 'locationId' field")

        if "space" not in transform:
            logger.debug("Transform missing optional 'space' field (defaulting to world_2d)")

    async def register_entity(
        self,
        spatial_object: Dict[str, Any],
        emit_event: bool = True
    ) -> None:
        """
        Register or update an entity in the spatial index

        Args:
            spatial_object: SpatialObject dict with id, kind, transform, tags
            emit_event: Whether to emit game:entity_spawned event

        Example:
            await spatial_service.register_entity({
                "id": 123,  # int or str (UUID)
                "kind": "npc",
                "transform": {
                    "worldId": 1,
                    "locationId": 42,
                    "position": {"x": 100, "y": 50}
                },
                "tags": ["friendly"],
                "template_kind": "npc_template",  # optional
                "template_id": 456  # optional
            })
        """
        # Validate required fields
        if "id" not in spatial_object:
            raise ValueError("spatial_object must include 'id' field")
        if "kind" not in spatial_object:
            raise ValueError("spatial_object must include 'kind' field")
        if "transform" not in spatial_object:
            raise ValueError("spatial_object must include 'transform' field")

        entity_id = spatial_object["id"]
        kind = spatial_object["kind"]
        transform = spatial_object["transform"]

        # Validate transform structure
        self._validate_transform(transform)

        async with self._lock:
            # Extract transform components
            world_id = transform["worldId"]
            location_id = transform.get("locationId")
            position = transform["position"]
            orientation = transform.get("orientation")
            scale = transform.get("scale")
            tags = spatial_object.get("tags", [])
            meta = spatial_object.get("meta", {})

            # Extract template link info if present
            template_kind = spatial_object.get("template_kind")
            template_id = spatial_object.get("template_id")

            # Create indexed entity
            entity = IndexedEntity(
                id=entity_id,
                kind=kind,
                world_id=world_id,
                location_id=location_id,
                position=position,
                orientation=orientation,
                scale=scale,
                tags=tags,
                meta=meta,
                template_kind=template_kind,
                template_id=template_id
            )

            # Update primary index
            if kind not in self._entities:
                self._entities[kind] = {}

            # Check if this is a new entity or an update
            is_new = entity_id not in self._entities[kind]

            self._entities[kind][entity_id] = entity

            # Update location index
            self._index_by_location(entity)

            logger.debug(
                f"Registered {kind}:{entity_id} at world={world_id}, "
                f"location={location_id}, pos=({entity._x}, {entity._y})"
            )

        # Emit event outside lock
        if emit_event:
            event_type = "game:entity_spawned" if is_new else "game:entity_moved"
            payload = {
                "entity_type": kind,
                "entity_id": entity_id,
                "transform": transform,
                "tags": tags
            }

            # Include template link info if available
            if template_kind:
                payload["template_kind"] = template_kind
            if template_id is not None:
                payload["template_id"] = template_id

            await event_bus.publish(event_type, payload)

    async def update_entity_transform(
        self,
        kind: str,
        entity_id: EntityId,
        transform: Dict[str, Any],
        emit_event: bool = True
    ) -> None:
        """
        Update an entity's transform

        Args:
            kind: Entity kind (npc, item, prop, etc.)
            entity_id: Entity ID (int or str/UUID)
            transform: New transform dict
            emit_event: Whether to emit game:entity_moved event
        """
        # Validate transform structure
        self._validate_transform(transform)
        async with self._lock:
            if kind not in self._entities or entity_id not in self._entities[kind]:
                raise ValueError(f"Entity {kind}:{entity_id} not found in spatial index")

            entity = self._entities[kind][entity_id]

            # Store previous transform for event
            previous_transform = {
                "worldId": entity.world_id,
                "locationId": entity.location_id,
                "position": entity.position.copy(),
                "orientation": entity.orientation.copy() if entity.orientation else None,
                "scale": entity.scale.copy() if entity.scale else None
            }

            # Remove from old location index
            self._unindex_by_location(entity)

            # Update entity
            entity.world_id = transform.get("worldId", entity.world_id)
            entity.location_id = transform.get("locationId", entity.location_id)
            entity.position = transform.get("position", entity.position)
            entity.orientation = transform.get("orientation", entity.orientation)
            entity.scale = transform.get("scale", entity.scale)

            # Update cached position
            entity._x = entity.position.get("x", 0.0)
            entity._y = entity.position.get("y", 0.0)
            entity._z = entity.position.get("z", 0.0)

            # Re-index at new location
            self._index_by_location(entity)

            logger.debug(
                f"Updated {kind}:{entity_id} transform to "
                f"world={entity.world_id}, location={entity.location_id}"
            )

        # Emit event outside lock
        if emit_event:
            payload = {
                "entity_type": kind,
                "entity_id": entity_id,
                "transform": transform,
                "previous_transform": previous_transform
            }

            # Include template link info if available
            if entity.template_kind:
                payload["template_kind"] = entity.template_kind
            if entity.template_id is not None:
                payload["template_id"] = entity.template_id
                # Also construct link_id for convenience
                payload["link_id"] = f"{entity.template_kind}:{entity.template_id}"

            await event_bus.publish("game:entity_moved", payload)

    async def remove_entity(
        self,
        kind: str,
        entity_id: EntityId,
        emit_event: bool = True
    ) -> None:
        """
        Remove an entity from the spatial index

        Args:
            kind: Entity kind
            entity_id: Entity ID
            emit_event: Whether to emit game:entity_despawned event
        """
        async with self._lock:
            if kind not in self._entities or entity_id not in self._entities[kind]:
                logger.warning(f"Attempted to remove non-existent entity {kind}:{entity_id}")
                return

            entity = self._entities[kind][entity_id]

            # Remove from location index
            self._unindex_by_location(entity)

            # Remove from primary index
            del self._entities[kind][entity_id]

            logger.debug(f"Removed {kind}:{entity_id} from spatial index")

        # Emit event outside lock
        if emit_event:
            await event_bus.publish("game:entity_despawned", {
                "entity_type": kind,
                "entity_id": entity_id
            })

    async def query_by_location(
        self,
        world_id: int,
        location_id: Optional[int] = None,
        kinds: Optional[List[str]] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Query entities at a specific world/location

        Args:
            world_id: World ID to query
            location_id: Optional location ID (None = all locations in world)
            kinds: Optional list of entity kinds to filter (e.g., ["npc", "item"])
            tags: Optional list of tags - entities must have at least one

        Returns:
            List of SpatialObject dicts
        """
        results = []

        async with self._lock:
            # Get entities at this location
            if world_id not in self._by_location:
                return []

            world_index = self._by_location[world_id]

            # Determine which locations to search
            locations_to_search = [location_id] if location_id is not None else list(world_index.keys())

            for loc_id in locations_to_search:
                if loc_id not in world_index:
                    continue

                location_index = world_index[loc_id]

                # Determine which kinds to search
                kinds_to_search = kinds if kinds else list(location_index.keys())

                for kind in kinds_to_search:
                    if kind not in location_index:
                        continue

                    entity_ids = location_index[kind]

                    for entity_id in entity_ids:
                        if kind in self._entities and entity_id in self._entities[kind]:
                            entity = self._entities[kind][entity_id]

                            # Filter by tags if specified
                            if tags and not any(tag in entity.tags for tag in tags):
                                continue

                            results.append(self._entity_to_dict(entity))

        return results

    async def query_by_bounds(
        self,
        world_id: int,
        min_x: float,
        max_x: float,
        min_y: float,
        max_y: float,
        min_z: Optional[float] = None,
        max_z: Optional[float] = None,
        location_id: Optional[int] = None,
        kinds: Optional[List[str]] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Query entities within an AABB (axis-aligned bounding box)

        Args:
            world_id: World ID to query
            min_x, max_x, min_y, max_y: 2D bounds
            min_z, max_z: Optional 3D bounds (ignored for 2D queries)
            location_id: Optional location filter
            kinds: Optional entity kinds filter
            tags: Optional tags filter

        Returns:
            List of SpatialObject dicts within bounds
        """
        # First get all entities at location (or world)
        candidates = await self.query_by_location(
            world_id=world_id,
            location_id=location_id,
            kinds=kinds,
            tags=tags
        )

        # Filter by bounds
        results = []
        for entity_dict in candidates:
            pos = entity_dict["transform"]["position"]
            x = pos.get("x", 0.0)
            y = pos.get("y", 0.0)
            z = pos.get("z", 0.0)

            # Check 2D bounds
            if not (min_x <= x <= max_x and min_y <= y <= max_y):
                continue

            # Check 3D bounds if specified
            if min_z is not None and max_z is not None:
                if not (min_z <= z <= max_z):
                    continue

            results.append(entity_dict)

        return results

    async def query_by_radius(
        self,
        world_id: int,
        x: float,
        y: float,
        radius: float,
        z: Optional[float] = None,
        location_id: Optional[int] = None,
        kinds: Optional[List[str]] = None,
        tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Query entities within a circular/spherical radius

        Args:
            world_id: World ID
            x, y: Center position
            radius: Search radius
            z: Optional Z coordinate for 3D search
            location_id: Optional location filter
            kinds: Optional kinds filter
            tags: Optional tags filter

        Returns:
            List of SpatialObject dicts within radius
        """
        # Use bounds query as first pass (optimized AABB)
        candidates = await self.query_by_bounds(
            world_id=world_id,
            min_x=x - radius,
            max_x=x + radius,
            min_y=y - radius,
            max_y=y + radius,
            min_z=z - radius if z is not None else None,
            max_z=z + radius if z is not None else None,
            location_id=location_id,
            kinds=kinds,
            tags=tags
        )

        # Filter by actual distance
        results = []
        radius_sq = radius * radius

        for entity_dict in candidates:
            pos = entity_dict["transform"]["position"]
            ex = pos.get("x", 0.0)
            ey = pos.get("y", 0.0)
            ez = pos.get("z", 0.0)

            # Calculate distance squared
            dx = ex - x
            dy = ey - y
            dz = (ez - z) if z is not None else 0.0

            dist_sq = dx*dx + dy*dy + dz*dz

            if dist_sq <= radius_sq:
                results.append(entity_dict)

        return results

    async def get_entity(
        self,
        kind: str,
        entity_id: EntityId
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific entity by kind and ID

        Args:
            kind: Entity kind
            entity_id: Entity ID

        Returns:
            SpatialObject dict or None if not found
        """
        async with self._lock:
            if kind not in self._entities or entity_id not in self._entities[kind]:
                return None

            entity = self._entities[kind][entity_id]
            return self._entity_to_dict(entity)

    async def batch_register_entities(
        self,
        spatial_objects: List[Dict[str, Any]],
        emit_events: bool = True
    ) -> None:
        """
        Register multiple entities in a single batch operation

        This is more efficient than calling register_entity() multiple times
        as it only acquires the lock once.

        Args:
            spatial_objects: List of SpatialObject dicts
            emit_events: Whether to emit events for each entity

        Example:
            await spatial_service.batch_register_entities([
                {"id": 1, "kind": "npc", "transform": {...}},
                {"id": 2, "kind": "npc", "transform": {...}},
                {"id": 3, "kind": "item", "transform": {...}}
            ])
        """
        # Validate all objects first (outside lock)
        for spatial_object in spatial_objects:
            if "id" not in spatial_object:
                raise ValueError("All spatial_objects must include 'id' field")
            if "kind" not in spatial_object:
                raise ValueError("All spatial_objects must include 'kind' field")
            if "transform" not in spatial_object:
                raise ValueError("All spatial_objects must include 'transform' field")
            self._validate_transform(spatial_object["transform"])

        # Now do the batch update under lock
        async with self._lock:
            events_to_emit = []

            for spatial_object in spatial_objects:
                entity_id = spatial_object["id"]
                kind = spatial_object["kind"]
                transform = spatial_object["transform"]

                # Extract all fields
                world_id = transform["worldId"]
                location_id = transform.get("locationId")
                position = transform["position"]
                orientation = transform.get("orientation")
                scale = transform.get("scale")
                tags = spatial_object.get("tags", [])
                meta = spatial_object.get("meta", {})
                template_kind = spatial_object.get("template_kind")
                template_id = spatial_object.get("template_id")

                # Create entity
                entity = IndexedEntity(
                    id=entity_id,
                    kind=kind,
                    world_id=world_id,
                    location_id=location_id,
                    position=position,
                    orientation=orientation,
                    scale=scale,
                    tags=tags,
                    meta=meta,
                    template_kind=template_kind,
                    template_id=template_id
                )

                # Update indexes
                if kind not in self._entities:
                    self._entities[kind] = {}

                is_new = entity_id not in self._entities[kind]
                self._entities[kind][entity_id] = entity
                self._index_by_location(entity)

                # Queue event
                if emit_events:
                    event_type = "game:entity_spawned" if is_new else "game:entity_moved"
                    payload = {
                        "entity_type": kind,
                        "entity_id": entity_id,
                        "transform": transform,
                        "tags": tags
                    }
                    if template_kind:
                        payload["template_kind"] = template_kind
                    if template_id is not None:
                        payload["template_id"] = template_id
                    events_to_emit.append((event_type, payload))

        # Emit all events outside lock
        for event_type, payload in events_to_emit:
            await event_bus.publish(event_type, payload)

        logger.info(f"Batch registered {len(spatial_objects)} entities")

    async def batch_update_transforms(
        self,
        updates: List[tuple[str, EntityId, Dict[str, Any]]],
        emit_events: bool = True
    ) -> None:
        """
        Update transforms for multiple entities in a single batch operation

        More efficient than multiple update_entity_transform() calls.

        Args:
            updates: List of (kind, entity_id, transform) tuples
            emit_events: Whether to emit events

        Example:
            await spatial_service.batch_update_transforms([
                ("npc", 1, {...}),
                ("npc", 2, {...}),
                ("item", 3, {...})
            ])
        """
        # Validate all transforms first (outside lock)
        for kind, entity_id, transform in updates:
            self._validate_transform(transform)

        # Batch update under lock
        async with self._lock:
            events_to_emit = []

            for kind, entity_id, transform in updates:
                if kind not in self._entities or entity_id not in self._entities[kind]:
                    logger.warning(f"Entity {kind}:{entity_id} not found in batch update, skipping")
                    continue

                entity = self._entities[kind][entity_id]

                # Store previous transform
                previous_transform = {
                    "worldId": entity.world_id,
                    "locationId": entity.location_id,
                    "position": entity.position.copy(),
                    "orientation": entity.orientation.copy() if entity.orientation else None,
                    "scale": entity.scale.copy() if entity.scale else None
                }

                # Remove from old location
                self._unindex_by_location(entity)

                # Update entity
                entity.world_id = transform.get("worldId", entity.world_id)
                entity.location_id = transform.get("locationId", entity.location_id)
                entity.position = transform.get("position", entity.position)
                entity.orientation = transform.get("orientation", entity.orientation)
                entity.scale = transform.get("scale", entity.scale)
                entity._x = entity.position.get("x", 0.0)
                entity._y = entity.position.get("y", 0.0)
                entity._z = entity.position.get("z", 0.0)

                # Re-index at new location
                self._index_by_location(entity)

                # Queue event
                if emit_events:
                    payload = {
                        "entity_type": kind,
                        "entity_id": entity_id,
                        "transform": transform,
                        "previous_transform": previous_transform
                    }
                    if entity.template_kind:
                        payload["template_kind"] = entity.template_kind
                    if entity.template_id is not None:
                        payload["template_id"] = entity.template_id
                        payload["link_id"] = f"{entity.template_kind}:{entity.template_id}"
                    events_to_emit.append(("game:entity_moved", payload))

        # Emit events outside lock
        for event_type, payload in events_to_emit:
            await event_bus.publish(event_type, payload)

        logger.info(f"Batch updated {len(updates)} entity transforms")

    async def clear(self) -> None:
        """Clear all entities from the index (useful for testing/reset)"""
        async with self._lock:
            self._entities.clear()
            self._by_location.clear()
            logger.info("Cleared spatial index")

    # ===== INTERNAL HELPERS =====

    def _index_by_location(self, entity: IndexedEntity) -> None:
        """Add entity to location index (caller must hold lock)"""
        world_id = entity.world_id
        location_id = entity.location_id
        kind = entity.kind
        entity_id = entity.id

        if world_id not in self._by_location:
            self._by_location[world_id] = {}

        if location_id not in self._by_location[world_id]:
            self._by_location[world_id][location_id] = {}

        if kind not in self._by_location[world_id][location_id]:
            self._by_location[world_id][location_id][kind] = set()

        self._by_location[world_id][location_id][kind].add(entity_id)

    def _unindex_by_location(self, entity: IndexedEntity) -> None:
        """Remove entity from location index (caller must hold lock)"""
        world_id = entity.world_id
        location_id = entity.location_id
        kind = entity.kind
        entity_id = entity.id

        if (world_id in self._by_location and
            location_id in self._by_location[world_id] and
            kind in self._by_location[world_id][location_id]):

            self._by_location[world_id][location_id][kind].discard(entity_id)

            # Cleanup empty indexes
            if not self._by_location[world_id][location_id][kind]:
                del self._by_location[world_id][location_id][kind]

            if not self._by_location[world_id][location_id]:
                del self._by_location[world_id][location_id]

            if not self._by_location[world_id]:
                del self._by_location[world_id]

    def _entity_to_dict(self, entity: IndexedEntity) -> Dict[str, Any]:
        """Convert IndexedEntity to SpatialObject dict"""
        transform = {
            "worldId": entity.world_id,
            "position": entity.position.copy()
        }

        if entity.location_id is not None:
            transform["locationId"] = entity.location_id

        if entity.orientation:
            transform["orientation"] = entity.orientation.copy()

        if entity.scale:
            transform["scale"] = entity.scale.copy()

        return {
            "id": entity.id,
            "kind": entity.kind,
            "transform": transform,
            "tags": entity.tags.copy(),
            "meta": entity.meta.copy()
        }


# Global instance (singleton)
_spatial_service_instance: Optional[SpatialQueryService] = None


def get_spatial_service() -> SpatialQueryService:
    """Get or create the global spatial service instance"""
    global _spatial_service_instance
    if _spatial_service_instance is None:
        _spatial_service_instance = SpatialQueryService()
    return _spatial_service_instance
