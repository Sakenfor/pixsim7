"""
Tests for the narrative/prompt condition evaluator (recursive-descent parser).

Covers the capability ported from the retired frontend conditionEvaluator.ts:
parentheses, NOT, operator precedence, plus backward-compat for the simple
AND/OR/BETWEEN forms the prior string-splitter handled.
"""

from pixsim7.backend.main.domain.narrative.programs import ConditionExpression


def ev(expr: str, **vars) -> bool:
    return ConditionExpression(expression=expr).evaluate(vars)


# --- Backward compatibility (simple forms the old splitter handled) --------

def test_simple_comparison():
    assert ev("affinity >= 60", affinity=60) is True
    assert ev("affinity >= 60", affinity=59) is False


def test_and_chain():
    assert ev("affinity >= 60 && trust > 50", affinity=70, trust=60) is True
    assert ev("affinity >= 60 && trust > 50", affinity=70, trust=40) is False


def test_or_chain():
    assert ev("affinity > 90 || trust > 50", affinity=10, trust=60) is True
    assert ev("affinity > 90 || trust > 50", affinity=10, trust=10) is False


def test_between():
    assert ev("affinity BETWEEN 60 AND 80", affinity=70) is True
    assert ev("affinity BETWEEN 60 AND 80", affinity=90) is False


def test_bare_boolean_variable():
    assert ev("hasMet", hasMet=True) is True
    assert ev("hasMet", hasMet=False) is False
    # Missing variable defaults to 0 -> falsy
    assert ev("hasMet") is False


def test_string_equality():
    assert ev("tier == 'friend'", tier="friend") is True
    assert ev('tier != "stranger"', tier="friend") is True


# --- New capability: NOT, precedence, parentheses --------------------------

def test_not_operator():
    assert ev("!hasMet", hasMet=False) is True
    assert ev("!hasMet", hasMet=True) is False
    assert ev("NOT hasMet", hasMet=False) is True


def test_parentheses_grouping():
    # Without grouping precedence: a OR (b AND c)
    # 50>50 is False, trust>30 True, chem>40 True -> False || (True&&True) = True
    assert ev("affinity > 50 && (trust > 30 || chemistry > 40)",
              affinity=60, trust=20, chemistry=50) is True
    # affinity fails -> whole AND is False
    assert ev("affinity > 50 && (trust > 30 || chemistry > 40)",
              affinity=40, trust=99, chemistry=99) is False


def test_operator_precedence_and_binds_tighter_than_or():
    # a || b && c  ==  a || (b && c)
    # a=True so whole is True regardless of b&&c
    assert ev("a || b && c", a=1, b=0, c=0) is True
    # a False, b True, c False -> b&&c False -> overall False
    assert ev("a || b && c", a=0, b=1, c=0) is False
    # a False, b True, c True -> True
    assert ev("a || b && c", a=0, b=1, c=1) is True


def test_not_with_parentheses():
    assert ev("!(affinity > 50)", affinity=40) is True
    assert ev("!(affinity > 50)", affinity=60) is False


# --- Dot-path resolution ---------------------------------------------------

def test_nested_flag_dot_path():
    assert ev("flags.hasMetBefore == true", flags={"hasMetBefore": True}) is True
    assert ev("flags.romance.stage >= 2",
              flags={"romance": {"stage": 3}}) is True
    # Missing nested path defaults to 0
    assert ev("flags.missing.deep >= 1", flags={}) is False


def test_exact_dotted_key_wins_over_nested_walk():
    # Flat map with a literal dotted key still resolves by exact match first.
    assert ev("a.b == 5", **{"a.b": 5}) is True


# --- Robustness ------------------------------------------------------------

def test_empty_expression_is_true():
    assert ev("") is True
    assert ev("   ") is True


def test_malformed_expression_fails_closed():
    assert ev("affinity >= ") is False
    assert ev("(affinity > 5") is False
    assert ev("affinity @@ 5") is False
