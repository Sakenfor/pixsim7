from __future__ import annotations

from pixsim7.backend.main.services.prompt.block.resolution_core import (
    CandidateBlock,
    PairwiseBonus,
    ResolutionConstraint,
    ResolutionIntent,
    ResolutionRequest,
    ResolutionTarget,
    adapt_legacy_slot_results,
    build_default_resolver_registry,
)


def test_next_v1_resolver_prefers_desired_tags_and_rating() -> None:
    registry = build_default_resolver_registry()
    request = ResolutionRequest(
        resolver_id="next_v1",
        intent=ResolutionIntent(
            targets=[ResolutionTarget(key="uniform", kind="slot")],
            desired_tags_by_target={"uniform": {"variant": "duty"}},
        ),
        candidates_by_target={
            "uniform": [
                CandidateBlock(
                    block_id="uniform_sleek",
                    text="sleek police uniform",
                    tags={"variant": "sleek"},
                    avg_rating=4.8,
                ),
                CandidateBlock(
                    block_id="uniform_duty",
                    text="duty police uniform",
                    tags={"variant": "duty"},
                    avg_rating=3.0,
                ),
            ]
        },
    )

    result = registry.resolve(request)
    assert not result.errors
    assert result.selected_by_target["uniform"].block_id == "uniform_duty"
    assert any(ev.kind == "candidate_scored" for ev in result.trace.events)


def test_next_v1_applies_requires_and_forbid_constraints() -> None:
    registry = build_default_resolver_registry()
    request = ResolutionRequest(
        resolver_id="next_v1",
        intent=ResolutionIntent(targets=[ResolutionTarget(key="modifier", kind="slot")]),
        candidates_by_target={
            "modifier": [
                CandidateBlock(
                    block_id="mod_high",
                    text="high allure modifier",
                    tags={"allure_level": "high", "modifier_family": "allure"},
                    capabilities=["wardrobe_modifier"],
                ),
                CandidateBlock(
                    block_id="mod_subtle",
                    text="subtle allure modifier",
                    tags={"allure_level": "subtle", "modifier_family": "allure"},
                    capabilities=["wardrobe_modifier"],
                ),
            ]
        },
        constraints=[
            ResolutionConstraint(
                id="need_allure_family",
                kind="requires_tag",
                target_key="modifier",
                payload={"tag": "modifier_family", "value": "allure"},
            ),
            ResolutionConstraint(
                id="no_high",
                kind="forbid_tag",
                target_key="modifier",
                payload={"tag": "allure_level", "value": "high"},
            ),
        ],
    )

    result = registry.resolve(request)
    assert result.selected_by_target["modifier"].block_id == "mod_subtle"
    assert any(ev.kind == "constraint_failed" for ev in result.trace.events)


def test_next_v1_requires_capabilities_per_target() -> None:
    registry = build_default_resolver_registry()
    request = ResolutionRequest(
        resolver_id="next_v1",
        intent=ResolutionIntent(
            targets=[ResolutionTarget(key="lighting", kind="slot")],
            required_capabilities_by_target={"lighting": ["lighting_modifier"]},
        ),
        candidates_by_target={
            "lighting": [
                CandidateBlock(
                    block_id="wardrobe_mod",
                    text="wardrobe modifier",
                    capabilities=["wardrobe_modifier"],
                ),
                CandidateBlock(
                    block_id="lighting_mod",
                    text="lighting modifier",
                    capabilities=["lighting_modifier"],
                ),
            ]
        },
    )

    result = registry.resolve(request)
    assert result.selected_by_target["lighting"].block_id == "lighting_mod"


def test_adapt_legacy_slot_results_normalizes_selected_and_warnings() -> None:
    slot_results = [
        {
            "label": "Uniform aesthetic",
            "status": "selected",
            "selected_block_string_id": "police_uniform_duty",
            "prompt_preview": "duty uniform ...",
            "selector_strategy": "weighted_tags",
            "selector_debug": {"strategy": "weighted_tags"},
        },
        {
            "label": "Wardrobe modifier",
            "status": "fallback",
            "fallback_text": "fallback text",
        },
    ]

    result = adapt_legacy_slot_results(slot_results, seed=123)
    assert result.resolver_id == "legacy_v1"
    assert result.seed == 123
    assert "Uniform aesthetic" in result.selected_by_target
    assert result.selected_by_target["Uniform aesthetic"].block_id == "police_uniform_duty"
    assert any("fallback" in w for w in result.warnings)
    assert any(ev.kind == "legacy_slot_result" for ev in result.trace.events)


# ---------------------------------------------------------------------------
# Seeded tie-breaking
# ---------------------------------------------------------------------------


def test_seeded_tiebreaker_is_deterministic() -> None:
    """Same seed + same candidates produces same selection; different seed may differ."""
    registry = build_default_resolver_registry()

    def _make_request(seed: int) -> ResolutionRequest:
        return ResolutionRequest(
            resolver_id="next_v1",
            seed=seed,
            intent=ResolutionIntent(
                targets=[ResolutionTarget(key="slot_a", kind="slot")],
            ),
            candidates_by_target={
                "slot_a": [
                    CandidateBlock(block_id="block_x", text="block x", avg_rating=3.0),
                    CandidateBlock(block_id="block_y", text="block y", avg_rating=3.0),
                    CandidateBlock(block_id="block_z", text="block z", avg_rating=3.0),
                ]
            },
        )

    # Same seed → same result.
    r1 = registry.resolve(_make_request(seed=42))
    r2 = registry.resolve(_make_request(seed=42))
    assert r1.selected_by_target["slot_a"].block_id == r2.selected_by_target["slot_a"].block_id

    # Collect results across many seeds; at least two different winners expected.
    winners = set()
    for s in range(200):
        r = registry.resolve(_make_request(seed=s))
        winners.add(r.selected_by_target["slot_a"].block_id)
    assert len(winners) >= 2, f"Expected variation across seeds, got only {winners}"


def test_seeded_tiebreaker_trace_shows_reason() -> None:
    """Seed tiebreaker appears in candidate_scored reasons."""
    registry = build_default_resolver_registry()
    request = ResolutionRequest(
        resolver_id="next_v1",
        seed=99,
        intent=ResolutionIntent(
            targets=[ResolutionTarget(key="t", kind="slot")],
        ),
        candidates_by_target={
            "t": [CandidateBlock(block_id="b1", text="b1")]
        },
    )
    result = registry.resolve(request)
    scored_events = [ev for ev in result.trace.events if ev.kind == "candidate_scored"]
    assert scored_events
    reasons = scored_events[0].data.get("reasons", [])
    assert any("seed_tiebreaker" in r for r in reasons)


# ---------------------------------------------------------------------------
# Pairwise compatibility bonus
# ---------------------------------------------------------------------------


def test_pairwise_bonus_boosts_compatible_candidate() -> None:
    """Pairwise bonus shifts selection toward the compatible candidate."""
    registry = build_default_resolver_registry()
    request = ResolutionRequest(
        resolver_id="next_v1",
        seed=1,
        intent=ResolutionIntent(
            targets=[
                ResolutionTarget(key="aesthetic", kind="slot"),
                ResolutionTarget(key="modifier", kind="slot"),
            ],
        ),
        candidates_by_target={
            "aesthetic": [
                CandidateBlock(
                    block_id="tribal",
                    text="tribal aesthetic",
                    tags={"aesthetic": "tribal"},
                    avg_rating=3.0,
                ),
            ],
            "modifier": [
                CandidateBlock(
                    block_id="mod_urban",
                    text="urban modifier",
                    tags={"style": "urban"},
                    avg_rating=4.5,
                ),
                CandidateBlock(
                    block_id="mod_tribal",
                    text="tribal modifier",
                    tags={"style": "tribal"},
                    avg_rating=3.0,
                ),
            ],
        },
        pairwise_bonuses=[
            PairwiseBonus(
                id="tribal-compat",
                source_target="aesthetic",
                target_key="modifier",
                source_tags={"aesthetic": "tribal"},
                candidate_tags={"style": "tribal"},
                bonus=3.0,
            ),
        ],
    )

    result = registry.resolve(request)
    # mod_urban has higher rating but mod_tribal gets +3.0 pairwise bonus.
    assert result.selected_by_target["modifier"].block_id == "mod_tribal"
    # Trace should contain pairwise_bonus event.
    assert any(ev.kind == "pairwise_bonus" for ev in result.trace.events)


def test_pairwise_bonus_no_effect_when_source_not_matched() -> None:
    """Pairwise bonus is skipped when source_tags don't match the selected block."""
    registry = build_default_resolver_registry()
    request = ResolutionRequest(
        resolver_id="next_v1",
        seed=1,
        intent=ResolutionIntent(
            targets=[
                ResolutionTarget(key="aesthetic", kind="slot"),
                ResolutionTarget(key="modifier", kind="slot"),
            ],
        ),
        candidates_by_target={
            "aesthetic": [
                CandidateBlock(
                    block_id="urban",
                    text="urban aesthetic",
                    tags={"aesthetic": "urban"},
                    avg_rating=3.0,
                ),
            ],
            "modifier": [
                CandidateBlock(
                    block_id="mod_urban",
                    text="urban modifier",
                    tags={"style": "urban"},
                    avg_rating=4.5,
                ),
                CandidateBlock(
                    block_id="mod_tribal",
                    text="tribal modifier",
                    tags={"style": "tribal"},
                    avg_rating=3.0,
                ),
            ],
        },
        pairwise_bonuses=[
            PairwiseBonus(
                id="tribal-compat",
                source_target="aesthetic",
                target_key="modifier",
                source_tags={"aesthetic": "tribal"},  # Won't match "urban".
                candidate_tags={"style": "tribal"},
                bonus=3.0,
            ),
        ],
    )

    result = registry.resolve(request)
    # Bonus doesn't fire, so mod_urban wins on rating alone.
    assert result.selected_by_target["modifier"].block_id == "mod_urban"
    assert not any(ev.kind == "pairwise_bonus" for ev in result.trace.events)


# ---------------------------------------------------------------------------
# Dependency-aware target ordering
# ---------------------------------------------------------------------------


def test_dependency_ordering_resolves_source_before_dependent() -> None:
    """requires_other_selected causes source target to be resolved first."""
    registry = build_default_resolver_registry()
    # Declare targets in reverse dependency order (B first, A second).
    # Ordering should still resolve A first because B depends on A.
    request = ResolutionRequest(
        resolver_id="next_v1",
        seed=1,
        intent=ResolutionIntent(
            targets=[
                ResolutionTarget(key="B", kind="slot"),
                ResolutionTarget(key="A", kind="slot"),
            ],
        ),
        candidates_by_target={
            "A": [CandidateBlock(block_id="a1", text="a1")],
            "B": [CandidateBlock(block_id="b1", text="b1")],
        },
        constraints=[
            ResolutionConstraint(
                id="b-needs-a",
                kind="requires_other_selected",
                target_key="B",
                payload={"other_target_key": "A"},
            ),
        ],
    )

    result = registry.resolve(request)
    assert "A" in result.selected_by_target
    assert "B" in result.selected_by_target
    # Verify via trace that A started before B.
    starts = [
        ev.target_key
        for ev in result.trace.events
        if ev.kind == "target_start"
    ]
    assert starts.index("A") < starts.index("B")


def test_dependency_ordering_from_pairwise_bonus() -> None:
    """Pairwise bonus source_target is resolved before target_key."""
    registry = build_default_resolver_registry()
    request = ResolutionRequest(
        resolver_id="next_v1",
        seed=1,
        intent=ResolutionIntent(
            targets=[
                ResolutionTarget(key="modifier", kind="slot"),
                ResolutionTarget(key="base", kind="slot"),
            ],
        ),
        candidates_by_target={
            "base": [CandidateBlock(block_id="base1", text="base1")],
            "modifier": [CandidateBlock(block_id="mod1", text="mod1")],
        },
        pairwise_bonuses=[
            PairwiseBonus(
                id="base-first",
                source_target="base",
                target_key="modifier",
                bonus=1.0,
            ),
        ],
    )

    result = registry.resolve(request)
    starts = [
        ev.target_key
        for ev in result.trace.events
        if ev.kind == "target_start"
    ]
    assert starts.index("base") < starts.index("modifier")


def test_target_order_trace_event_emitted() -> None:
    """Resolver emits a target_order trace event."""
    registry = build_default_resolver_registry()
    request = ResolutionRequest(
        resolver_id="next_v1",
        seed=1,
        intent=ResolutionIntent(
            targets=[
                ResolutionTarget(key="x", kind="slot"),
                ResolutionTarget(key="y", kind="slot"),
            ],
        ),
        candidates_by_target={
            "x": [CandidateBlock(block_id="x1", text="x1")],
            "y": [CandidateBlock(block_id="y1", text="y1")],
        },
    )
    result = registry.resolve(request)
    order_events = [ev for ev in result.trace.events if ev.kind == "target_order"]
    assert len(order_events) == 1
    assert order_events[0].data["order"] == ["x", "y"]
