"""Tests for inline VAR(value) extraction (tokenizer-gated)."""
from pixsim7.backend.main.services.prompt.inline_values import extract_inline_var_values
from pixsim7.backend.main.services.prompt.resolver import resolve_prompt_variables


def test_inline_var_call_binds_and_collapses():
    vals, coll = extract_inline_var_values("ACTOR2_HIP < MODUS_OPERANDI (TEASE) < DELIBERATE")
    assert vals == {"MODUS_OPERANDI": "TEASE"}
    assert coll == "ACTOR2_HIP < MODUS_OPERANDI < DELIBERATE"


def test_attached_var_call_collapses():
    vals, coll = extract_inline_var_values("MOOD(happy) = body")
    assert vals == {"MOOD": "happy"}
    assert coll == "MOOD = body"


def test_prose_parens_not_bound():
    # `RED (camera)` is prose (no chain operator) -> not a binding.
    vals, coll = extract_inline_var_values("shot on RED (camera)")
    assert vals == {}
    assert coll == "shot on RED (camera)"


def test_value_group_not_bound():
    # `(A < B)` is a bare value group, not a NAME(value) var-call.
    vals, coll = extract_inline_var_values("X = (A < B)")
    assert vals == {}
    assert coll == "X = (A < B)"


def test_first_occurrence_wins():
    vals, _ = extract_inline_var_values("MOOD(happy) = x\nMOOD(sad) = y")
    assert vals == {"MOOD": "happy"}


def test_inline_wins_over_stored_via_resolver():
    vals, coll = extract_inline_var_values("MOOD(calm) = body")
    merged = {"MOOD": "stored-value", **vals}
    assert resolve_prompt_variables(coll, merged) == "calm = body"


def test_no_parens_is_identity():
    vals, coll = extract_inline_var_values("ACTOR1 = ACTOR2")
    assert vals == {}
    assert coll == "ACTOR1 = ACTOR2"
