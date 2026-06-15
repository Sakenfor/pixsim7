from __future__ import annotations

from pixsim7.backend.main.services.prompt.resolver import resolve_prompt_variables


def test_expands_only_names_with_values() -> None:
    # ACTOR1 has no value (stays symbolic); ACTOR1_DETAILS expands.
    out = resolve_prompt_variables(
        "ACTOR1 ==> kisses ACTOR2. ACTOR1_DETAILS",
        {"ACTOR1_DETAILS": "tall woman, 30s"},
    )
    assert out == "ACTOR1 ==> kisses ACTOR2. tall woman, 30s"


def test_whole_token_match_only() -> None:
    # ACTOR1 must not expand inside ACTOR1_DETAILS or FOO_ACTOR1.
    out = resolve_prompt_variables(
        "ACTOR1 ACTOR1_DETAILS FOO_ACTOR1",
        {"ACTOR1": "X"},
    )
    assert out == "X ACTOR1_DETAILS FOO_ACTOR1"


def test_recursive_expansion() -> None:
    out = resolve_prompt_variables(
        "ACTOR1_FULL",
        {
            "ACTOR1_FULL": "ACTOR1_DETAILS, ACTOR1_POSE",
            "ACTOR1_DETAILS": "tall woman",
            "ACTOR1_POSE": "standing",
        },
    )
    assert out == "tall woman, standing"


def test_cycle_is_left_symbolic() -> None:
    # A -> B -> A; the back-reference to an in-progress name stays literal.
    out = resolve_prompt_variables(
        "A",
        {"A": "B", "B": "A"},
    )
    assert out == "A"


def test_self_reference_expands_once_then_stops() -> None:
    # The active-set guard catches the self-reference: A expands once, then the
    # inner A (now in-progress) is left symbolic.
    out = resolve_prompt_variables("A", {"A": "x A"})
    assert out == "x A"


def test_backslash_escape_emits_literal() -> None:
    out = resolve_prompt_variables(
        r"\ACTOR1 and ACTOR1",
        {"ACTOR1": "the lead"},
    )
    assert out == "ACTOR1 and the lead"


def test_no_values_returns_text_unchanged() -> None:
    assert resolve_prompt_variables("ACTOR1 ==> ACTOR2", {}) == "ACTOR1 ==> ACTOR2"
    # Empty values are ignored (treated as no value).
    assert resolve_prompt_variables("ACTOR1", {"ACTOR1": ""}) == "ACTOR1"


def test_transform_applies_to_resolved_value() -> None:
    out = resolve_prompt_variables(
        "ACTOR1",
        {"ACTOR1": "cat"},
        transforms={"ACTOR1": "spaced:__"},
    )
    assert out == "c__a__t"


def test_transform_default_separator_is_space() -> None:
    out = resolve_prompt_variables("ACTOR1", {"ACTOR1": "cat"}, transforms={"ACTOR1": "spaced"})
    assert out == "c a t"


def test_transform_applies_after_recursive_expansion() -> None:
    # The transform wraps the FULLY-resolved subtree, not the raw value text.
    out = resolve_prompt_variables(
        "ACTOR1_FULL",
        {"ACTOR1_FULL": "ab ACTOR1_X", "ACTOR1_X": "cd"},
        transforms={"ACTOR1_FULL": "upper"},
    )
    assert out == "AB CD"


def test_unknown_transform_is_a_noop() -> None:
    out = resolve_prompt_variables("ACTOR1", {"ACTOR1": "cat"}, transforms={"ACTOR1": "nope"})
    assert out == "cat"


def test_transform_without_value_does_not_apply() -> None:
    # No value => no expansion => transform never runs (token stays symbolic).
    out = resolve_prompt_variables("ACTOR1", {}, transforms={"ACTOR1": "upper"})
    assert out == "ACTOR1"


def test_non_ascii_adjacent_token_is_not_a_whole_token() -> None:
    # Python's `\b` is Unicode-aware: `é` is a word char, so ACTOR1 is embedded in
    # `caféACTOR1` and must not expand. A real boundary still expands.
    assert resolve_prompt_variables("caféACTOR1", {"ACTOR1": "X"}) == "caféACTOR1"
    assert resolve_prompt_variables("café ACTOR1", {"ACTOR1": "X"}) == "café X"


def test_output_budget_bounds_exponential_fanout() -> None:
    # Distinct-name fan-out (L0 -> L1 x6 -> ...) evades the cycle guard and grows
    # O(6 ** depth). The output budget must halt amplification so the worker can't
    # be OOM'd by crafted recursive values. Unbounded this is millions of chars.
    values = {f"L{i}": " ".join([f"L{i + 1}"] * 6) for i in range(9)}
    values["L9"] = "leaf"
    out = resolve_prompt_variables("L0", values, max_output_chars=5_000)
    assert len(out) < 50_000
