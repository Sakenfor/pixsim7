"""Tests for the canonical-store-backed InventoryService and the
apply_inventory_changes pipeline (checkpoint inventory-on-canonical)."""
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain.game.interactions.interaction_execution import (
    apply_inventory_changes,
)
from pixsim7.backend.main.domain.game.interactions.interactions import (
    InventoryChange,
    InventoryChanges,
)
from pixsim7.backend.main.services.game.inventory import InventoryItem, InventoryService

WORLD_ID = 1


def test_add_item_writes_canonical_and_mirror():
    flags: dict = {}
    InventoryService.add_item(flags, "flower", name="Flower", quantity=3, world_id=WORLD_ID)

    obj = flags["gameObjects"]["objects"]["item:flower"]
    assert obj["kind"] == "item"
    assert obj["itemData"]["quantity"] == 3
    assert obj["name"] == "Flower"

    mirror_item = next(i for i in flags["inventory"]["items"] if i["id"] == "flower")
    assert mirror_item["quantity"] == 3


def test_add_item_increments_existing_quantity():
    flags: dict = {}
    InventoryService.add_item(flags, "flower", quantity=2, world_id=WORLD_ID)
    InventoryService.add_item(flags, "flower", quantity=3, world_id=WORLD_ID)
    item = InventoryService.get_item(flags, "flower", world_id=WORLD_ID)
    assert item is not None
    assert item.quantity == 5


def test_metadata_round_trips_through_rest_view():
    flags: dict = {}
    InventoryService.add_item(
        flags,
        "potion",
        name="Red Potion",
        quantity=1,
        metadata={"rarity": "rare", "acquiredAt": 100},
        world_id=WORLD_ID,
    )
    item = InventoryService.get_item(flags, "potion", world_id=WORLD_ID)
    assert isinstance(item, InventoryItem)
    assert item.metadata.get("rarity") == "rare"
    assert item.metadata.get("acquiredAt") == 100
    # Reserved canonical-itemData keys must not leak into the REST metadata view.
    assert "itemDefId" not in item.metadata
    assert "quantity" not in item.metadata


def test_remove_partial_then_zero():
    flags: dict = {}
    InventoryService.add_item(flags, "flower", quantity=3, world_id=WORLD_ID)
    InventoryService.remove_item(flags, "flower", quantity=1, world_id=WORLD_ID)

    item = InventoryService.get_item(flags, "flower", world_id=WORLD_ID)
    assert item is not None and item.quantity == 2

    InventoryService.remove_item(flags, "flower", quantity=2, world_id=WORLD_ID)
    assert InventoryService.get_item(flags, "flower", world_id=WORLD_ID) is None
    assert "item:flower" not in flags["gameObjects"]["objects"]
    assert all(i["id"] != "flower" for i in flags["inventory"]["items"])


def test_remove_missing_raises_value_error():
    flags: dict = {}
    with pytest.raises(ValueError):
        InventoryService.remove_item(flags, "ghost", quantity=1, world_id=WORLD_ID)


def test_update_item_preserves_unspecified_fields():
    flags: dict = {}
    InventoryService.add_item(
        flags,
        "flower",
        name="Flower",
        quantity=3,
        metadata={"color": "red"},
        world_id=WORLD_ID,
    )
    InventoryService.update_item(flags, "flower", quantity=10, world_id=WORLD_ID)

    item = InventoryService.get_item(flags, "flower", world_id=WORLD_ID)
    assert item is not None
    assert item.quantity == 10
    assert item.name == "Flower"
    assert item.metadata.get("color") == "red"


def test_clear_inventory_removes_all_items_and_mirror():
    flags: dict = {}
    InventoryService.add_item(flags, "a", quantity=1, world_id=WORLD_ID)
    InventoryService.add_item(flags, "b", quantity=2, world_id=WORLD_ID)
    InventoryService.clear_inventory(flags, world_id=WORLD_ID)

    assert InventoryService.get_inventory(flags, WORLD_ID) == []
    assert flags["inventory"]["items"] == []


def test_stats_count_and_total_quantity():
    flags: dict = {}
    InventoryService.add_item(flags, "a", quantity=2, world_id=WORLD_ID)
    InventoryService.add_item(flags, "b", quantity=5, world_id=WORLD_ID)

    assert InventoryService.get_item_count(flags, WORLD_ID) == 2
    assert InventoryService.get_total_quantity(flags, WORLD_ID) == 7


def test_get_inventory_hydrates_legacy_flags_inventory():
    # Pre-migration data written by the old code path lives only in
    # flags.inventory; the store hydrates it transparently on read.
    flags = {"inventory": {"items": [{"id": "flower", "qty": 2, "name": "Old Flower"}]}}
    items = InventoryService.get_inventory(flags, WORLD_ID)
    assert len(items) == 1
    assert items[0].id == "flower"
    assert items[0].quantity == 2


@pytest.mark.asyncio
async def test_apply_inventory_changes_tags_acquired_at_for_new_items():
    session = SimpleNamespace(flags={}, world_id=WORLD_ID)
    changes = InventoryChanges(add=[InventoryChange(item_id="flower", quantity=2)])

    summary = await apply_inventory_changes(session, changes)

    assert summary.added == ["flower"]
    item = InventoryService.get_item(session.flags, "flower", world_id=WORLD_ID)
    assert item is not None
    assert item.quantity == 2
    assert "acquiredAt" in item.metadata


@pytest.mark.asyncio
async def test_apply_inventory_changes_does_not_reset_acquired_at_on_top_up():
    session = SimpleNamespace(flags={}, world_id=WORLD_ID)
    await apply_inventory_changes(
        session, InventoryChanges(add=[InventoryChange(item_id="flower", quantity=1)])
    )
    first_acquired = InventoryService.get_item(
        session.flags, "flower", world_id=WORLD_ID
    ).metadata["acquiredAt"]

    await apply_inventory_changes(
        session, InventoryChanges(add=[InventoryChange(item_id="flower", quantity=1)])
    )
    item = InventoryService.get_item(session.flags, "flower", world_id=WORLD_ID)
    assert item.quantity == 2
    assert item.metadata["acquiredAt"] == first_acquired


@pytest.mark.asyncio
async def test_apply_inventory_changes_silent_skip_on_missing_remove():
    session = SimpleNamespace(flags={}, world_id=WORLD_ID)
    summary = await apply_inventory_changes(
        session, InventoryChanges(remove=[InventoryChange(item_id="ghost", quantity=1)])
    )
    assert summary.removed is None
