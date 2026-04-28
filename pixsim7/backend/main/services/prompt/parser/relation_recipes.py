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
    _RAW = {"version": "1.0.0", "recipes": []}


def get_relation_recipes() -> Dict[str, Any]:
    """Return the full relation_recipes payload (version + recipes list).

    Returned dict shape:
        {
            "version": "1.0.0",
            "recipes": [
                {
                    "id": "...",
                    "label": "...",
                    "context": {"line_kind": "header"|"relation", "pattern": "..."},
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
        "version": _RAW.get("version", "1.0.0"),
        "recipes": list(_RAW.get("recipes", [])),
    }


def find_recipe(line_kind: str, pattern: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Match a recipe to the given context.

    Resolution order:
      1. Exact (line_kind, pattern) match
      2. line_kind match without pattern constraint
      3. None (caller falls back to grammar.operator_vocabulary)
    """
    recipes: List[Dict[str, Any]] = _RAW.get("recipes", []) or []

    if pattern:
        for r in recipes:
            ctx = r.get("context") or {}
            if ctx.get("line_kind") == line_kind and ctx.get("pattern") == pattern:
                return r

    for r in recipes:
        ctx = r.get("context") or {}
        if ctx.get("line_kind") == line_kind and not ctx.get("pattern"):
            return r

    return None
