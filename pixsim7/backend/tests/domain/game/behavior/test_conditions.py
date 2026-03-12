from __future__ import annotations

import pytest

try:
    from pixsim7.backend.main.domain.game.behavior.conditions import (
        _eval_expression,
        _eval_location_type_in,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False
    _eval_expression = None  # type: ignore[assignment]
    _eval_location_type_in = None  # type: ignore[assignment]


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_location_type_in_matches_embedded_location_payload():
    condition = {"type": "location_type_in", "locationTypes": ["cafe", "home"]}
    context = {
        "npc_state": {
            "location": {"type": "Cafe"},
        }
    }

    assert _eval_location_type_in(condition, context) is True


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_location_type_in_matches_world_location_lookup():
    condition = {"type": "location_type_in", "locationTypes": ["shop"]}
    context = {
        "npc_state": {"currentLocationId": 5},
        "world": {
            "locations": [
                {"id": 4, "meta": {"location_type": "cafe"}},
                {"id": 5, "meta": {"location_type": "shop"}},
            ]
        },
    }

    assert _eval_location_type_in(condition, context) is True


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_location_type_in_returns_false_for_mismatch():
    condition = {"type": "location_type_in", "locationTypes": ["library"]}
    context = {
        "npc_state": {"currentLocationId": "location:5"},
        "locations_by_id": {
            5: {"id": 5, "meta": {"location_type": "shop"}},
        },
    }

    assert _eval_location_type_in(condition, context) is False


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_expression_condition_supports_basic_boolean_logic():
    condition = {
        "type": "expression",
        "expression": "world_time >= 3600 and npc_state['energy'] < 50",
    }
    context = {
        "world_time": 7200,
        "npc_state": {"energy": 20},
    }

    assert _eval_expression(condition, context) is True


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_expression_condition_rejects_unsafe_calls():
    condition = {
        "type": "expression",
        "expression": "__import__('os').system('echo blocked')",
    }

    assert _eval_expression(condition, {}) is False
