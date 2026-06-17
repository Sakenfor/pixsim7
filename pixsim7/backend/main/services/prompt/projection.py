"""Structured-prompt projection: compile the chain mini-language into prose.

B1 = the ``rule_template`` engine (deterministic, recipe-template driven). The
``engine`` argument is the strategy seam: ``llm`` is reserved for a future
fluency pass and currently falls back to the rule engine (open for later),
mirroring ``primitive_projection``'s engine-tag pattern.

Pipeline position: inline-collapse -> **project** -> resolve. Projection runs on
the STRUCTURED text (vars still symbolic, operators present) so the recipe
templates match on var/prose kinds; variable substitution happens afterward on
the projected prose. Each chain line folds its operands left-to-right via the
matched recipe operator's ``template`` (``{lhs}``/``{rhs}`` placeholders);
headers and prose lines pass through unchanged.
"""
from __future__ import annotations

import json
import pathlib
from typing import Any, Callable, Dict, List, Optional

from pixsim7.backend.main.services.prompt.parser import tokenizer

ENGINE_RULE = "rule_template"
ENGINE_LLM = "llm"

_RECIPES_PATH = pathlib.Path(__file__).parent / "parser" / "relation_recipes.json"
_RECIPES_CACHE: Optional[List[Dict[str, Any]]] = None


def _recipes() -> List[Dict[str, Any]]:
    global _RECIPES_CACHE
    if _RECIPES_CACHE is None:
        try:
            data = json.loads(_RECIPES_PATH.read_text(encoding="utf-8"))
            _RECIPES_CACHE = data.get("recipes", []) or []
        except Exception:
            _RECIPES_CACHE = []
    return _RECIPES_CACHE


def _relation_kind(kind: str) -> str:
    """Recipes match on var vs body; a `value` literal relates like prose."""
    return "var" if kind == "var" else "prose"


def _elem_text(el: Dict[str, Any]) -> str:
    text = (el.get("text") or "").strip()
    if el.get("kind") == "value" and text.startswith("(") and text.endswith(")"):
        return text[1:-1].strip()  # unwrap a bare value group
    return text


def _op_char(op_text: str) -> str:
    """The semantic char of a (possibly compound) operator run — the arrowhead.
    `==>` -> `>`, `<==` -> `<`, `<=>`/`<==>` -> `>` (bidirectional collapses to
    the forward arm), bare `=`/`:` unchanged."""
    if ">" in op_text:
        return ">"
    if "<" in op_text:
        return "<"
    if "=" in op_text:
        return "="
    if ":" in op_text:
        return ":"
    return op_text[-1] if op_text else ""


def _find_template(
    recipes: List[Dict[str, Any]], prev_kind: str, next_kind: str, op_text: str
) -> Optional[str]:
    """Generic (untyped) chain recipe lookup: match line_kind/prev_kind/next_kind,
    then the operator entry by exact text, else its arrowhead char. Typed recipes
    (lhs_kind/rhs_kind) are skipped here — the fold is structural in v1."""
    head = _op_char(op_text)
    matchers: List[Callable[[Dict[str, Any]], bool]] = [
        lambda o: o.get("op") == op_text,
        lambda o: o.get("op") == head,
    ]
    for recipe in recipes:
        ctx = recipe.get("context", {})
        if ctx.get("line_kind") != "chain":
            continue
        if ctx.get("prev_kind") != prev_kind or ctx.get("next_kind") != next_kind:
            continue
        if ctx.get("lhs_kind") or ctx.get("rhs_kind"):
            continue
        ops = recipe.get("operators", [])
        for matcher in matchers:
            for op in ops:
                if matcher(op) and op.get("template"):
                    return op["template"]
    return None


def _project_chain(line: Dict[str, Any], recipes: List[Dict[str, Any]]) -> Optional[str]:
    elements = line.get("elements") or []
    operators = line.get("operators") or []
    if not operators or len(elements) != len(operators) + 1:
        return None
    acc = _elem_text(elements[0])
    acc_kind = _relation_kind(elements[0].get("kind", "prose"))
    for i, op in enumerate(operators):
        rhs_el = elements[i + 1]
        rhs = _elem_text(rhs_el)
        tmpl = _find_template(recipes, acc_kind, _relation_kind(rhs_el.get("kind", "prose")), op.get("op", ""))
        if tmpl:
            acc = tmpl.replace("{lhs}", acc).replace("{rhs}", rhs)
        else:
            acc = f"{acc} {op.get('op', '')} {rhs}".strip()  # no template — keep operator literal
        acc_kind = "prose"  # a folded result is prose for the next operator
    return acc


def project_prompt(text: str, *, engine: str = ENGINE_RULE) -> str:
    """Compile chain lines in ``text`` to prose; non-chain lines pass through.

    ``engine``: ``rule_template`` (B1) is the only implemented engine; ``llm`` is
    reserved and currently falls back to the rule engine.
    """
    if not text:
        return text
    recipes = _recipes()  # engine seam: llm not yet implemented -> rule fallback
    if not recipes:
        return text

    spans = []  # (start, end, prose) for chain lines
    for line in tokenizer.tokenize(text)["lines"]:
        if line.get("kind") != "chain":
            continue
        prose = _project_chain(line, recipes)
        if prose is not None:
            spans.append((line["start"], line["end"], prose))
    if not spans:
        return text

    out = text
    for start, end, prose in sorted(spans, key=lambda s: s[0], reverse=True):
        out = out[:start] + prose + out[end:]
    return out
