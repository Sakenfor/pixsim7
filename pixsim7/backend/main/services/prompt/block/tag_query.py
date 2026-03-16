"""Canonical tag-query normalization helpers for block filtering.

This module is source-neutral and should be used by primitive-first code paths.
It accepts both legacy flat ``tag_constraints`` maps and grouped ``tag_query``
objects, returning canonical ``all`` / ``any`` / ``not`` groups.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

_TAG_QUERY_GROUP_ALIASES = {
    "all": "all",
    "all_of": "all",
    "any": "any",
    "any_of": "any",
    "not": "not",
    "none_of": "not",
}


def normalize_tag_query(
    *,
    tag_constraints: Optional[Dict[str, Any]] = None,
    tag_query: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, Any]]:
    """Return canonical tag query groups: ``{'all': {}, 'any': {}, 'not': {}}``.

    Compatibility behavior:
    - legacy flat ``tag_constraints`` maps are treated as ``all`` constraints
    - a namespaced object can be passed via ``tag_query``
    - if ``tag_constraints`` already looks namespaced, it is also accepted
    """
    source = tag_query if isinstance(tag_query, dict) else None
    if source is None and isinstance(tag_constraints, dict):
        source = tag_constraints

    if not isinstance(source, dict):
        return {"all": {}, "any": {}, "not": {}}

    if any(key in source for key in _TAG_QUERY_GROUP_ALIASES):
        groups_raw: Dict[str, Any] = {"all": None, "any": None, "not": None}
        for raw_key, canonical_key in _TAG_QUERY_GROUP_ALIASES.items():
            if raw_key not in source:
                continue
            raw_group = source.get(raw_key)
            if groups_raw[canonical_key] is None:
                groups_raw[canonical_key] = raw_group
                continue
            # Merge alias + canonical declarations deterministically.
            if not isinstance(groups_raw[canonical_key], dict) or not isinstance(raw_group, dict):
                raise ValueError(
                    f"tag query group '{canonical_key}' must be an object when combining aliases"
                )
            merged = dict(groups_raw[canonical_key])
            merged.update(raw_group)
            groups_raw[canonical_key] = merged
        all_group = groups_raw["all"]
        any_group = groups_raw["any"]
        not_group = groups_raw["not"]
    else:
        all_group = source
        any_group = None
        not_group = None

    def _norm_group(group: Any) -> Dict[str, Any]:
        if not isinstance(group, dict):
            return {}
        normalized: Dict[str, Any] = {}
        for key, value in group.items():
            if value is None:
                continue
            key_str = str(key)
            if isinstance(value, list):
                cleaned = [str(v) for v in value if v is not None]
                if cleaned:
                    normalized[key_str] = cleaned
            else:
                normalized[key_str] = str(value)
        return normalized

    return {
        "all": _norm_group(all_group),
        "any": _norm_group(any_group),
        "not": _norm_group(not_group),
    }

