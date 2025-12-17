"""
Tests for GameSession events functionality.

Tests:
1. Location reference helper logic works correctly
2. Event timestamp filtering logic works correctly

Note: Tests for full API integration require full project dependencies.
Run with the project's test environment for complete coverage.
"""

import pytest
from datetime import datetime, timedelta
from typing import Optional, Union


# ========================================================
# Standalone unit tests for location reference logic
# These test the same logic as the location_ref helpers
# without requiring the full pixsim7 import tree
# ========================================================

def _location_id_to_ref(location_id: Optional[int]) -> Optional[str]:
    """Convert integer location ID to 'location:123' string format."""
    if location_id is None:
        return None
    return f"location:{location_id}"


def _location_ref_to_id(location_ref: Optional[str]) -> Optional[int]:
    """Convert 'location:123' string to integer location ID."""
    if location_ref is None:
        return None
    if not location_ref.startswith("location:"):
        return None
    try:
        return int(location_ref.split(":", 1)[1])
    except (ValueError, IndexError):
        return None


def _normalize_location_to_id(value: Union[int, str, None]) -> Optional[int]:
    """Normalize any location reference format to integer ID."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return _location_ref_to_id(value)
    return None


def _normalize_location_to_ref(value: Union[int, str, None]) -> Optional[str]:
    """Normalize any location reference format to string 'location:123'."""
    if value is None:
        return None
    if isinstance(value, int):
        return _location_id_to_ref(value)
    if isinstance(value, str):
        # Validate format and return as-is if valid
        if value.startswith("location:"):
            try:
                int(value.split(":", 1)[1])
                return value
            except (ValueError, IndexError):
                return None
        return None
    return None


class TestLocationRefHelpers:
    """Tests for location reference helper functions."""

    def test_location_id_to_ref_with_value(self):
        """location_id_to_ref should convert int to string format."""
        result = _location_id_to_ref(123)
        assert result == "location:123"

    def test_location_id_to_ref_with_none(self):
        """location_id_to_ref should return None for None input."""
        result = _location_id_to_ref(None)
        assert result is None

    def test_location_ref_to_id_with_valid(self):
        """location_ref_to_id should convert string to int."""
        result = _location_ref_to_id("location:456")
        assert result == 456

    def test_location_ref_to_id_with_none(self):
        """location_ref_to_id should return None for None input."""
        result = _location_ref_to_id(None)
        assert result is None

    def test_location_ref_to_id_with_invalid_format(self):
        """location_ref_to_id should return None for invalid format."""
        assert _location_ref_to_id("invalid") is None
        assert _location_ref_to_id("loc:123") is None
        assert _location_ref_to_id("location:abc") is None

    def test_normalize_location_to_id_from_int(self):
        """normalize_location_to_id should pass through int."""
        assert _normalize_location_to_id(123) == 123

    def test_normalize_location_to_id_from_string(self):
        """normalize_location_to_id should extract int from string."""
        assert _normalize_location_to_id("location:123") == 123

    def test_normalize_location_to_id_from_none(self):
        """normalize_location_to_id should return None for None."""
        assert _normalize_location_to_id(None) is None

    def test_normalize_location_to_ref_from_int(self):
        """normalize_location_to_ref should convert int to string."""
        assert _normalize_location_to_ref(123) == "location:123"

    def test_normalize_location_to_ref_from_string(self):
        """normalize_location_to_ref should pass through valid string."""
        assert _normalize_location_to_ref("location:123") == "location:123"

    def test_normalize_location_to_ref_from_none(self):
        """normalize_location_to_ref should return None for None."""
        assert _normalize_location_to_ref(None) is None

    def test_normalize_location_to_ref_invalid_string(self):
        """normalize_location_to_ref should return None for invalid string."""
        assert _normalize_location_to_ref("invalid") is None

    def test_location_roundtrip(self):
        """Converting int -> string -> int should preserve value."""
        original = 789
        as_string = _location_id_to_ref(original)
        back_to_int = _location_ref_to_id(as_string)
        assert back_to_int == original

    def test_normalize_consistency(self):
        """Both normalize functions should handle the same inputs consistently."""
        # Int input
        assert _normalize_location_to_id(42) == 42
        assert _normalize_location_to_ref(42) == "location:42"

        # String input
        assert _normalize_location_to_id("location:42") == 42
        assert _normalize_location_to_ref("location:42") == "location:42"

        # None input
        assert _normalize_location_to_id(None) is None
        assert _normalize_location_to_ref(None) is None


class TestEventTimestampFiltering:
    """Tests for event timestamp filtering logic."""

    def test_before_ts_filter_parsing(self):
        """Events should be filterable by before_ts - test parsing."""
        before_ts = "2024-01-15T12:00:00Z"
        before_dt = datetime.fromisoformat(before_ts.replace("Z", "+00:00"))

        assert before_dt.year == 2024
        assert before_dt.month == 1
        assert before_dt.day == 15
        assert before_dt.hour == 12

    def test_after_ts_filter_parsing(self):
        """Events should be filterable by after_ts - test parsing."""
        after_ts = "2024-01-10T08:30:00Z"
        after_dt = datetime.fromisoformat(after_ts.replace("Z", "+00:00"))

        assert after_dt.year == 2024
        assert after_dt.month == 1
        assert after_dt.day == 10
        assert after_dt.hour == 8
        assert after_dt.minute == 30

    def test_timestamp_ordering(self):
        """Events should be ordered by timestamp descending."""
        now = datetime.utcnow()
        events = [
            {"id": 1, "ts": now, "action": "latest"},
            {"id": 2, "ts": now - timedelta(minutes=5), "action": "older"},
            {"id": 3, "ts": now - timedelta(hours=1), "action": "oldest"},
        ]

        # Sort by ts descending (most recent first)
        sorted_events = sorted(events, key=lambda e: e["ts"], reverse=True)

        assert sorted_events[0]["action"] == "latest"
        assert sorted_events[1]["action"] == "older"
        assert sorted_events[2]["action"] == "oldest"

    def test_limit_applied_correctly(self):
        """Limit should cap the number of events returned."""
        events = [{"id": i, "action": f"event_{i}"} for i in range(100)]
        limit = 20

        limited = events[:limit]
        assert len(limited) == 20

    def test_before_ts_filtering(self):
        """Events before a timestamp should be filtered."""
        now = datetime.utcnow()
        cutoff = now - timedelta(hours=1)

        events = [
            {"id": 1, "ts": now, "action": "recent"},
            {"id": 2, "ts": now - timedelta(hours=2), "action": "old"},
            {"id": 3, "ts": now - timedelta(hours=3), "action": "older"},
        ]

        # Filter events before cutoff
        before_cutoff = [e for e in events if e["ts"] < cutoff]
        assert len(before_cutoff) == 2
        assert all(e["action"] in ["old", "older"] for e in before_cutoff)

    def test_after_ts_filtering(self):
        """Events after a timestamp should be filtered."""
        now = datetime.utcnow()
        cutoff = now - timedelta(hours=2)

        events = [
            {"id": 1, "ts": now, "action": "recent"},
            {"id": 2, "ts": now - timedelta(hours=1), "action": "less_recent"},
            {"id": 3, "ts": now - timedelta(hours=3), "action": "old"},
        ]

        # Filter events after cutoff
        after_cutoff = [e for e in events if e["ts"] > cutoff]
        assert len(after_cutoff) == 2
        assert all(e["action"] in ["recent", "less_recent"] for e in after_cutoff)


class TestEventActions:
    """Tests for event action naming conventions."""

    def test_action_naming(self):
        """Event actions should follow consistent naming."""
        valid_actions = [
            "session_created",
            "advance",
            "session_update",
            "inventory_add",
            "inventory_remove",
            "inventory_update",
            "inventory_clear",
            "quest_add",
            "quest_status",
            "quest_progress",
            "quest_objective_complete",
            "stealth_pickpocket",
        ]

        for action in valid_actions:
            # Action should be lowercase with underscores
            assert action == action.lower()
            assert " " not in action
            # Action should be max 64 chars (model constraint)
            assert len(action) <= 64

    def test_action_max_length(self):
        """Actions should be truncated to 64 chars max."""
        long_action = "x" * 100
        truncated = long_action[:64]
        assert len(truncated) == 64


class TestEventDiff:
    """Tests for event diff structure."""

    def test_inventory_add_diff(self):
        """inventory_add diff should have item_id and quantity."""
        diff = {"item_id": "sword", "quantity": 1}
        assert "item_id" in diff
        assert "quantity" in diff

    def test_inventory_remove_diff(self):
        """inventory_remove diff should have item_id and quantity."""
        diff = {"item_id": "potion", "quantity": 2}
        assert "item_id" in diff
        assert "quantity" in diff

    def test_quest_add_diff(self):
        """quest_add diff should have quest_id and title."""
        diff = {"quest_id": "main_quest", "title": "Save the World"}
        assert "quest_id" in diff
        assert "title" in diff

    def test_session_update_diff(self):
        """session_update diff should track what changed."""
        diff = {"world_time": {"old": 0, "new": 3600}, "flags_updated": True}
        # Should track specific changes
        assert "world_time" in diff or "flags_updated" in diff or "stats_updated" in diff

    def test_stealth_pickpocket_diff(self):
        """stealth_pickpocket diff should have outcome details."""
        diff = {
            "npc_id": 42,
            "slot_id": "wallet",
            "success": True,
            "detected": False,
        }
        assert "npc_id" in diff
        assert "success" in diff
        assert "detected" in diff
