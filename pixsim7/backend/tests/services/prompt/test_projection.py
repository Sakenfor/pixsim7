"""Tests for rule-based structured-prompt projection (B1)."""
from pixsim7.backend.main.services.prompt.inline_values import extract_inline_var_values
from pixsim7.backend.main.services.prompt.projection import ENGINE_LLM, project_prompt
from pixsim7.backend.main.services.prompt.resolver import resolve_prompt_variables
from pixsim7.backend.main.services.prompt.variable_registry import (
    read_prompt_projection_mode,
    write_prompt_projection_mode,
)


def test_pipeline_inline_project_resolve():
    # The provider_service order: inline-collapse -> project -> resolve.
    text = "ACTOR2_HIP < MODUS_OPERANDI(tease) < DELIBERATE"
    inline, collapsed = extract_inline_var_values(text)
    projected = project_prompt(collapsed, engine="rule_template")
    out = resolve_prompt_variables(projected, inline)
    assert out == "ACTOR2_HIP influenced by tease shaped by DELIBERATE"


def test_projection_mode_pref_roundtrip():
    assert read_prompt_projection_mode({}) == "off"
    prefs = write_prompt_projection_mode({}, "rule_template")
    assert read_prompt_projection_mode(prefs) == "rule_template"
    assert read_prompt_projection_mode(write_prompt_projection_mode(prefs, "bogus")) == "off"
    assert "prompt_projection" not in write_prompt_projection_mode(prefs, "off")


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
