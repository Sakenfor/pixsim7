"""
Relation recipe loader.

Recipes describe what the prompt grammar *knows about* — they're
suggestions surfaced in the editor's click-to-edit popover, not
validation rules. The grammar layer accepts any operator combination;
recipes only add semantic labels and recommended swaps for known
patterns.

Loaded from `relation_recipes.json` at module import. Source-of-truth
lives in `tools/cue/recipes/*.cue`; the JSON is the generated runtime
artifact. Regenerate with `pnpm cue:recipes:gen` (CI guards drift via
`pnpm cue:recipes:check`). Do not hand-edit the JSON.
"""
from __future__ import annotations

import json
import pathlib
import re
from typing import Any, Dict, List, Optional

_RECIPES_PATH = pathlib.Path(__file__).parent / "relation_recipes.json"

try:
    _RAW: Dict[str, Any] = json.loads(_RECIPES_PATH.read_text(encoding="utf-8"))
except FileNotFoundError:
    _RAW = {"version": "2.0.0", "recipes": []}


def get_relation_recipes() -> Dict[str, Any]:
    """Return the full relation_recipes payload (version + recipes list).

    Returned dict shape::

        {
            "version": "2.0.0",
            "recipes": [
                {
                    "id": "...",
                    "label": "...",
                    "context": {
                        "line_kind": "chain"|"colon"|"angle_bracket"|"freestanding",
                        "prev_kind": "var"|"prose"|null,    # chain only
                        "next_kind": "var"|"prose"|null,    # chain only
                    },
                    "operators": [
                        {"op": "<", "meaning": "...", "run_semantics": {...},
                         "swap_targets": [...], "notes": [...]},
                        ...
                    ],
                    "notes": [...]
                },
                ...
            ]
        }
    """
    return {
        "version": _RAW.get("version", "2.0.0"),
        "recipes": list(_RAW.get("recipes", [])),
    }


def var_semantic_kind(text: Optional[str]) -> Optional[str]:
    """Normalize a variable's text to its semantic-kind family.

    Uppercases and strips a trailing numeric index (with optional separating
    underscore): ``ACTOR1`` -> ``ACTOR``, ``ACTOR_2`` -> ``ACTOR``,
    ``SCENE`` -> ``SCENE``. Returns ``None`` for empty/index-only input.

    Mirror of the frontend ``varSemanticKind`` (useRelationRecipes.ts).
    """
    if not text:
        return None
    family = re.sub(r"_?\d+$", "", text.strip().upper())
    return family or None


def _recipe_model_eligible(
    recipe: Dict[str, Any],
    model_id: Optional[str],
    operation_type: Optional[str],
) -> bool:
    """True when the active model/operation passes a recipe's scope gates."""
    ctx = recipe.get("context") or {}
    models = ctx.get("models") or []
    op_types = ctx.get("operation_types") or []
    if models and not (model_id and model_id in models):
        return False
    if op_types and not (operation_type and operation_type in op_types):
        return False
    return True


def _recipe_is_scoped(recipe: Dict[str, Any]) -> bool:
    """True when a recipe declares any generation-scope gate."""
    ctx = recipe.get("context") or {}
    return bool(ctx.get("models") or ctx.get("operation_types"))


def find_recipe(
    line_kind: str,
    *,
    prev_kind: Optional[str] = None,
    next_kind: Optional[str] = None,
    lhs_kind: Optional[str] = None,
    rhs_kind: Optional[str] = None,
    model_id: Optional[str] = None,
    operation_type: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Match a recipe to the given context.

    Structural specificity is the primary axis; generation-scope is the
    tiebreaker within each tier. Resolution order (most-specific first):
      1. (line_kind, prev_kind, next_kind, lhs_kind, rhs_kind) — typed
         relation; only when both var kinds are supplied.
      2. (line_kind, prev_kind, next_kind) exact, on recipes that do NOT
         declare lhs/rhs (those are tier-1 only).
      3. line_kind only (no prev/next constraints)
      4. None (caller falls back to grammar.operator_vocabulary)
    Recipes excluded by their model/operation gates are dropped up front; a
    scoped recipe beats an unscoped one within the same tier.

    Mirror of the frontend ``matchRecipe`` (useRelationRecipes.ts); kept in
    sync for parity. `line_kind` values follow tokenizer line node kinds:
      - "chain"          — chain line (var|prose elements + operators)
      - "colon"          — colon header
      - "angle_bracket"  — >LABEL< header (no clickable operator today)
      - "freestanding"   — bare UPPER_IDENT line (no operator)
    """
    recipes: List[Dict[str, Any]] = _RAW.get("recipes", []) or []
    eligible = [r for r in recipes if _recipe_model_eligible(r, model_id, operation_type)]

    def pick(pred) -> Optional[Dict[str, Any]]:
        candidates = [r for r in eligible if pred(r)]
        scoped = next((r for r in candidates if _recipe_is_scoped(r)), None)
        if scoped is not None:
            return scoped
        return next((r for r in candidates if not _recipe_is_scoped(r)), None)

    # Tier 1: fully-typed relation (both sides are vars of named kinds).
    if prev_kind is not None and next_kind is not None and lhs_kind and rhs_kind:
        hit = pick(
            lambda r: (
                (r.get("context") or {}).get("line_kind") == line_kind
                and (r.get("context") or {}).get("prev_kind") == prev_kind
                and (r.get("context") or {}).get("next_kind") == next_kind
                and (r.get("context") or {}).get("lhs_kind") == lhs_kind
                and (r.get("context") or {}).get("rhs_kind") == rhs_kind
            )
        )
        if hit is not None:
            return hit

    # Tier 2: prev/next exact, ignoring var kinds — skip recipes that declare
    # lhs/rhs (a typed recipe must not be chosen for a non-matching var pair).
    if prev_kind is not None and next_kind is not None:
        hit = pick(
            lambda r: (
                (r.get("context") or {}).get("line_kind") == line_kind
                and (r.get("context") or {}).get("prev_kind") == prev_kind
                and (r.get("context") or {}).get("next_kind") == next_kind
                and not (r.get("context") or {}).get("lhs_kind")
                and not (r.get("context") or {}).get("rhs_kind")
            )
        )
        if hit is not None:
            return hit

    # Tier 3: line_kind alone.
    return pick(
        lambda r: (
            (r.get("context") or {}).get("line_kind") == line_kind
            and not (r.get("context") or {}).get("prev_kind")
            and not (r.get("context") or {}).get("next_kind")
        )
    )
