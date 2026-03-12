from __future__ import annotations

import pytest

try:
    from pixsim7.backend.main.domain.game.interactions.interaction_availability import (
        DEFAULT_GATING_PLUGIN_ID,
        evaluate_interaction_availability,
        resolve_gating_plugin_id,
    )
    from pixsim7.backend.main.domain.game.interactions.interactions import (
        DisabledReason,
        InteractionContext,
        InteractionDefinition,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False
    DEFAULT_GATING_PLUGIN_ID = "intimacy.default"  # type: ignore[assignment]
    DisabledReason = None  # type: ignore[assignment]
    InteractionContext = None  # type: ignore[assignment]
    InteractionDefinition = None  # type: ignore[assignment]
    evaluate_interaction_availability = None  # type: ignore[assignment]
    resolve_gating_plugin_id = None  # type: ignore[assignment]


def _build_flag_gated_definition() -> "InteractionDefinition":
    return InteractionDefinition(
        id="interaction:test",
        label="Test Interaction",
        surface="inline",
        gating={
            "requiredFlags": ["arc:romance_alex.completed"],
        },
    )


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_resolve_gating_plugin_id_uses_manifest_snake_case():
    world_meta = {"manifest": {"gating_plugin": " custom.plugin "}}
    assert resolve_gating_plugin_id(world_meta) == "custom.plugin"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_resolve_gating_plugin_id_supports_manifest_camel_case():
    world_meta = {"manifest": {"gatingPlugin": "compat.plugin"}}
    assert resolve_gating_plugin_id(world_meta) == "compat.plugin"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_resolve_gating_plugin_id_falls_back_to_default():
    assert resolve_gating_plugin_id({"manifest": {}}) == DEFAULT_GATING_PLUGIN_ID


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_unknown_plugin_uses_default_interaction_evaluator():
    definition = _build_flag_gated_definition()
    context = InteractionContext(sessionFlags={})

    expected = evaluate_interaction_availability(
        definition,
        context,
        gating_plugin_id=DEFAULT_GATING_PLUGIN_ID,
    )
    actual = evaluate_interaction_availability(
        definition,
        context,
        gating_plugin_id="missing.plugin",
    )

    assert actual == expected
    assert actual[0] is False
    assert actual[1] == DisabledReason.FLAG_REQUIRED
