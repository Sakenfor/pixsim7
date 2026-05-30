"""Unit tests for the backend runtime GameObject store (port of the TS engine
store). Covers normalize/read/list/get/upsert/remove, legacy hydration, the
temporary inventory mirror, and the convenience accessors."""
from pixsim7.backend.main.services.game.game_object_store import (
    GAME_OBJECT_STORE_SCHEMA_VERSION,
    build_inventory_item_object,
    get_session_game_object,
    get_session_game_object_store,
    has_capability,
    item_quantity,
    list_session_game_objects,
    remove_session_game_objects,
    to_game_object_ref,
    upsert_session_game_objects,
)

WORLD_ID = 1


def test_empty_flags_returns_empty_store():
    store = get_session_game_object_store({}, WORLD_ID)
    assert store["schemaVersion"] == GAME_OBJECT_STORE_SCHEMA_VERSION
    assert store["objects"] == {}


def test_to_game_object_ref_string_and_numeric():
    assert to_game_object_ref("item", "flower") == "item:flower"
    assert to_game_object_ref("npc", 12) == "npc:12"
    assert to_game_object_ref("npc", 12.0) == "npc:12"


def test_upsert_item_writes_canonical():
    flags: dict = {}
    upsert_session_game_objects(
        flags, WORLD_ID, [build_inventory_item_object(WORLD_ID, "flower", 3)]
    )

    obj = flags["gameObjects"]["objects"]["item:flower"]
    assert obj["kind"] == "item"
    assert obj["itemData"]["quantity"] == 3
    assert obj["ref"] == "item:flower"


def test_get_by_ref_and_by_lookup():
    flags: dict = {}
    upsert_session_game_objects(
        flags, WORLD_ID, [build_inventory_item_object(WORLD_ID, "key", 1)]
    )
    by_ref = get_session_game_object(flags, WORLD_ID, "item:key")
    by_lookup = get_session_game_object(flags, WORLD_ID, {"kind": "item", "id": "key"})
    assert by_ref is not None
    assert by_ref == by_lookup
    assert get_session_game_object(flags, WORLD_ID, "item:missing") is None


def test_remove_deletes_canonical_object():
    flags: dict = {}
    upsert_session_game_objects(
        flags, WORLD_ID, [build_inventory_item_object(WORLD_ID, "flower", 1)]
    )
    remove_session_game_objects(flags, WORLD_ID, ["item:flower"])

    assert "item:flower" not in flags["gameObjects"]["objects"]




def test_list_filtering_by_kind_and_capability():
    flags: dict = {}
    upsert_session_game_objects(
        flags,
        WORLD_ID,
        [
            build_inventory_item_object(WORLD_ID, "flower", 1),
            {
                "kind": "prop",
                "id": "door",
                "name": "Door",
                "capabilities": [{"id": "openable", "enabled": True}],
            },
        ],
    )
    items = list_session_game_objects(flags, WORLD_ID, kind="item")
    assert {o["id"] for o in items} == {"flower"}

    openable = list_session_game_objects(flags, WORLD_ID, capability="openable")
    assert {o["id"] for o in openable} == {"door"}


def test_build_inventory_item_object_folds_metadata():
    obj = build_inventory_item_object(WORLD_ID, "potion", 2, {"name": "Red Potion", "rarity": "rare"})
    assert obj["name"] == "Red Potion"
    assert obj["itemData"]["itemDefId"] == "potion"
    assert obj["itemData"]["quantity"] == 2
    assert obj["itemData"]["rarity"] == "rare"


def test_upsert_normalizes_missing_ref_and_transform():
    flags: dict = {}
    upsert_session_game_objects(flags, WORLD_ID, [{"kind": "item", "id": "gem", "name": "Gem", "itemData": {"itemDefId": "gem", "quantity": 4}}])
    gem = flags["gameObjects"]["objects"]["item:gem"]
    assert gem["ref"] == "item:gem"
    assert gem["runtimeKind"] == "item"
    assert gem["transform"]["worldId"] == WORLD_ID
