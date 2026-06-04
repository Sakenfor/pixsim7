"""Parity & lint tests for the relation-recipes registry.

Recipes are suggestions, not validation rules — but they must stay coherent
with the grammar that produces the contexts they key on. These tests assert
the live `relation_recipes.json` (generated from tools/cue/recipes/*.cue) is
internally consistent and that every recipe references only line kinds,
operator chars, swap targets, and run-lengths the grammar actually emits.

Sibling of test_op_signature_registry.py. If a recipe drifts from the grammar
(e.g. a line_kind the tokenizer never emits, or a run_semantics key past the
operator-vocabulary cap), these fail loudly rather than silently no-op in the
editor popover.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from pixsim7.backend.main.services.prompt.parser.relation_recipes import (
    _RECIPES_PATH,
    find_recipe,
    get_relation_recipes,
    var_semantic_kind,
)
from pixsim7.backend.main.services.prompt.parser.tokenizer import (
    get_operator_vocabulary,
)

TEST_SUITE = {
    "id": "prompt-relation-recipes-registry",
    "label": "Relation Recipes Registry Parity & Lint Tests",
    "kind": "contract",
    "category": "backend/prompt-block",
    "subcategory": "relation-recipes",
    "covers": [
        "pixsim7/backend/main/services/prompt/parser/relation_recipes.py",
        "pixsim7/backend/main/services/prompt/parser/relation_recipes.json",
        "tools/cue/recipes/relation_recipes.cue",
    ],
    "order": 26.3,
}


# ---------------------------------------------------------------------------
# Grammar-derived expectations (single source of truth = generated JSON)
# ---------------------------------------------------------------------------

_GRAMMAR_PATH = (
    Path(__file__).resolve().parents[3]
    / "main" / "services" / "prompt" / "parser" / "grammar_rules.json"
)
_GRAMMAR = json.loads(_GRAMMAR_PATH.read_text(encoding="utf-8"))

# Recipe line_kind must be a header pattern id or "chain".
VALID_LINE_KINDS = {p["id"] for p in _GRAMMAR["header_patterns"]} | {"chain"}
# Operator chars the chain parser recognises.
ALLOWED_OP_CHARS = set(_GRAMMAR["chain"]["op_chars"])

_VOCAB = get_operator_vocabulary()
UNIVERSAL_SWAPS = set(_VOCAB["swap_targets"])
GLOBAL_MAX_RUN = _VOCAB["max_run_length"]
_CONTEXT_MAX_RUN = {
    c["line_kind"]: c["max_run_length"]
    for c in _VOCAB.get("contexts", [])
    if isinstance(c.get("max_run_length"), int)
}

CHAIN_ELEMENT_KINDS = {"var", "prose"}
_ID_RE = re.compile(r"^[a-z][a-z0-9_]*$")

_PAYLOAD = get_relation_recipes()
_RECIPES = _PAYLOAD["recipes"]


def _max_run_for(line_kind: str) -> int:
    return _CONTEXT_MAX_RUN.get(line_kind, GLOBAL_MAX_RUN)


def _iter_operators():
    for recipe in _RECIPES:
        for op in recipe.get("operators", []):
            yield recipe, op


# ---------------------------------------------------------------------------
# File / payload integrity
# ---------------------------------------------------------------------------

class TestPayloadIntegrity:
    def test_file_exists(self) -> None:
        assert _RECIPES_PATH.exists(), f"recipes file missing at {_RECIPES_PATH}"

    def test_version_present(self) -> None:
        assert isinstance(_PAYLOAD.get("version"), str) and _PAYLOAD["version"].strip()

    def test_recipes_nonempty(self) -> None:
        assert _RECIPES, "no recipes loaded"

    def test_ids_unique_and_well_formed(self) -> None:
        ids = [r.get("id") for r in _RECIPES]
        assert all(isinstance(i, str) and _ID_RE.match(i) for i in ids), ids
        assert len(ids) == len(set(ids)), f"duplicate recipe ids: {ids}"

    def test_every_recipe_has_a_context_and_operators(self) -> None:
        for r in _RECIPES:
            assert isinstance(r.get("context"), dict), f"{r.get('id')}: missing context"
            assert isinstance(r.get("operators"), list), f"{r.get('id')}: missing operators"


# ---------------------------------------------------------------------------
# Grammar parity — contexts must reference shapes the tokenizer emits
# ---------------------------------------------------------------------------

class TestContextGrammarParity:
    def test_line_kinds_are_grammar_known(self) -> None:
        for r in _RECIPES:
            lk = r["context"].get("line_kind")
            assert lk in VALID_LINE_KINDS, (
                f"{r['id']}: line_kind '{lk}' not in grammar {sorted(VALID_LINE_KINDS)}"
            )

    def test_prev_next_kinds_valid(self) -> None:
        for r in _RECIPES:
            for key in ("prev_kind", "next_kind"):
                val = r["context"].get(key)
                if val is not None:
                    assert val in CHAIN_ELEMENT_KINDS, f"{r['id']}: {key}='{val}'"

    def test_prev_next_only_on_chain(self) -> None:
        for r in _RECIPES:
            ctx = r["context"]
            if ctx.get("prev_kind") or ctx.get("next_kind"):
                assert ctx.get("line_kind") == "chain", (
                    f"{r['id']}: prev/next_kind set but line_kind != chain"
                )

    def test_var_kinds_imply_var_elements(self) -> None:
        for r in _RECIPES:
            ctx = r["context"]
            if ctx.get("lhs_kind") or ctx.get("rhs_kind"):
                assert ctx.get("prev_kind") == "var" and ctx.get("next_kind") == "var", (
                    f"{r['id']}: lhs/rhs_kind requires prev_kind=next_kind='var'"
                )


# ---------------------------------------------------------------------------
# Operator lint — ops, swaps, and run-lengths within grammar bounds
# ---------------------------------------------------------------------------

class TestOperatorLint:
    def test_operator_chars_are_grammar_known(self) -> None:
        for recipe, op in _iter_operators():
            for ch in op["op"]:
                assert ch in ALLOWED_OP_CHARS, (
                    f"{recipe['id']}: operator char '{ch}' (in '{op['op']}') "
                    f"not in grammar op_chars {sorted(ALLOWED_OP_CHARS)}"
                )

    def test_swap_targets_are_in_universal_vocabulary(self) -> None:
        for recipe, op in _iter_operators():
            assert op.get("swap_targets"), f"{recipe['id']}/{op['op']}: empty swap_targets"
            for tgt in op["swap_targets"]:
                assert tgt in UNIVERSAL_SWAPS, (
                    f"{recipe['id']}/{op['op']}: swap target '{tgt}' "
                    f"not in operator_vocabulary {sorted(UNIVERSAL_SWAPS)}"
                )

    def test_run_semantics_keys_in_range_and_labelled(self) -> None:
        for recipe, op in _iter_operators():
            rs = op.get("run_semantics")
            if not rs:
                continue
            cap = _max_run_for(recipe["context"].get("line_kind"))
            for key, label in rs.items():
                assert key.isdigit(), f"{recipe['id']}/{op['op']}: non-numeric run key '{key}'"
                run = int(key)
                assert 1 <= run <= cap, (
                    f"{recipe['id']}/{op['op']}: run length {run} out of range 1..{cap}"
                )
                assert isinstance(label, str) and label.strip(), (
                    f"{recipe['id']}/{op['op']}: empty label for run {run}"
                )

    def test_run_semantics_are_densified_contiguous(self) -> None:
        """Densification convention: run_semantics keys form a gap-free range
        starting at 1, so the popover shows a label at every step the user can
        reach. Loosen this test if a sparse table is ever intentional."""
        for recipe, op in _iter_operators():
            rs = op.get("run_semantics")
            if not rs:
                continue
            keys = sorted(int(k) for k in rs)
            assert keys == list(range(1, keys[-1] + 1)), (
                f"{recipe['id']}/{op['op']}: run_semantics has gaps: {keys}"
            )


# ---------------------------------------------------------------------------
# Generation-scope gates are well-formed
# ---------------------------------------------------------------------------

class TestScopeGates:
    def test_models_and_operation_types_are_string_lists(self) -> None:
        for r in _RECIPES:
            for key in ("models", "operation_types"):
                val = r["context"].get(key)
                if val is None:
                    continue
                assert isinstance(val, list) and val, f"{r['id']}: empty/invalid {key}"
                assert all(isinstance(s, str) and s.strip() for s in val), (
                    f"{r['id']}: {key} must be non-empty strings"
                )


# ---------------------------------------------------------------------------
# Resolver regression — known shapes resolve to the expected recipes
# ---------------------------------------------------------------------------

class TestResolverRegression:
    def test_colon_header(self) -> None:
        assert (find_recipe("colon") or {}).get("id") == "header_colon"

    def test_var_to_prose(self) -> None:
        hit = find_recipe("chain", prev_kind="var", next_kind="prose")
        assert (hit or {}).get("id") == "chain_var_to_prose"

    def test_generic_var_to_var(self) -> None:
        hit = find_recipe("chain", prev_kind="var", next_kind="var")
        assert (hit or {}).get("id") == "chain_var_to_var"

    def test_typed_actor_relation(self) -> None:
        hit = find_recipe(
            "chain", prev_kind="var", next_kind="var", lhs_kind="ACTOR", rhs_kind="ACTOR"
        )
        assert (hit or {}).get("id") == "chain_actor_to_actor"

    def test_operation_scoped_overlay(self) -> None:
        hit = find_recipe(
            "chain", prev_kind="var", next_kind="var", operation_type="image_to_video"
        )
        assert (hit or {}).get("id") == "chain_var_to_var_i2v"

    def test_unknown_shape_returns_none(self) -> None:
        assert find_recipe("freestanding") is None


# ---------------------------------------------------------------------------
# var_semantic_kind normalizer (mirror of frontend varSemanticKind)
# ---------------------------------------------------------------------------

class TestVarSemanticKind:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("ACTOR1", "ACTOR"),
            ("ACTOR_2", "ACTOR"),
            ("actor1", "ACTOR"),
            ("SCENE", "SCENE"),
            ("TARGET", "TARGET"),
            ("123", None),
            ("", None),
            (None, None),
        ],
    )
    def test_normalization(self, raw, expected) -> None:
        assert var_semantic_kind(raw) == expected
