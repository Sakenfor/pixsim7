"""
Game inventory management endpoints
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlmodel import Session

from pixsim7_backend.infrastructure.database.core import get_session
from pixsim7_backend.domain.game.models import GameSession
from pixsim7_backend.services.game.inventory_service import InventoryService, InventoryItem

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


@router.get("/sessions/{session_id}/items", response_model=List[InventoryItem])
async def list_inventory_items(
    session_id: int,
    db: Session = Depends(get_session)
):
    """List all items in a game session's inventory"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    items = InventoryService.get_inventory(game_session.flags)
    return items


@router.get("/sessions/{session_id}/items/{item_id}", response_model=InventoryItem)
async def get_inventory_item(
    session_id: int,
    item_id: str,
    db: Session = Depends(get_session)
):
    """Get a specific item from inventory"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    item = InventoryService.get_item(game_session.flags, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found in inventory")

    return item


@router.post("/sessions/{session_id}/items", response_model=InventoryItem)
async def add_item_to_inventory(
    session_id: int,
    request: AddItemRequest,
    db: Session = Depends(get_session)
):
    """Add an item to inventory or increase quantity if it exists"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    updated_flags = InventoryService.add_item(
        game_session.flags,
        request.item_id,
        request.name,
        request.quantity,
        request.metadata
    )

    game_session.flags = updated_flags
    db.add(game_session)
    db.commit()
    db.refresh(game_session)

    item = InventoryService.get_item(game_session.flags, request.item_id)
    return item


@router.delete("/sessions/{session_id}/items/{item_id}", response_model=Dict[str, str])
async def remove_item_from_inventory(
    session_id: int,
    item_id: str,
    request: RemoveItemRequest,
    db: Session = Depends(get_session)
):
    """Remove quantity of an item from inventory"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    try:
        updated_flags = InventoryService.remove_item(
            game_session.flags,
            item_id,
            request.quantity
        )

        game_session.flags = updated_flags
        db.add(game_session)
        db.commit()
        db.refresh(game_session)

        return {"message": f"Removed {request.quantity}x {item_id} from inventory"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/sessions/{session_id}/items/{item_id}", response_model=InventoryItem)
async def update_inventory_item(
    session_id: int,
    item_id: str,
    request: UpdateItemRequest,
    db: Session = Depends(get_session)
):
    """Update item properties"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    try:
        updated_flags = InventoryService.update_item(
            game_session.flags,
            item_id,
            request.name,
            request.quantity,
            request.metadata
        )

        game_session.flags = updated_flags
        db.add(game_session)
        db.commit()
        db.refresh(game_session)

        item = InventoryService.get_item(game_session.flags, item_id)
        return item
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/sessions/{session_id}/clear")
async def clear_inventory(
    session_id: int,
    db: Session = Depends(get_session)
):
    """Clear all items from inventory"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    updated_flags = InventoryService.clear_inventory(game_session.flags)

    game_session.flags = updated_flags
    db.add(game_session)
    db.commit()

    return {"message": "Inventory cleared"}


@router.get("/sessions/{session_id}/stats")
async def get_inventory_stats(
    session_id: int,
    db: Session = Depends(get_session)
):
    """Get inventory statistics"""
    game_session = db.get(GameSession, session_id)
    if not game_session:
        raise HTTPException(status_code=404, detail="Game session not found")

    item_count = InventoryService.get_item_count(game_session.flags)
    total_quantity = InventoryService.get_total_quantity(game_session.flags)

    return {
        "unique_items": item_count,
        "total_quantity": total_quantity,
    }
