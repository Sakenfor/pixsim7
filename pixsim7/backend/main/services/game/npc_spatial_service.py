from __future__ import annotations

from typing import Optional, Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from pixsim7.backend.main.domain.game.models import NPCState, GameNPC
from pixsim7.backend.main.services.game.spatial_query_service import get_spatial_service
from pixsim7.backend.main.infrastructure.events.bus import event_bus


class NpcSpatialService:
    """
    Service for managing NPC spatial transforms (position, orientation, scale).

    This service provides the canonical API for updating NPC positioning without
    ad-hoc field manipulation. It works with the Transform model from shared types.

    Design notes:
    - Authoritative storage: NPCState.transform (JSON field)
    - Fallback: NPCState.current_location_id (for backward compatibility)
    - 2D-first: Most transforms will only use x, y, yaw
    - 3D-ready: z, pitch, roll available when needed
    - GameObject alignment: Transform dicts match the GameObject.transform schema

    Generic pattern:
    This service demonstrates the pattern for spatial services. Other entity types
    (items, props, players) should follow the same approach:
    - Store transform in entity state table as JSON
    - Provide get_transform/update_transform methods
    - Accept/return Transform dicts matching shared types
    - Support batch operations for efficiency

    Example transform structure:
    {
        "worldId": 1,
        "locationId": 42,
        "position": {"x": 100, "y": 50, "z": 0},
        "orientation": {"yaw": 90},
        "space": "world_2d"
    }
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_npc_transform(self, npc_id: int) -> Optional[Dict[str, Any]]:
        """
        Get the current spatial transform for an NPC.

        Returns:
            Transform dict if present, or None if NPC has no transform data.
            Falls back to deriving minimal transform from current_location_id.
        """
        result = await self.db.execute(
            select(NPCState).where(NPCState.npc_id == npc_id)
        )
        npc_state = result.scalar_one_or_none()

        if not npc_state:
            return None

        # Return existing transform if available
        if npc_state.transform:
            return npc_state.transform

        # Fallback: derive minimal transform from location_id
        if npc_state.current_location_id is not None:
            # Note: We don't know the worldId here without joining GameNPC
            # For a complete fallback, you could join to get home_location_id's world
            # For now, return minimal structure
            return {
                "locationId": npc_state.current_location_id,
                "position": {"x": 0, "y": 0},  # Default spawn position
                "space": "world_2d"
            }

        return None

    async def update_npc_transform(
        self,
        npc_id: int,
        transform: Dict[str, Any],
        sync_location_id: bool = True,
        emit_events: bool = True
    ) -> Dict[str, Any]:
        """
        Update an NPC's spatial transform.

        Args:
            npc_id: NPC to update
            transform: Transform dict matching the shared Transform type
            sync_location_id: If True, also update current_location_id from transform.locationId
            emit_events: If True, emit game:entity_moved event and update spatial index

        Returns:
            The updated transform dict

        Raises:
            ValueError: If NPC doesn't exist or transform is invalid
        """
        # Validate transform has required fields
        if "position" not in transform:
            raise ValueError("Transform must include 'position' field")

        # Get previous transform for event payload
        previous_transform = None
        if emit_events:
            previous_transform = await self.get_npc_transform(npc_id)

        # Get or create NPCState
        result = await self.db.execute(
            select(NPCState).where(NPCState.npc_id == npc_id)
        )
        npc_state = result.scalar_one_or_none()

        if not npc_state:
            # Verify NPC exists before creating state
            npc_result = await self.db.execute(
                select(GameNPC).where(GameNPC.id == npc_id)
            )
            if not npc_result.scalar_one_or_none():
                raise ValueError(f"NPC {npc_id} does not exist")

            # Create new state
            npc_state = NPCState(npc_id=npc_id, transform=transform)
            self.db.add(npc_state)
        else:
            # Update existing state
            npc_state.transform = transform

        # Optionally sync current_location_id for backward compatibility
        if sync_location_id and "locationId" in transform:
            npc_state.current_location_id = transform["locationId"]

        await self.db.commit()
        await self.db.refresh(npc_state)

        # Update spatial index and emit events
        if emit_events:
            spatial_service = get_spatial_service()

            # Create spatial object
            spatial_object = {
                "id": npc_id,
                "kind": "npc",
                "transform": transform,
                "tags": []  # Could fetch from NPC metadata if available
            }

            # Update or register in spatial index (this also emits events)
            try:
                await spatial_service.update_entity_transform(
                    kind="npc",
                    entity_id=npc_id,
                    transform=transform,
                    emit_event=False  # We'll emit manually with more context
                )
            except ValueError:
                # Entity not in index yet, register it
                await spatial_service.register_entity(spatial_object, emit_event=False)

            # Emit event with additional context
            await event_bus.publish("game:entity_moved", {
                "entity_type": "npc",
                "entity_id": npc_id,
                "transform": transform,
                "previous_transform": previous_transform,
                # TODO: Add link_id when ObjectLink integration is available
            })

        return npc_state.transform

    async def update_npc_position(
        self,
        npc_id: int,
        x: float,
        y: float,
        z: Optional[float] = None,
        world_id: Optional[int] = None,
        location_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Convenience method to update just the position of an NPC.

        Preserves existing orientation and scale if present.

        Args:
            npc_id: NPC to update
            x, y, z: Position coordinates (z optional for 2D)
            world_id: World ID (optional, preserved from existing transform if not provided)
            location_id: Location ID (optional, preserved from existing transform if not provided)

        Returns:
            The updated transform dict
        """
        # Get existing transform
        existing = await self.get_npc_transform(npc_id)

        # Build new position
        position = {"x": x, "y": y}
        if z is not None:
            position["z"] = z

        # Build updated transform
        transform: Dict[str, Any] = {
            "position": position
        }

        # Preserve or set worldId
        if world_id is not None:
            transform["worldId"] = world_id
        elif existing and "worldId" in existing:
            transform["worldId"] = existing["worldId"]

        # Preserve or set locationId
        if location_id is not None:
            transform["locationId"] = location_id
        elif existing and "locationId" in existing:
            transform["locationId"] = existing["locationId"]

        # Preserve existing orientation and scale
        if existing:
            if "orientation" in existing:
                transform["orientation"] = existing["orientation"]
            if "scale" in existing:
                transform["scale"] = existing["scale"]
            if "space" in existing:
                transform["space"] = existing["space"]

        return await self.update_npc_transform(npc_id, transform)

    async def batch_update_transforms(
        self,
        updates: List[tuple[int, Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        """
        Update transforms for multiple NPCs in a single transaction.

        Args:
            updates: List of (npc_id, transform) tuples

        Returns:
            List of updated transform dicts in the same order
        """
        results = []
        for npc_id, transform in updates:
            updated = await self.update_npc_transform(npc_id, transform, sync_location_id=True)
            results.append(updated)

        return results

    async def clear_npc_transform(self, npc_id: int) -> None:
        """
        Clear an NPC's transform data.

        This reverts to using only current_location_id for presence tracking.
        """
        await self.db.execute(
            update(NPCState)
            .where(NPCState.npc_id == npc_id)
            .values(transform=None)
        )
        await self.db.commit()
