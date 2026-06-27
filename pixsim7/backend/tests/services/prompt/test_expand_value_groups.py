"""Tests for tokenizer.expand_value_groups — re-tokenizing bare ``( … )``
value-group operands into the document frame for the editor's structure layer.
"""
from pixsim7.backend.main.services.prompt.parser import tokenizer as t


def _expanded(text: str):
    base = t.tokenize(text)["lines"]
    return t.expand_value_groups(base)


def _vars(lines):
    return [e["text"] for l in lines for e in l.get("elements", []) if e["kind"] == "var"]


def test_value_group_with_chain_expands():
    text = "ACTOR1 = (MODUS < TEASE) < X"
    exp = _expanded(text)
    assert len(exp) == 1
    line = exp[0]
    assert line["kind"] == "chain"
    assert [(e["kind"], e["text"]) for e in line["elements"]] == [
        ("var", "MODUS"),
        ("var", "TEASE"),
    ]
    # Inner offsets map back into the original document frame.
    assert line["elements"][0]["start"] == text.index("MODUS")
    assert line["elements"][1]["start"] == text.index("TEASE")


def test_value_group_without_operators_does_not_expand():
    # The inner text has no chain operator -> not a chain -> contributes nothing.
    assert _expanded("X = (just prose)") == []


def test_no_groups_returns_empty():
    assert _expanded("ACTOR1 < GOAL") == []


def test_nested_groups_expand_recursively():
    text = "A = (B < (C < D))"
    assert sorted(set(_vars(_expanded(text)))) == ["B", "C", "D"]


def test_var_call_argument_is_not_a_value_group():
    # NAME(value) is a var-call (kind 'var'), not a bare value group, so its
    # parenthesised argument is opaque and does not expand.
    assert _expanded("MODUS(TEASE) < X") == []
