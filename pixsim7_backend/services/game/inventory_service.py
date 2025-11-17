"""
Inventory service for managing player inventory and items.

Inventory is stored in GameSession.flags under the 'inventory' namespace.
Format: flags['inventory']['items'] = [{ id, name, quantity, metadata }, ...]
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel


class InventoryItem(BaseModel):
    """A single item in the player's inventory"""
    id: str
    name: str
    quantity: int = 1
    metadata: Dict[str, Any] = {}


class InventoryService:
    """Service for managing player inventory"""

    @staticmethod
    def get_inventory(session_flags: Dict[str, Any]) -> List[InventoryItem]:
        """Get all items from inventory"""
        inventory_data = session_flags.get("inventory", {})
        items_data = inventory_data.get("items", [])

        items = []
        for item_data in items_data:
            items.append(InventoryItem(**item_data))

        return items

    @staticmethod
    def get_item(session_flags: Dict[str, Any], item_id: str) -> Optional[InventoryItem]:
        """Get a specific item from inventory"""
        inventory_data = session_flags.get("inventory", {})
        items_data = inventory_data.get("items", [])

        for item_data in items_data:
            if item_data.get("id") == item_id:
                return InventoryItem(**item_data)

        return None

    @staticmethod
    def add_item(
        session_flags: Dict[str, Any],
        item_id: str,
        name: str,
        quantity: int = 1,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Add an item to inventory or increase quantity if it exists"""
        if "inventory" not in session_flags:
            session_flags["inventory"] = {"items": []}

        if "items" not in session_flags["inventory"]:
            session_flags["inventory"]["items"] = []

        items = session_flags["inventory"]["items"]

        # Check if item already exists
        for item in items:
            if item.get("id") == item_id:
                item["quantity"] = item.get("quantity", 0) + quantity
                return session_flags

        # Add new item
        new_item = InventoryItem(
            id=item_id,
            name=name,
            quantity=quantity,
            metadata=metadata or {}
        )
        items.append(new_item.dict())

        return session_flags

    @staticmethod
    def remove_item(
        session_flags: Dict[str, Any],
        item_id: str,
        quantity: int = 1
    ) -> Dict[str, Any]:
        """Remove quantity of an item from inventory"""
        if "inventory" not in session_flags or "items" not in session_flags["inventory"]:
            raise ValueError(f"Item {item_id} not found in inventory")

        items = session_flags["inventory"]["items"]

        for i, item in enumerate(items):
            if item.get("id") == item_id:
                current_quantity = item.get("quantity", 0)
                if quantity >= current_quantity:
                    # Remove item completely
                    items.pop(i)
                else:
                    # Reduce quantity
                    item["quantity"] = current_quantity - quantity
                return session_flags

        raise ValueError(f"Item {item_id} not found in inventory")

    @staticmethod
    def update_item(
        session_flags: Dict[str, Any],
        item_id: str,
        name: Optional[str] = None,
        quantity: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Update item properties"""
        if "inventory" not in session_flags or "items" not in session_flags["inventory"]:
            raise ValueError(f"Item {item_id} not found in inventory")

        items = session_flags["inventory"]["items"]

        for item in items:
            if item.get("id") == item_id:
                if name is not None:
                    item["name"] = name
                if quantity is not None:
                    item["quantity"] = quantity
                if metadata is not None:
                    item["metadata"] = metadata
                return session_flags

        raise ValueError(f"Item {item_id} not found in inventory")

    @staticmethod
    def clear_inventory(session_flags: Dict[str, Any]) -> Dict[str, Any]:
        """Clear all items from inventory"""
        session_flags["inventory"] = {"items": []}
        return session_flags

    @staticmethod
    def get_item_count(session_flags: Dict[str, Any]) -> int:
        """Get total number of unique items"""
        inventory_data = session_flags.get("inventory", {})
        items = inventory_data.get("items", [])
        return len(items)

    @staticmethod
    def get_total_quantity(session_flags: Dict[str, Any]) -> int:
        """Get total quantity of all items combined"""
        inventory_data = session_flags.get("inventory", {})
        items = inventory_data.get("items", [])
        return sum(item.get("quantity", 0) for item in items)
