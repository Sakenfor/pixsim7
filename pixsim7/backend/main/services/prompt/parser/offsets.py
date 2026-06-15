"""Shared UTF-16 offset helpers for the prompt analysis layer.

The tokenizer and the simple parser scan by Python code point, but the public
analysis output expresses offsets (token spans AND candidate ``start_pos`` /
``end_pos``) in **UTF-16 code units** so they line up with the TS tokenizer
(packages/core/prompt/src) and CodeMirror document positions — including on
astral characters (emoji), where one code point is two UTF-16 units.

These helpers remap code-point indices to UTF-16, building a prefix map over the
SAME text the offsets are relative to. For BMP-only text the two frames coincide,
so callers gate on :func:`has_astral` to keep the common path (and committed
fixtures) byte-stable.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List


def has_astral(text: str) -> bool:
    """True if *text* contains a char outside the BMP (needs a UTF-16 remap)."""
    return any(ord(ch) > 0xFFFF for ch in text)


def build_utf16_prefix(text: str) -> List[int]:
    """``prefix[i]`` = number of UTF-16 code units in ``text[:i]``.

    A char outside the BMP (code point > U+FFFF) is one Python code point but two
    UTF-16 units; everything else is one of each. ``prefix`` has ``len(text) + 1``
    entries, so any valid code-point offset in ``[0, len(text)]`` indexes it.
    """
    prefix = [0] * (len(text) + 1)
    total = 0
    for idx, ch in enumerate(text):
        total += 2 if ord(ch) > 0xFFFF else 1
        prefix[idx + 1] = total
    return prefix


def remap_candidate_positions(candidates: Iterable[Dict[str, Any]], text: str) -> None:
    """In-place remap of candidate ``start_pos``/``end_pos`` code point -> UTF-16.

    ``text`` is the frame the positions are relative to (the same text handed to
    the parser). ``None`` positions (e.g. LLM candidates carry no offsets) pass
    through untouched. A no-op for BMP-only text.
    """
    if not has_astral(text):
        return
    prefix = build_utf16_prefix(text)
    for cand in candidates:
        for key in ("start_pos", "end_pos"):
            pos = cand.get(key)
            if isinstance(pos, int) and 0 <= pos < len(prefix):
                cand[key] = prefix[pos]
