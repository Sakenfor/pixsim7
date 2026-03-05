"""Helpers for block capability normalization and derivation."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def normalize_capability_ids(value: Any) -> List[str]:
    """Normalize raw capability values into unique non-empty strings."""
    if value is None:
        return []
    if isinstance(value, str):
        raw_values = [value]
    elif isinstance(value, (list, tuple, set)):
        raw_values = list(value)
    else:
        raw_values = [value]

    normalized: List[str] = []
    seen: set[str] = set()
    for raw in raw_values:
        text = str(raw).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized


def role_capabilities_from_tags(tags: Optional[Dict[str, Any]]) -> List[str]:
    """Derive role capabilities from tags.role (string or list)."""
    if not isinstance(tags, dict):
        return []
    raw_role = tags.get("role")
    if raw_role is None:
        return []
    if isinstance(raw_role, str):
        role_values = [raw_role]
    elif isinstance(raw_role, list):
        role_values = raw_role
    else:
        role_values = [raw_role]
    return [f"role:{role}" for role in normalize_capability_ids(role_values)]


def derive_block_capabilities(
    *,
    category: Optional[str],
    tags: Optional[Dict[str, Any]] = None,
    declared: Any = None,
    include_category: bool = True,
) -> List[str]:
    """Derive canonical capability IDs for a primitive block."""
    caps: List[str] = []
    category_text = str(category).strip() if isinstance(category, str) else ""
    if include_category and category_text:
        caps.append(category_text)
        if category_text.endswith("_modifier"):
            caps.append("wardrobe_modifier" if category_text == "wardrobe_modifier" else category_text)
    caps.extend(normalize_capability_ids(declared))
    caps.extend(role_capabilities_from_tags(tags))
    return normalize_capability_ids(caps)
