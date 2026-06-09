from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))

try:
    from tools.backfill_npc_slots_to_placements import (
        MigrationStats,
        migrate_location_meta,
        slot_to_placement,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="tool import not available")
class TestSlotToPlacement:
    def test_basic_conversion(self):
        placement = slot_to_placement({"id": "s1", "x": 0.25, "y": 0.75})
        assert placement == {
            "id": "s1",
            "entity_type": "npc",
            "position": {"x": 0.25, "y": 0.75},
            "source": "import",
        }

    def test_carries_roles_depth_anchor(self):
        placement = slot_to_placement(
            {
                "id": "s1",
                "x": 0.1,
                "y": 0.2,
                "depth": 0.6,
                "anchor": "floor",
                "roles": ["guard"],
            }
        )
        assert placement["position"] == {"x": 0.1, "y": 0.2, "depth": 0.6, "anchor": "floor"}
        assert placement["roles"] == ["guard"]

    def test_extra_fields_preserved_in_meta(self):
        placement = slot_to_placement(
            {"id": "s1", "x": 0.1, "y": 0.2, "characterId": "char_7", "label": "Bob"}
        )
        assert placement["meta"] == {"characterId": "char_7", "label": "Bob"}

    @pytest.mark.parametrize(
        "slot",
        [
            {"x": 0.1, "y": 0.2},  # missing id
            {"id": "  ", "x": 0.1, "y": 0.2},  # blank id
            {"id": "s1", "x": "a", "y": 0.2},  # non-numeric
            {"id": "s1", "x": 2.0, "y": 0.2},  # out of range
            "not-a-dict",
        ],
    )
    def test_invalid_slots_return_none(self, slot):
        assert slot_to_placement(slot) is None

    def test_out_of_range_depth_is_dropped_not_fatal(self):
        placement = slot_to_placement({"id": "s1", "x": 0.1, "y": 0.2, "depth": 5})
        assert "depth" not in placement["position"]
        assert placement["id"] == "s1"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="tool import not available")
class TestMigrateLocationMeta:
    def test_no_slots_returns_none(self):
        stats = MigrationStats()
        assert migrate_location_meta({"label": "x"}, stats) is None
        assert migrate_location_meta({"npcSlots2d": []}, stats) is None
        assert stats.slots_migrated == 0

    def test_migrates_into_new_placements_list(self):
        stats = MigrationStats()
        meta = {"npcSlots2d": [{"id": "s1", "x": 0.5, "y": 0.5}], "label": "keep"}
        new_meta = migrate_location_meta(meta, stats)

        assert new_meta is not None
        assert new_meta["label"] == "keep"
        assert new_meta["npcSlots2d"] == [{"id": "s1", "x": 0.5, "y": 0.5}]  # left intact
        assert [p["id"] for p in new_meta["placements"]] == ["s1"]
        assert stats.slots_migrated == 1

    def test_does_not_mutate_input_meta(self):
        stats = MigrationStats()
        meta = {"npcSlots2d": [{"id": "s1", "x": 0.5, "y": 0.5}]}
        migrate_location_meta(meta, stats)
        assert "placements" not in meta  # original untouched

    def test_preserves_existing_placements(self):
        stats = MigrationStats()
        meta = {
            "npcSlots2d": [{"id": "s1", "x": 0.5, "y": 0.5}],
            "placements": [
                {"id": "h1", "entity_type": "hotspot", "position": {"x": 0.1, "y": 0.1}}
            ],
        }
        new_meta = migrate_location_meta(meta, stats)
        assert [p["id"] for p in new_meta["placements"]] == ["h1", "s1"]

    def test_idempotent_rerun_is_noop(self):
        stats1 = MigrationStats()
        meta = {"npcSlots2d": [{"id": "s1", "x": 0.5, "y": 0.5}]}
        once = migrate_location_meta(meta, stats1)

        stats2 = MigrationStats()
        twice = migrate_location_meta(once, stats2)
        assert twice is None
        assert stats2.slots_skipped_existing == 1
        assert stats2.slots_migrated == 0

    def test_collision_with_non_npc_is_skipped_and_reported(self):
        stats = MigrationStats()
        meta = {
            "npcSlots2d": [{"id": "dup", "x": 0.5, "y": 0.5}],
            "placements": [
                {"id": "dup", "entity_type": "hotspot", "position": {"x": 0.1, "y": 0.1}}
            ],
        }
        new_meta = migrate_location_meta(meta, stats)
        assert new_meta is None  # nothing added
        assert stats.slots_skipped_collision == 1
        assert len(stats.collisions) == 1

    def test_invalid_slot_counted_but_others_migrate(self):
        stats = MigrationStats()
        meta = {
            "npcSlots2d": [
                {"id": "good", "x": 0.5, "y": 0.5},
                {"x": 0.5, "y": 0.5},  # missing id
            ]
        }
        new_meta = migrate_location_meta(meta, stats, location_label="loc 1")
        assert [p["id"] for p in new_meta["placements"]] == ["good"]
        assert stats.slots_migrated == 1
        assert stats.slots_invalid == 1
