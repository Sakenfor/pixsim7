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
