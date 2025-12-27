"""
Game inventory management endpoints

Uses async database session and service patterns for consistency with other game APIs.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from pixsim7.backend.main.api.dependencies import CurrentUser, GameSessionSvc
from pixsim7.backend.main.services.game.inventory import InventoryService, InventoryItem

router = APIRouter(prefix="/game/inventory", tags=["game-inventory"])


# Request/Response models
class AddItemRequest(BaseModel):
    item_id: str
    name: str
    quantity: int = 1
    metadata: Optional[Dict[str, Any]] = None


class RemoveItemRequest(BaseModel):
    quantity: int = 1


class UpdateItemRequest(BaseModel):
    name: Optional[str] = None
    quantity: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


class InventoryStatsResponse(BaseModel):
    unique_items: int
    total_quantity: int


class MessageResponse(BaseModel):
    message: str


async def _get_owned_session(session_id: int, user: CurrentUser, game_session_service: GameSessionSvc):
    """Fetch a session and ensure it belongs to the current user."""
    gs = await game_session_service.get_session(session_id)
    if not gs or gs.user_id != user.id:
        raise HTTPException(status_code=404, detail="Game session not found")
    return gs


@router.get("/sessions/{session_id}/items", response_model=List[InventoryItem])
async def list_inventory_items(
    session_id: int,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """List all items in a game session's inventory"""
    game_session = await _get_owned_session(session_id, user, game_session_service)
    items = InventoryService.get_inventory(game_session.flags)
    return items


@router.get("/sessions/{session_id}/items/{item_id}", response_model=InventoryItem)
async def get_inventory_item(
    session_id: int,
    item_id: str,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Get a specific item from inventory"""
    game_session = await _get_owned_session(session_id, user, game_session_service)
    item = InventoryService.get_item(game_session.flags, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in inventory")
    return item


@router.post("/sessions/{session_id}/items", response_model=InventoryItem)
async def add_item_to_inventory(
    session_id: int,
    request: AddItemRequest,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Add an item to inventory or increase quantity if it exists"""
    game_session = await _get_owned_session(session_id, user, game_session_service)

    updated_flags = InventoryService.add_item(
        game_session.flags,
        request.item_id,
        request.name,
        request.quantity,
        request.metadata
    )

    # Update session via service (handles version increment)
    await game_session_service.update_session(
        session_id=session_id,
        flags=updated_flags,
    )

    # Create event for inventory mutation
    await game_session_service.create_event(
        session_id=session_id,
        action="inventory_add",
        diff={"item_id": request.item_id, "quantity": request.quantity},
    )

    item = InventoryService.get_item(updated_flags, request.item_id)
    return item


@router.delete("/sessions/{session_id}/items/{item_id}", response_model=MessageResponse)
async def remove_item_from_inventory(
    session_id: int,
    item_id: str,
    request: RemoveItemRequest,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Remove quantity of an item from inventory"""
    game_session = await _get_owned_session(session_id, user, game_session_service)

    try:
        updated_flags = InventoryService.remove_item(
            game_session.flags,
            item_id,
            request.quantity
        )

        # Update session via service
        await game_session_service.update_session(
            session_id=session_id,
            flags=updated_flags,
        )

        # Create event for inventory mutation
        await game_session_service.create_event(
            session_id=session_id,
            action="inventory_remove",
            diff={"item_id": item_id, "quantity": request.quantity},
        )

        return MessageResponse(message=f"Removed {request.quantity}x {item_id} from inventory")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/sessions/{session_id}/items/{item_id}", response_model=InventoryItem)
async def update_inventory_item(
    session_id: int,
    item_id: str,
    request: UpdateItemRequest,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Update item properties"""
    game_session = await _get_owned_session(session_id, user, game_session_service)

    try:
        updated_flags = InventoryService.update_item(
            game_session.flags,
            item_id,
            request.name,
            request.quantity,
            request.metadata
        )

        # Update session via service
        await game_session_service.update_session(
            session_id=session_id,
            flags=updated_flags,
        )

        # Create event for inventory mutation
        diff = {"item_id": item_id}
        if request.name is not None:
            diff["name"] = request.name
        if request.quantity is not None:
            diff["quantity"] = request.quantity

        await game_session_service.create_event(
            session_id=session_id,
            action="inventory_update",
            diff=diff,
        )

        item = InventoryService.get_item(updated_flags, item_id)
        return item
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/sessions/{session_id}/clear", response_model=MessageResponse)
async def clear_inventory(
    session_id: int,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Clear all items from inventory"""
    game_session = await _get_owned_session(session_id, user, game_session_service)

    # Get count before clearing for diff
    item_count = InventoryService.get_item_count(game_session.flags)

    updated_flags = InventoryService.clear_inventory(game_session.flags)

    # Update session via service
    await game_session_service.update_session(
        session_id=session_id,
        flags=updated_flags,
    )

    # Create event for inventory clear
    await game_session_service.create_event(
        session_id=session_id,
        action="inventory_clear",
        diff={"items_cleared": item_count},
    )

    return MessageResponse(message="Inventory cleared")


@router.get("/sessions/{session_id}/stats", response_model=InventoryStatsResponse)
async def get_inventory_stats(
    session_id: int,
    user: CurrentUser,
    game_session_service: GameSessionSvc,
):
    """Get inventory statistics"""
    game_session = await _get_owned_session(session_id, user, game_session_service)

    item_count = InventoryService.get_item_count(game_session.flags)
    total_quantity = InventoryService.get_total_quantity(game_session.flags)

    return InventoryStatsResponse(
        unique_items=item_count,
        total_quantity=total_quantity,
    )
