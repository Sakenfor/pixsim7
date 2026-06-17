"""Tests for rule-based structured-prompt projection (B1)."""
from pixsim7.backend.main.services.prompt.projection import ENGINE_LLM, project_prompt


def test_var_to_var_influence():
    assert project_prompt("ACTOR1 < MOOD") == "ACTOR1 influenced by MOOD"


def test_multi_op_left_fold_var_then_prose():
    # ACTOR2_HIP < MODUS_OPERANDI (TEASE) < DELIBERATE
    #  fold1 (var<var)  : ACTOR2_HIP influenced by MODUS_OPERANDI (TEASE)
    #  fold2 (prose<var): … shaped by DELIBERATE
    out = project_prompt("ACTOR2_HIP < MODUS_OPERANDI (TEASE) < DELIBERATE")
    assert out == "ACTOR2_HIP influenced by MODUS_OPERANDI (TEASE) shaped by DELIBERATE"


def test_var_to_prose_definition():
    assert project_prompt("SCENE = a rainy alley") == "SCENE: a rainy alley"


def test_value_group_unwrapped():
    # X = (calm and slow)  -> var=value -> "X: calm and slow"
    assert project_prompt("X = (calm and slow)") == "X: calm and slow"


def test_header_and_prose_pass_through():
    assert project_prompt("CAMERA:") == "CAMERA:"
    assert project_prompt("a plain sentence") == "a plain sentence"


def test_no_template_keeps_operator_literal():
    # `?` has no template anywhere -> operator survives.
    assert project_prompt("A ? B") == "A ? B"


def test_llm_engine_falls_back_to_rule():
    assert project_prompt("ACTOR1 < MOOD", engine=ENGINE_LLM) == "ACTOR1 influenced by MOOD"
