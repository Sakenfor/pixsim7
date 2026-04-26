"""Unit tests for the Latin enhancer composer.

Exercises compose_pure with synthetic pools so we can assert deterministic
behavior without touching the blocks DB.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.services.prompt.latin_enhancer import (
    ComposeRequest,
    ComposedVariant,
    compose_pure,
    resolve_intensity_curve,
)
from pixsim7.backend.main.services.prompt.latin_enhancer.composer import join_picks

TEST_SUITE = {
    "id": "prompt-latin-enhancer-composer",
    "label": "Latin Enhancer Composer — pure picker",
    "kind": "unit",
    "category": "backend/prompt",
}


def _v(
    block_id: str,
    text: str,
    *,
    register: str = "technical",
    intensity: str = "moderate",
    motion_type: str | None = None,
    applies_to: str | None = None,
    latin_form: str = "predication",
    domains: tuple[str, ...] = (),
) -> ComposedVariant:
    return ComposedVariant(
        block_id=block_id,
        text=text,
        register=register,
        intensity=intensity,
        motion_type=motion_type,
        applies_to=applies_to,
        latin_form=latin_form,
        domains=domains,
    )


# ── resolve_intensity_curve ────────────────────────────────────────────────


def test_intensity_curve_fixed_repeats_setting():
    assert resolve_intensity_curve("subtle", 3) == ("subtle", "subtle", "subtle")


def test_intensity_curve_fixed_zero_returns_empty():
    assert resolve_intensity_curve("subtle", 0) == ()


def test_intensity_curve_escalating_one_pick_is_moderate():
    assert resolve_intensity_curve("escalating", 1) == ("moderate",)


def test_intensity_curve_escalating_walks_tiers():
    assert resolve_intensity_curve("escalating", 4) == (
        "subtle",
        "moderate",
        "firm",
        "absolute",
    )


def test_intensity_curve_escalating_extends_with_firm_for_long_runs():
    assert resolve_intensity_curve("escalating", 6) == (
        "subtle",
        "moderate",
        "firm",
        "absolute",
        "firm",
        "firm",
    )


# ── compose_pure: empty / minimal cases ─────────────────────────────────────


def test_empty_pool_returns_empty_response():
    res = compose_pure([], ComposeRequest(length="medium"))
    assert res.text == ""
    assert res.variants == ()
    assert res.pool_size == 0


def test_brief_picks_one_variant():
    pool = [
        _v("a", "alpha", intensity="moderate"),
        _v("b", "beta", intensity="firm"),
    ]
    res = compose_pure(pool, ComposeRequest(length="brief", intensity="moderate", seed=1))
    assert len(res.variants) == 1
    assert res.variants[0].block_id == "a"
    assert res.text == "Alpha." or res.text == "alpha." or res.text.endswith(".")


# ── compose_pure: anti-repeat heuristics ───────────────────────────────────


def test_no_consecutive_same_motion_type_when_avoidable():
    pool = [
        _v("a1", "alpha 1", motion_type="press", intensity="moderate"),
        _v("a2", "alpha 2", motion_type="press", intensity="moderate"),
        _v("a3", "alpha 3", motion_type="press", intensity="moderate"),
        _v("b1", "beta 1", motion_type="kiss", intensity="moderate"),
        _v("b2", "beta 2", motion_type="lick", intensity="moderate"),
    ]
    res = compose_pure(pool, ComposeRequest(length="medium", intensity="moderate", seed=1))
    motions = [v.motion_type for v in res.variants]
    # With 3 picks and varied motions available, we should never repeat
    # the immediately preceding motion type.
    for i in range(1, len(motions)):
        assert motions[i] != motions[i - 1], f"motion repeated at index {i}: {motions}"


def test_target_capped_at_two_appearances_when_pool_allows():
    pool = [
        _v("a", "alpha", applies_to="lips", intensity="moderate", motion_type="kiss"),
        _v("b", "beta", applies_to="lips", intensity="moderate", motion_type="bite"),
        _v("c", "gamma", applies_to="lips", intensity="moderate", motion_type="lick"),
        _v("d", "delta", applies_to="neck", intensity="moderate", motion_type="press"),
        _v("e", "epsilon", applies_to="ear", intensity="moderate", motion_type="exhale"),
    ]
    res = compose_pure(pool, ComposeRequest(length="long", intensity="moderate", seed=2))
    targets = [v.applies_to for v in res.variants]
    assert targets.count("lips") <= 2


# ── compose_pure: intensity curve flow ──────────────────────────────────────


def test_escalating_curve_picks_distinct_tiers_when_pool_allows():
    pool = [
        _v("s", "subtle one", intensity="subtle", motion_type="exhale"),
        _v("m", "moderate one", intensity="moderate", motion_type="kiss"),
        _v("f", "firm one", intensity="firm", motion_type="press"),
        _v("a", "absolute one", intensity="absolute", motion_type="grip"),
    ]
    res = compose_pure(pool, ComposeRequest(length="long", intensity="escalating", seed=3))
    tiers = [v.intensity for v in res.variants]
    assert tiers == ["subtle", "moderate", "firm", "absolute"]


def test_intensity_curve_falls_back_when_tier_missing():
    pool = [
        _v("a", "alpha", intensity="firm", motion_type="kiss"),
        _v("b", "beta", intensity="firm", motion_type="press"),
    ]
    res = compose_pure(pool, ComposeRequest(length="short", intensity="escalating", seed=1))
    # Pool has no moderate or subtle; relaxed search still finds firm picks.
    assert len(res.variants) == 2
    assert all(v.intensity == "firm" for v in res.variants)


# ── compose_pure: no duplicate variant within one composition ───────────────


def test_no_variant_picked_twice():
    pool = [
        _v("a", "alpha", intensity="moderate", motion_type="kiss"),
        _v("b", "beta", intensity="moderate", motion_type="bite"),
    ]
    res = compose_pure(pool, ComposeRequest(length="long", intensity="moderate", seed=4))
    ids = [v.block_id for v in res.variants]
    assert len(ids) == len(set(ids)), f"duplicate picks: {ids}"


# ── compose_pure: seed determinism ─────────────────────────────────────────


def test_same_seed_produces_same_output():
    pool = [
        _v(f"v{i}", f"text {i}", intensity="moderate", motion_type=f"m{i % 3}")
        for i in range(8)
    ]
    req = ComposeRequest(length="medium", intensity="moderate", seed=42)
    a = compose_pure(pool, req)
    b = compose_pure(pool, req)
    assert [v.block_id for v in a.variants] == [v.block_id for v in b.variants]
    assert a.text == b.text


# ── join_picks: noun-phrase vs predication formatting ─────────────────────


def test_join_picks_predications_separated_by_period_and_capitalized():
    picks = [
        _v("a", "lingua serpit", latin_form="predication"),
        _v("b", "labra premuntur", latin_form="predication"),
    ]
    out = join_picks(picks)
    assert out == "lingua serpit. Labra premuntur."


def test_join_picks_noun_phrase_attaches_with_semicolon():
    picks = [
        _v("a", "lingua serpit", latin_form="predication"),
        _v("b", "morsus levis", latin_form="noun_phrase"),
    ]
    out = join_picks(picks)
    assert out == "lingua serpit; morsus levis."


def test_join_picks_empty_returns_empty():
    assert join_picks(()) == ""


# ── compose_pure: register filter is upstream (pool comes pre-filtered) ────


def test_compose_uses_pool_as_given_no_register_secondary_filter():
    pool = [
        _v("p", "poetic line", register="poetic", intensity="moderate"),
        _v("t", "technical line", register="technical", intensity="moderate"),
    ]
    res = compose_pure(pool, ComposeRequest(length="short", intensity="moderate", seed=1))
    # compose_pure trusts the pool, doesn't re-filter on register.
    assert len(res.variants) == 2
