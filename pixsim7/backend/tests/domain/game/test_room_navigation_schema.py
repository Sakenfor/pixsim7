from __future__ import annotations

from pixsim7.backend.main.domain.game.schemas.room_navigation import (
    ROOM_NAVIGATION_META_KEY,
    normalize_location_meta_room_navigation,
    validate_room_navigation_payload,
)


def _valid_room_navigation_payload() -> dict:
    return {
        "version": 1,
        "room_id": "room.alpha",
        "checkpoints": [
            {
                "id": "cp_a",
                "label": "Checkpoint A",
                "view": {
                    "kind": "cylindrical_pano",
                    "pano_asset_id": "asset.pano.a",
                },
                "hotspots": [],
            },
            {
                "id": "cp_b",
                "label": "Checkpoint B",
                "view": {
                    "kind": "cylindrical_pano",
                    "pano_asset_id": "asset.pano.b",
                },
                "hotspots": [],
            },
        ],
        "edges": [
            {
                "id": "edge_ab",
                "from_checkpoint_id": "cp_a",
                "to_checkpoint_id": "cp_b",
                "move_kind": "forward",
            }
        ],
        "start_checkpoint_id": "cp_a",
    }


def test_validate_room_navigation_payload_rejects_broken_edge_reference() -> None:
    payload = _valid_room_navigation_payload()
    payload["edges"][0]["to_checkpoint_id"] = "cp_missing"

    parsed, issues = validate_room_navigation_payload(payload)

    assert parsed is None
    assert any(
        issue.path == f"{ROOM_NAVIGATION_META_KEY}.edges[0].to_checkpoint_id"
        and "does not exist in checkpoints" in issue.message
        for issue in issues
    )


def test_normalize_location_meta_room_navigation_migrates_legacy_key() -> None:
    payload = _valid_room_navigation_payload()
    raw_meta = {
        "roomNavigation": payload,
        "npcSlots2d": [],
    }

    normalized_meta, issues, migration_notes = normalize_location_meta_room_navigation(raw_meta)

    assert not issues
    assert ROOM_NAVIGATION_META_KEY in normalized_meta
    assert "roomNavigation" not in normalized_meta
    assert normalized_meta["npcSlots2d"] == []
    assert migration_notes


def test_normalize_location_meta_room_navigation_rejects_invalid_view_config() -> None:
    payload = _valid_room_navigation_payload()
    payload["checkpoints"][0]["view"] = {"kind": "cylindrical_pano"}

    normalized_meta, issues, _ = normalize_location_meta_room_navigation(
        {ROOM_NAVIGATION_META_KEY: payload}
    )

    assert ROOM_NAVIGATION_META_KEY in normalized_meta
    assert issues
    assert any(
        issue.path == f"{ROOM_NAVIGATION_META_KEY}.checkpoints[0].view.pano_asset_id"
        for issue in issues
    )
