"""
Inventory service for managing player inventory and items.

Compatibility:
- Canonical shape: flags["inventory"]["items"] = [{id, name, quantity, metadata}, ...]
- Legacy accepted:
  - flags["inventory"] = [{itemId|id, quantity|qty, ...}, ...]
  - flags["inventory"] = {"item_id": quantity, ...}

Writes are normalized back to canonical shape.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class InventoryItem(BaseModel):
    """A single item in the player's inventory"""
    id: str
    name: str
    quantity: int = 1
    metadata: Dict[str, Any] = Field(default_factory=dict)


def _coerce_quantity(value: Any, default: int = 1) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return max(0, int(value))
    return default


def _normalize_item(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None

    item_id_raw = raw.get("id", raw.get("itemId"))
    if not isinstance(item_id_raw, str) or not item_id_raw.strip():
        return None
    item_id = item_id_raw.strip()

    quantity = _coerce_quantity(raw.get("quantity", raw.get("qty")), default=1)
    name_raw = raw.get("name")
    name = name_raw.strip() if isinstance(name_raw, str) and name_raw.strip() else item_id

    metadata_raw = raw.get("metadata")
    metadata = metadata_raw if isinstance(metadata_raw, dict) else {}

    return {
        "id": item_id,
        "name": name,
        "quantity": quantity,
        "metadata": metadata,
    }


def _extract_items(session_flags: Dict[str, Any]) -> List[Dict[str, Any]]:
    inventory = session_flags.get("inventory")
    raw_items: List[Any] = []

    if isinstance(inventory, dict):
        if isinstance(inventory.get("items"), list):
            raw_items = inventory["items"]
        else:
            # Legacy map shape: {"apple": 2, "bread": 1}
            for key, value in inventory.items():
                if key == "items":
                    continue
                if isinstance(value, (int, float)):
                    raw_items.append({"id": key, "quantity": value})
    elif isinstance(inventory, list):
        raw_items = inventory

    normalized: List[Dict[str, Any]] = []
    for raw in raw_items:
        item = _normalize_item(raw)
        if item is not None:
            normalized.append(item)
    return normalized


def _write_items(session_flags: Dict[str, Any], items: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Keep compatibility aliases to avoid breaking legacy consumers.
    canonical_items = []
    for item in items:
        canonical_items.append(
            {
                "id": item["id"],
                "itemId": item["id"],
                "name": item["name"],
                "quantity": item["quantity"],
                "qty": item["quantity"],
                "metadata": item.get("metadata", {}),
            }
        )

    session_flags["inventory"] = {"items": canonical_items}
    return session_flags


class InventoryService:
    """Service for managing player inventory"""

    @staticmethod
    def get_inventory(session_flags: Dict[str, Any]) -> List[InventoryItem]:
        """Get all items from inventory"""
        items_data = _extract_items(session_flags)
        return [InventoryItem(**item_data) for item_data in items_data]

    @staticmethod
    def get_item(session_flags: Dict[str, Any], item_id: str) -> Optional[InventoryItem]:
        """Get a specific item from inventory"""
        for item_data in _extract_items(session_flags):
            if item_data.get("id") == item_id:
                return InventoryItem(**item_data)
        return None

    @staticmethod
    def add_item(
        session_flags: Dict[str, Any],
        item_id: str,
        name: Optional[str] = None,
        quantity: int = 1,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Add an item to inventory or increase quantity if it exists."""
        items = _extract_items(session_flags)
        delta = max(0, _coerce_quantity(quantity, default=1))

        for item in items:
            if item.get("id") == item_id:
                item["quantity"] = max(0, item.get("quantity", 0) + delta)
                if name:
                    item["name"] = name
                if metadata:
                    current_meta = item.get("metadata", {})
                    if not isinstance(current_meta, dict):
                        current_meta = {}
                    current_meta.update(metadata)
                    item["metadata"] = current_meta
                return _write_items(session_flags, items)

        items.append(
            {
                "id": item_id,
                "name": name or item_id,
                "quantity": delta,
                "metadata": metadata or {},
            }
        )
        return _write_items(session_flags, items)

    @staticmethod
    def remove_item(
        session_flags: Dict[str, Any],
        item_id: str,
        quantity: int = 1
    ) -> Dict[str, Any]:
        """Remove quantity of an item from inventory."""
        items = _extract_items(session_flags)
        delta = max(0, _coerce_quantity(quantity, default=1))

        for idx, item in enumerate(items):
            if item.get("id") != item_id:
                continue

            current_quantity = max(0, _coerce_quantity(item.get("quantity"), default=0))
            if delta >= current_quantity:
                items.pop(idx)
            else:
                item["quantity"] = current_quantity - delta
            return _write_items(session_flags, items)

        raise ValueError(f"Item {item_id} not found in inventory")

    @staticmethod
    def update_item(
        session_flags: Dict[str, Any],
        item_id: str,
        name: Optional[str] = None,
        quantity: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Update item properties."""
        items = _extract_items(session_flags)
        for item in items:
            if item.get("id") != item_id:
                continue

            if name is not None:
                item["name"] = name
            if quantity is not None:
                item["quantity"] = max(0, _coerce_quantity(quantity, default=0))
            if metadata is not None:
                item["metadata"] = metadata

            return _write_items(session_flags, items)

        raise ValueError(f"Item {item_id} not found in inventory")

    @staticmethod
    def clear_inventory(session_flags: Dict[str, Any]) -> Dict[str, Any]:
        """Clear all items from inventory."""
        return _write_items(session_flags, [])

    @staticmethod
    def get_item_count(session_flags: Dict[str, Any]) -> int:
        """Get total number of unique items."""
        return len(_extract_items(session_flags))

    @staticmethod
    def get_total_quantity(session_flags: Dict[str, Any]) -> int:
        """Get total quantity of all items combined."""
        return sum(item.get("quantity", 0) for item in _extract_items(session_flags))
