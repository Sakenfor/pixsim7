"""Inline ``VAR(value)`` extraction (tokenizer-gated).

The prompt mini-language allows a parameterised variable ``NAME(value)`` as a
chain operand (e.g. ``ACTOR2_PERSONALITY(very shy)``), declaring an inline value
bound to ``NAME``. This module pulls those bindings out and collapses
``NAME(value)`` -> ``NAME`` so the resolver can substitute them, with inline
values winning over a saved variable's stored value.

Gated by the tokenizer (chain context only) so incidental ``UPPER (text)`` in
prose — ``shot on RED (camera)`` — is NOT mistaken for a binding. The collapse
keeps the bare ``NAME`` token in place; the resolver then expands it (the inline
value is merged into the value map upstream).
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from pixsim7.backend.main.services.prompt.parser import tokenizer


def _split_var_call(text: str) -> Tuple[str, Optional[str]]:
    """Split a var element's text into ``(name, value)``; value is None when the
    element is a plain var (no ``(...)`` suffix). Whitespace between the name and
    ``(`` is tolerated (mirrors the FE ``splitVarCall``)."""
    open_i = text.find("(")
    if open_i <= 0 or not text.endswith(")"):
        return text, None
    return text[:open_i].rstrip(), text[open_i + 1 : -1]


def extract_inline_var_values(text: str) -> Tuple[Dict[str, str], str]:
    """Return ``(inline_values, collapsed_text)``.

    ``inline_values`` maps NAME -> value for each ``NAME(value)`` chain var
    (first occurrence wins). ``collapsed_text`` is ``text`` with every
    ``NAME(value)`` reduced to ``NAME``. Both are empty/identity when there are
    no inline bindings.
    """
    if not text or "(" not in text:
        return {}, text

    lines = tokenizer.tokenize(text)["lines"]
    inline: Dict[str, str] = {}
    spans: List[Tuple[int, int]] = []  # (remove_start, remove_end) for the `(value)` suffix

    for line in lines:
        if line.get("kind") != "chain":
            continue
        for el in line.get("elements", []):
            if el.get("kind") != "var":
                continue
            name, value = _split_var_call(el.get("text", ""))
            if value is None:
                continue
            up = name.strip().upper()
            if up and up not in inline:
                inline[up] = value
            # Collapse NAME(value) -> NAME: drop everything after the name token.
            # el["start"] is the first char of the element text (the name).
            spans.append((el["start"] + len(name), el["end"]))

    if not spans:
        return inline, text

    out = text
    for start, end in sorted(spans, reverse=True):  # right-to-left keeps offsets valid
        out = out[:start] + out[end:]
    return inline, out
