"""Prompt facet registry helpers.

Stores user-registered *facets* per entity class in
``users.preferences["prompt_facets"]``. A facet is the token after the first
``_`` in a variable (``METHODS`` in ``ACTOR1_METHODS``). Out of the box a facet
is recognised only when it matches a class's declared axis or a vocab value;
registering one here makes that facet token recognised *class-wide* — every
``ACTOR1_METHODS`` / ``ACTOR2_METHODS`` reads as a known facet, not just one
saved token.

Shape (canonical): ``{"ACTOR": ["METHODS", ...], ...}`` — class names and facet
tokens are uppercase ``^[A-Z][A-Z0-9_]*$``; each class's list is deduped + sorted
and classes with no facets are dropped. Mirrors ``variable_registry`` (user-pref
backed, validate-on-write).
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

PROMPT_FACETS_PREF_KEY = "prompt_facets"
_TOKEN_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")


def normalize_facet_class_name(raw: Any) -> str:
    """Normalize and validate an entity class name (e.g. ``ACTOR``)."""
    if not isinstance(raw, str):
        raise ValueError("Facet class name must be a string")
    name = raw.strip().upper()
    if not name:
        raise ValueError("Facet class name is required")
    if not _TOKEN_PATTERN.fullmatch(name):
        raise ValueError("Facet class name must match ^[A-Z][A-Z0-9_]*$")
    return name


def normalize_facet_token(raw: Any) -> str:
    """Normalize and validate a facet token (e.g. ``METHODS``)."""
    if not isinstance(raw, str):
        raise ValueError("Facet token must be a string")
    token = raw.strip().upper()
    if not token:
        raise ValueError("Facet token is required")
    if not _TOKEN_PATTERN.fullmatch(token):
        raise ValueError("Facet token must match ^[A-Z][A-Z0-9_]*$")
    return token


def canonicalize_prompt_facets(raw: Any) -> Dict[str, List[str]]:
    """Validate, dedupe, and sort a class→facets mapping.

    Tolerant on read: skips malformed classes/tokens rather than raising, so a
    legacy or partially-bad payload still yields the valid subset.
    """
    out: Dict[str, set[str]] = {}
    if not isinstance(raw, dict):
        return {}
    for raw_class, raw_tokens in raw.items():
        try:
            class_name = normalize_facet_class_name(raw_class)
        except ValueError:
            continue
        if not isinstance(raw_tokens, (list, tuple, set)):
            continue
        for raw_token in raw_tokens:
            try:
                token = normalize_facet_token(raw_token)
            except ValueError:
                continue
            out.setdefault(class_name, set()).add(token)
    return {cls: sorted(tokens) for cls, tokens in sorted(out.items()) if tokens}


def read_prompt_facets(preferences: Any) -> Dict[str, List[str]]:
    """Read the canonical class→facets mapping from a preferences payload."""
    if not isinstance(preferences, dict):
        return {}
    return canonicalize_prompt_facets(preferences.get(PROMPT_FACETS_PREF_KEY))


def write_prompt_facets(preferences: Any, mapping: Any) -> Dict[str, Any]:
    """Write a canonical class→facets mapping into a preferences payload.

    An empty mapping drops the key entirely.
    """
    current = dict(preferences) if isinstance(preferences, dict) else {}
    canonical = canonicalize_prompt_facets(mapping)
    if canonical:
        current[PROMPT_FACETS_PREF_KEY] = canonical
    else:
        current.pop(PROMPT_FACETS_PREF_KEY, None)
    return current


def add_prompt_facet(preferences: Any, class_name: str, facet: str) -> Dict[str, Any]:
    """Return preferences with ``facet`` registered under ``class_name``."""
    cls = normalize_facet_class_name(class_name)
    token = normalize_facet_token(facet)
    mapping = read_prompt_facets(preferences)
    tokens = set(mapping.get(cls, []))
    tokens.add(token)
    mapping[cls] = sorted(tokens)
    return write_prompt_facets(preferences, mapping)


def remove_prompt_facet(preferences: Any, class_name: str, facet: str) -> Dict[str, Any]:
    """Return preferences with ``facet`` removed from ``class_name`` (no-op if absent)."""
    cls = normalize_facet_class_name(class_name)
    token = normalize_facet_token(facet)
    mapping = read_prompt_facets(preferences)
    if cls in mapping:
        mapping[cls] = [t for t in mapping[cls] if t != token]
    return write_prompt_facets(preferences, mapping)


def facet_is_registered(preferences: Any, class_name: str, facet: str) -> bool:
    """Whether ``facet`` is registered for ``class_name``."""
    try:
        cls = normalize_facet_class_name(class_name)
        token = normalize_facet_token(facet)
    except ValueError:
        return False
    return token in read_prompt_facets(preferences).get(cls, [])
