from __future__ import annotations

import pytest

try:
    from pixsim7.backend.main.domain.game.behavior.conditions import evaluate_condition
    from pixsim7.backend.main.domain.game.behavior.effects import apply_custom_effect
    from pixsim7.backend.main.domain.game.behavior.scoring import calculate_activity_score
    from pixsim7.backend.main.infrastructure.plugins.behavior_registry import (
        apply_effect,
        behavior_registry,
        build_simulation_config,
    )

    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False
    evaluate_condition = None  # type: ignore[assignment]
    apply_custom_effect = None  # type: ignore[assignment]
    calculate_activity_score = None  # type: ignore[assignment]
    behavior_registry = None  # type: ignore[assignment]
    apply_effect = None  # type: ignore[assignment]
    build_simulation_config = None  # type: ignore[assignment]


PLUGIN_A = "test-plugin-a"
PLUGIN_B = "test-plugin-b"


@pytest.fixture(autouse=True)
def _isolate_behavior_registry():
    """Keep global behavior registry deterministic for these tests."""
    if not IMPORTS_AVAILABLE:
        yield
        return

    was_locked = bool(behavior_registry.get_stats().get("locked", False))
    behavior_registry.unlock()

    for plugin_id in (PLUGIN_A, PLUGIN_B):
        behavior_registry.unregister_by_plugin(plugin_id)

    yield

    behavior_registry.unlock()
    for plugin_id in (PLUGIN_A, PLUGIN_B):
        behavior_registry.unregister_by_plugin(plugin_id)
    if was_locked:
        behavior_registry.lock()


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_plugin_condition_respects_world_enabled_plugins():
    condition_id = f"plugin:{PLUGIN_A}:always_true"
    assert behavior_registry.register_condition(
        condition_id=condition_id,
        plugin_id=PLUGIN_A,
        evaluator=lambda _context: True,
        description="test condition",
    )

    condition = {"type": condition_id}

    disabled = evaluate_condition(condition, {"world_enabled_plugins": []})
    enabled = evaluate_condition(condition, {"world_enabled_plugins": [PLUGIN_A]})
    unscoped = evaluate_condition(condition, {})

    assert disabled is False
    assert enabled is True
    assert unscoped is True


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_plugin_custom_effect_respects_world_enabled_plugins():
    effect_id = f"effect:plugin:{PLUGIN_A}:mark"

    def _mark_effect(params, context):
        context["effect_marker"] = params.get("value", "ok")

    assert behavior_registry.register_effect(
        effect_id=effect_id,
        plugin_id=PLUGIN_A,
        handler=_mark_effect,
        description="test effect",
    )

    context_disabled = {"world_enabled_plugins": []}
    apply_custom_effect({"type": effect_id, "params": {"value": "hit"}}, context_disabled)
    assert "effect_marker" not in context_disabled

    context_enabled = {"world_enabled_plugins": [PLUGIN_A]}
    apply_custom_effect({"type": effect_id, "params": {"value": "hit"}}, context_enabled)
    assert context_enabled["effect_marker"] == "hit"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_plugin_scoring_factor_respects_world_enabled_plugins():
    factor_id = f"plugin:{PLUGIN_A}:boost"

    def _factor(_activity, _prefs, _state, _context, _weight):
        return 10.0

    assert behavior_registry.register_scoring_factor(
        factor_id=factor_id,
        plugin_id=PLUGIN_A,
        evaluator=_factor,
        default_weight=1.0,
        description="test factor",
    )

    activity = {"id": "activity:test"}
    prefs = {}
    npc_state = {}

    score_disabled = calculate_activity_score(
        activity,
        prefs,
        npc_state,
        {"world_enabled_plugins": []},
    )
    score_enabled = calculate_activity_score(
        activity,
        prefs,
        npc_state,
        {"world_enabled_plugins": [PLUGIN_A]},
    )

    assert score_enabled > score_disabled


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_build_simulation_config_respects_world_enabled_plugins():
    assert behavior_registry.register_simulation_config(
        provider_id=f"plugin:{PLUGIN_A}:sim_cfg",
        plugin_id=PLUGIN_A,
        config_fn=lambda: {"maxNpcsPerTick": 11},
        priority=10,
    )
    assert behavior_registry.register_simulation_config(
        provider_id=f"plugin:{PLUGIN_B}:sim_cfg",
        plugin_id=PLUGIN_B,
        config_fn=lambda: {"maxNpcsPerTick": 77},
        priority=20,
    )

    only_a = build_simulation_config({}, world_enabled_plugins=[PLUGIN_A])
    only_b = build_simulation_config({}, world_enabled_plugins=[PLUGIN_B])
    all_enabled = build_simulation_config({})

    assert only_a.get("maxNpcsPerTick") == 11
    assert only_b.get("maxNpcsPerTick") == 77
    # With no allowlist both providers apply in priority order; later one wins.
    assert all_enabled.get("maxNpcsPerTick") == 77


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
def test_effect_handler_signature_compatibility_in_custom_effects():
    canonical_effect_id = f"effect:plugin:{PLUGIN_A}:canonical_sig"
    legacy_effect_id = f"effect:plugin:{PLUGIN_B}:legacy_sig"

    def _canonical_handler(context, params):
        context["canonical_marker"] = params.get("value", "canonical")

    def _legacy_handler(params, context):
        context["legacy_marker"] = params.get("value", "legacy")

    assert behavior_registry.register_effect(
        effect_id=canonical_effect_id,
        plugin_id=PLUGIN_A,
        handler=_canonical_handler,
        description="canonical order",
    )
    assert behavior_registry.register_effect(
        effect_id=legacy_effect_id,
        plugin_id=PLUGIN_B,
        handler=_legacy_handler,
        description="legacy order",
    )

    context = {"world_enabled_plugins": [PLUGIN_A, PLUGIN_B]}
    apply_custom_effect({"type": canonical_effect_id, "params": {"value": "c"}}, context)
    apply_custom_effect({"type": legacy_effect_id, "params": {"value": "l"}}, context)

    assert context["canonical_marker"] == "c"
    assert context["legacy_marker"] == "l"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
@pytest.mark.asyncio
async def test_behavior_registry_apply_effect_supports_legacy_signature():
    effect_id = f"effect:plugin:{PLUGIN_A}:legacy_async_path"

    def _legacy_handler(params, context):
        context["applied_via_registry"] = params.get("amount", 0)
        return {"ok": True}

    assert behavior_registry.register_effect(
        effect_id=effect_id,
        plugin_id=PLUGIN_A,
        handler=_legacy_handler,
        description="legacy async helper",
    )

    context = {}
    result = await apply_effect(effect_id, context, params={"amount": 5}, world_enabled_plugins=[PLUGIN_A])

    assert context["applied_via_registry"] == 5
    assert result == {"ok": True}
