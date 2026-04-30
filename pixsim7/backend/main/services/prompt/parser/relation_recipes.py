"""
Relation recipe loader.

Recipes describe what the prompt grammar *knows about* — they're
suggestions surfaced in the editor's click-to-edit popover, not
validation rules. The grammar layer accepts any operator combination;
recipes only add semantic labels and recommended swaps for known
patterns.

Loaded from `relation_recipes.json` at module import. Source-of-truth
lives in `tools/cue/recipes/*.cue`; the JSON is the runtime artifact
(hand-maintained until CUE codegen is wired up).
"""
from __future__ import annotations

import json
import pathlib
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


def find_recipe(
    line_kind: str,
    *,
    prev_kind: Optional[str] = None,
    next_kind: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Match a recipe to the given context.

    Resolution order (most-specific first):
      1. (line_kind, prev_kind, next_kind) exact
      2. line_kind only (no prev/next constraints)
      3. None (caller falls back to grammar.operator_vocabulary)

    `line_kind` values follow tokenizer line node kinds:
      - "chain"          — chain line (var|prose elements + operators)
      - "colon"          — colon header
      - "angle_bracket"  — >LABEL< header (no clickable operator today)
      - "freestanding"   — bare UPPER_IDENT line (no operator)
    """
    recipes: List[Dict[str, Any]] = _RAW.get("recipes", []) or []

    if prev_kind is not None and next_kind is not None:
        for r in recipes:
            ctx = r.get("context") or {}
            if (
                ctx.get("line_kind") == line_kind
                and ctx.get("prev_kind") == prev_kind
                and ctx.get("next_kind") == next_kind
            ):
                return r

    for r in recipes:
        ctx = r.get("context") or {}
        if (
            ctx.get("line_kind") == line_kind
            and not ctx.get("prev_kind")
            and not ctx.get("next_kind")
        ):
            return r

    return None
