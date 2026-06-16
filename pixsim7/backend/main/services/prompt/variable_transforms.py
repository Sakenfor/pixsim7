"""Prompt variable transforms (phase-2 value binding).

A *transform* is an optional post-processing function bound to a variable. When
the resolver expands a variable that carries a value, it applies the variable's
transform to the fully-resolved text before splicing it back into the prompt.
So ``ACTOR1`` with value ``"cat"`` and transform ``"spaced:__"`` resolves to
``"c__a__t"``.

This is the authoritative registry; ``apps/main/src/features/prompts/lib/
variableTransforms.ts`` mirrors it and a parity test keeps the two in lockstep
(same ids, same outputs). Keep both in sync.

Spec format: ``"id"`` or ``"id:arg"`` — the first ``:`` separates the transform
id from a single free-text argument (e.g. the separator for ``spaced``). Unknown
ids are a no-op at resolve time (forward-compatible), but writes are validated
against the registry so typos surface early.
"""
from __future__ import annotations

from typing import Callable, Optional, Tuple

# A transform takes the resolved value text and an optional argument string and
# returns the transformed text. Pure; never raises on normal input.
TransformFn = Callable[[str, Optional[str]], str]


def _spaced(value: str, arg: Optional[str]) -> str:
    """Insert ``arg`` (default a single space) between every character."""
    separator = arg if arg is not None and arg != "" else " "
    return separator.join(value)


def _upper(value: str, _arg: Optional[str]) -> str:
    return value.upper()


def _lower(value: str, _arg: Optional[str]) -> str:
    return value.lower()


def _flank(value: str, arg: Optional[str]) -> str:
    """Wrap each character with its lowercase on both sides, joined by ``arg``
    (default ``___``): ``"AB"`` -> ``"aAa___bBb"``."""
    separator = arg if arg is not None and arg != "" else "___"
    return separator.join(f"{c.lower()}{c}{c.lower()}" for c in value)


# id -> fn. Seed set; extend here (and in the TS mirror) to add transforms.
TRANSFORMS: dict[str, TransformFn] = {
    "spaced": _spaced,
    "upper": _upper,
    "lower": _lower,
    "flank": _flank,
}


def parse_transform_spec(spec: str) -> Tuple[str, Optional[str]]:
    """Split a spec string into ``(id, arg)``; arg is ``None`` when absent.

    The id is lower-cased and trimmed; the arg keeps its exact characters (it may
    be the separator ``__`` or even whitespace).
    """
    head, sep, tail = spec.partition(":")
    transform_id = head.strip().lower()
    arg = tail if sep else None
    return transform_id, arg


def is_known_transform(spec: str) -> bool:
    """Whether ``spec``'s id resolves to a registered transform."""
    transform_id, _ = parse_transform_spec(spec)
    return transform_id in TRANSFORMS


def apply_transform(spec: Optional[str], value: str) -> str:
    """Apply the transform named by ``spec`` to ``value``.

    No-op (returns ``value`` unchanged) when ``spec`` is empty or its id is not
    registered, so an unknown/newer transform degrades gracefully rather than
    erroring on the outbound path.
    """
    if not spec:
        return value
    transform_id, arg = parse_transform_spec(spec)
    fn = TRANSFORMS.get(transform_id)
    if fn is None:
        return value
    return fn(value, arg)
