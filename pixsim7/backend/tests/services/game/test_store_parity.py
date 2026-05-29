"""Python side of the TS<->Py store parity suite.

Loads ``tests/fixtures/store_parity_fixtures.json`` (shared with the TS test
at ``packages/game/engine/src/__tests__/storeParity.test.ts``) and runs each
scenario through the backend store. Both sides assert against the same facts;
the same fixture file is the single source of truth for the parity contract.
"""
import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from pixsim7.backend.main.services.game.game_object_store import (
    get_session_game_object_store,
    list_session_game_objects,
    remove_session_game_objects,
    upsert_session_game_objects,
)

# pixsim7/backend/tests/services/game/test_store_parity.py -> repo root is parents[5]
FIXTURE_PATH = (
    Path(__file__).resolve().parents[5]
    / "tests"
    / "fixtures"
    / "store_parity_fixtures.json"
)


def _load_scenarios() -> List[Dict[str, Any]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))["scenarios"]


def _execute(operations: List[Dict[str, Any]], flags: Dict[str, Any], world_id: Any) -> None:
    for op in operations:
        kind = op["op"]
        if kind == "upsert":
            upsert_session_game_objects(flags, world_id, op["objects"])
        elif kind == "remove":
            remove_session_game_objects(flags, world_id, op["refs"])
        else:
            raise ValueError(f"Unknown parity op: {kind!r}")


@pytest.mark.parametrize("scenario", _load_scenarios(), ids=lambda s: s["name"])
def test_store_parity_scenario(scenario: Dict[str, Any]) -> None:
    flags = json.loads(json.dumps(scenario["initial_flags"]))  # deep copy
    world_id = scenario["world_id"]

    _execute(scenario["operations"], flags, world_id)

    expect = scenario["expect"]

    # Canonical store keys (sorted).
    store = get_session_game_object_store(flags, world_id)
    actual_refs = sorted(store["objects"].keys())
    assert actual_refs == sorted(expect.get("canonical_refs", []))

    # Items projection.
    if "items" in expect:
        items = list_session_game_objects(flags, world_id, kind="item")
        items_by_ref = {i.get("ref"): i for i in items}
        expected_refs = [ei["ref"] for ei in expect["items"]]
        assert sorted(items_by_ref.keys()) == sorted(expected_refs)
        for ei in expect["items"]:
            actual = items_by_ref[ei["ref"]]
            if "name" in ei:
                assert actual["name"] == ei["name"]
            if "quantity" in ei:
                assert (actual.get("itemData") or {}).get("quantity") == ei["quantity"]

    # Temporary flags.inventory mirror.
    if "mirror_items" in expect:
        mirror = (flags.get("inventory") or {}).get("items") or []
        mirror_by_id = {m.get("id"): m for m in mirror}
        expected_ids = {em["id"] for em in expect["mirror_items"]}
        assert set(mirror_by_id.keys()) == expected_ids
        for em in expect["mirror_items"]:
            actual = mirror_by_id[em["id"]]
            for key, value in em.items():
                if key == "id":
                    continue
                assert actual.get(key) == value, f"mirror[{em['id']}].{key}: expected {value!r}, got {actual.get(key)!r}"

    # NPCs projection.
    if "npcs" in expect:
        npcs = list_session_game_objects(flags, world_id, kind="npc")
        npcs_by_ref = {n.get("ref"): n for n in npcs}
        expected_refs = [en["ref"] for en in expect["npcs"]]
        assert sorted(npcs_by_ref.keys()) == sorted(expected_refs)
        for en in expect["npcs"]:
            actual = npcs_by_ref[en["ref"]]
            if "name" in en:
                assert actual["name"] == en["name"]
            if "role" in en:
                assert (actual.get("npcData") or {}).get("role") == en["role"]
            if "components_by_type" in en:
                components = actual.get("components") or []
                by_type = {c.get("type"): c.get("data") for c in components if isinstance(c, dict)}
                for ctype, expected_data in en["components_by_type"].items():
                    assert ctype in by_type, f"npc {en['ref']} missing component {ctype}"
                    for key, value in expected_data.items():
                        assert by_type[ctype].get(key) == value, (
                            f"npc {en['ref']} component {ctype}.{key}: "
                            f"expected {value!r}, got {by_type[ctype].get(key)!r}"
                        )
