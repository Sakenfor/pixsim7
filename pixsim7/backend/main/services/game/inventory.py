"""
Inventory service backed by the canonical GameObject store.

Reads project item-kind GameObjects from ``session.flags["gameObjects"]``
(legacy ``flags.inventory`` is transparently hydrated). Writes go through
``upsert_session_game_objects`` / ``remove_session_game_objects`` on the store,
which keeps the TEMPORARY ``flags.inventory.items`` mirror in sync until the
cutover removes it on both sides
(plan ``backend-canonical-gameobject-adoption`` checkpoint
``cutover-drop-legacy``).

REST contract preserved: methods accept the same ``session_flags`` dict and
return the same ``InventoryItem`` shape ``{id, name, quantity, metadata}``.

The optional ``world_id`` argument is forwarded to the store's transform
fallback. Inventory items have no spatial transform of their own, so callers
that don't have a world handy can omit it (defaults to 0).
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from pixsim7.backend.main.services.game.game_object_store import (
    build_inventory_item_object,
    get_session_game_object,
    list_session_game_objects,
    remove_session_game_objects,
    upsert_session_game_objects,
)


class InventoryItem(BaseModel):
    """A single item in the player's inventory (REST contract)."""

    id: str
    name: str
    quantity: int = 1
    metadata: Dict[str, Any] = Field(default_factory=dict)


# Keys reserved by the canonical itemData payload — everything else folded into
# itemData is treated as caller metadata and round-trips through the REST view.
_RESERVED_ITEM_DATA_KEYS = {"itemDefId", "quantity"}


def _coerce_quantity(value: Any, default: int = 1) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return max(0, int(value))
    return default


def _split_item_data(item_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(item_data, dict):
        return {}
    return {k: v for k, v in item_data.items() if k not in _RESERVED_ITEM_DATA_KEYS}


def _item_to_inventory_item(obj: Dict[str, Any]) -> InventoryItem:
    item_data = obj.get("itemData") or {}
    quantity = _coerce_quantity(item_data.get("quantity", 1), default=1)
    metadata = _split_item_data(item_data)
    return InventoryItem(
        id=str(obj.get("id") or ""),
        name=obj.get("name") or str(obj.get("id") or ""),
        quantity=quantity,
        metadata=metadata,
    )


def _list_items(session_flags: Dict[str, Any], world_id: Optional[int]) -> List[Dict[str, Any]]:
    return list_session_game_objects(session_flags, world_id, kind="item")


def _item_ref(item_id: str) -> str:
    return f"item:{item_id}"


class InventoryService:
    """Static facade over the canonical GameObject inventory."""

    @staticmethod
    def get_inventory(
        session_flags: Dict[str, Any], world_id: Optional[int] = None
    ) -> List[InventoryItem]:
        """List all canonical item objects as REST inventory items."""
        return [_item_to_inventory_item(obj) for obj in _list_items(session_flags, world_id)]

    @staticmethod
    def get_item(
        session_flags: Dict[str, Any],
        item_id: str,
        world_id: Optional[int] = None,
    ) -> Optional[InventoryItem]:
        obj = get_session_game_object(session_flags, world_id, _item_ref(item_id))
        return _item_to_inventory_item(obj) if obj else None

    @staticmethod
    def add_item(
        session_flags: Dict[str, Any],
        item_id: str,
        name: Optional[str] = None,
        quantity: int = 1,
        metadata: Optional[Dict[str, Any]] = None,
        world_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Add an item, or increase quantity if it already exists.

        Metadata is merged into the existing item's metadata (new keys win, like
        the prior dict-update behaviour). Name is updated when a non-empty value
        is provided.
        """
        delta = max(0, _coerce_quantity(quantity, default=1))
        existing = get_session_game_object(session_flags, world_id, _item_ref(item_id))

        if existing:
            existing_data = existing.get("itemData") or {}
            current_qty = _coerce_quantity(existing_data.get("quantity"), default=0)
            new_qty = max(0, current_qty + delta)
            merged_meta = _split_item_data(existing_data)
            if metadata:
                merged_meta.update(metadata)
            resolved_name = name if (isinstance(name, str) and name.strip()) else (existing.get("name") or item_id)
        else:
            new_qty = delta
            merged_meta = dict(metadata) if isinstance(metadata, dict) else {}
            resolved_name = name if (isinstance(name, str) and name.strip()) else item_id

        return upsert_session_game_objects(
            session_flags,
            world_id,
            [
                build_inventory_item_object(
                    world_id,
                    item_id,
                    new_qty,
                    {"name": resolved_name, **merged_meta},
                )
            ],
        )

    @staticmethod
    def remove_item(
        session_flags: Dict[str, Any],
        item_id: str,
        quantity: int = 1,
        world_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Remove quantity of an item. Raises ``ValueError`` when absent."""
        delta = max(0, _coerce_quantity(quantity, default=1))
        existing = get_session_game_object(session_flags, world_id, _item_ref(item_id))
        if not existing:
            raise ValueError(f"Item {item_id} not found in inventory")

        existing_data = existing.get("itemData") or {}
        current_qty = _coerce_quantity(existing_data.get("quantity"), default=0)

        if delta >= current_qty:
            return remove_session_game_objects(session_flags, world_id, [_item_ref(item_id)])

        preserved_meta = _split_item_data(existing_data)
        return upsert_session_game_objects(
            session_flags,
            world_id,
            [
                build_inventory_item_object(
                    world_id,
                    item_id,
                    current_qty - delta,
                    {"name": existing.get("name") or item_id, **preserved_meta},
                )
            ],
        )

    @staticmethod
    def update_item(
        session_flags: Dict[str, Any],
        item_id: str,
        name: Optional[str] = None,
        quantity: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        world_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Update fields on an existing item. Raises ``ValueError`` when absent."""
        existing = get_session_game_object(session_flags, world_id, _item_ref(item_id))
        if not existing:
            raise ValueError(f"Item {item_id} not found in inventory")

        existing_data = existing.get("itemData") or {}
        current_qty = _coerce_quantity(existing_data.get("quantity"), default=0)
        current_meta = _split_item_data(existing_data)

        new_qty = (
            max(0, _coerce_quantity(quantity, default=0)) if quantity is not None else current_qty
        )
        resolved_name = name if name is not None else (existing.get("name") or item_id)
        resolved_meta = metadata if metadata is not None else current_meta

        return upsert_session_game_objects(
            session_flags,
            world_id,
            [
                build_inventory_item_object(
                    world_id,
                    item_id,
                    new_qty,
                    {"name": resolved_name, **resolved_meta},
                )
            ],
        )

    @staticmethod
    def clear_inventory(
        session_flags: Dict[str, Any], world_id: Optional[int] = None
    ) -> Dict[str, Any]:
        items = _list_items(session_flags, world_id)
        refs = [obj.get("ref") or _item_ref(str(obj.get("id"))) for obj in items]
        if not refs:
            # Still ensure the mirror is consistent (no-op if no items existed).
            return session_flags
        return remove_session_game_objects(session_flags, world_id, refs)

    @staticmethod
    def get_item_count(
        session_flags: Dict[str, Any], world_id: Optional[int] = None
    ) -> int:
        return len(_list_items(session_flags, world_id))

    @staticmethod
    def get_total_quantity(
        session_flags: Dict[str, Any], world_id: Optional[int] = None
    ) -> int:
        return sum(
            _coerce_quantity((obj.get("itemData") or {}).get("quantity", 0), default=0)
            for obj in _list_items(session_flags, world_id)
        )
