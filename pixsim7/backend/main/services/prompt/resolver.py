"""Prompt variable resolver (phase-2 substitution).

Replaces uppercase variable tokens (``ACTOR1``, ``ACTOR1_DETAILS``) with their
bound ``value`` text. Core rules:

* **Expand iff a value is set.** A variable with no value stays a literal
  symbol (the mini-language). Only names present in the value map expand.
* **Whole-token match.** Matches complete identifier tokens, so ``ACTOR1`` does
  not match inside ``ACTOR1_DETAILS`` or ``FOO_ACTOR1`` — only the exact token.
* **Recursive.** A value may reference other variables; resolution recurses with
  a depth cap and per-branch cycle detection (a name already being expanded is
  left symbolic rather than looping).
* **Bounded.** Distinct-name fan-out (``L0`` -> ``L1 L1 …``) is not caught by the
  cycle guard and grows ``O(fanout ** depth)``, so a running output-size budget
  caps total expansion: once exceeded, remaining tokens are left symbolic rather
  than amplifying further. Protects the shared generation worker from an OOM via
  crafted recursive variable values.
* **Escape.** A backslash before a token (``\\ACTOR1``) emits the literal name
  and skips expansion.

This is a pure string transform — no tokenizer/DB dependency — so it can run in
a preview, a test, or the outbound generation hook identically.
"""
from __future__ import annotations

import re
from typing import Mapping, Optional

from pixsim7.backend.main.services.prompt.variable_transforms import apply_transform

DEFAULT_MAX_DEPTH = 10
# Cap on total expanded output. Legitimate prompts are a few thousand chars; this
# is the safety valve against exponential fan-out (see module docstring).
DEFAULT_MAX_OUTPUT_CHARS = 100_000


def resolve_prompt_variables(
    text: str,
    values: Mapping[str, str],
    *,
    transforms: Optional[Mapping[str, str]] = None,
    max_depth: int = DEFAULT_MAX_DEPTH,
    max_output_chars: int = DEFAULT_MAX_OUTPUT_CHARS,
) -> str:
    """Resolve variable tokens in ``text`` against ``values`` (name -> value).

    Names absent from ``values`` (or with empty values) are left untouched.

    ``transforms`` (name -> transform spec) optionally post-processes an expanded
    value: the transform is applied to a variable's *fully resolved* text before
    it is spliced back in (so ``ACTOR1`` value ``"cat"`` + transform ``"spaced:__"``
    yields ``"c__a__t"``). A name with no transform expands verbatim.
    """
    if not text or not values:
        return text

    value_map = {
        name.strip().upper(): value
        for name, value in values.items()
        if isinstance(name, str) and isinstance(value, str) and value
    }
    if not value_map:
        return text

    # Longest names first so the alternation prefers ACTOR1_DETAILS over ACTOR1
    # (token boundaries already prevent prefix matches, but this is defensive).
    names = sorted(value_map.keys(), key=len, reverse=True)
    pattern = re.compile(r"(\\)?\b(" + "|".join(re.escape(n) for n in names) + r")\b")

    transform_map = {
        name.strip().upper(): spec
        for name, spec in (transforms or {}).items()
        if isinstance(name, str) and isinstance(spec, str) and spec
    }

    # Mutable budget shared across the whole (recursive) expansion tree. Once the
    # produced character count crosses the cap, further tokens stay symbolic so a
    # crafted fan-out can't balloon the output unbounded.
    budget = {"chars": 0}

    def expand(source: str, depth: int, active: frozenset[str]) -> str:
        def repl(match: re.Match[str]) -> str:
            escaped = match.group(1)
            name = match.group(2)
            if escaped:
                return name  # literal — drop the escape, do not expand
            if name in active or depth >= max_depth:
                return name  # cycle / too deep — leave the symbol in place
            if budget["chars"] >= max_output_chars:
                return name  # output budget exhausted — stop amplifying
            resolved = apply_transform(
                transform_map.get(name),
                expand(value_map[name], depth + 1, active | {name}),
            )
            budget["chars"] += len(resolved)
            return resolved

        return pattern.sub(repl, source)

    return expand(text, 0, frozenset())
