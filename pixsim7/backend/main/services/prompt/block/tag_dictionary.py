"""Canonical prompt-block tag metadata + alias normalization helpers.

Source of truth is the registry-backed `prompt_block_tags` vocabulary.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple


def _registry_prompt_block_tag_dictionary() -> Dict[str, Dict[str, Any]]:
    """Load prompt-block tag schema from VocabularyRegistry (source of truth)."""
    try:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

        registry = get_registry()
        items = registry.all_prompt_block_tags()
    except Exception:
        return {}

    out: Dict[str, Dict[str, Any]] = {}
    for item in items:
        key = str(getattr(item, "id", "") or "").strip()
        if not key:
            continue
        raw = dict(getattr(item, "data", {}) or {})
        out[key] = {
            "description": raw.get("description", ""),
            "data_type": raw.get("data_type", "string"),
            "allowed_values": raw.get("allowed_values", []) or [],
            "aliases": raw.get("aliases", []) or [],
            "value_aliases": raw.get("value_aliases", {}) or {},
            "applies_to": raw.get("applies_to", []) or [],
            "status": raw.get("status", "active"),
            **({"label": raw.get("label")} if raw.get("label") is not None else {}),
        }
    return out


def get_canonical_block_tag_dictionary() -> Dict[str, Dict[str, Any]]:
    """Return canonical prompt-block tag dictionary from VocabularyRegistry."""
    return _registry_prompt_block_tag_dictionary()


def get_block_tag_alias_key_map() -> Dict[str, str]:
    """Return alias key -> canonical key mapping."""
    alias_map: Dict[str, str] = {}
    for canonical_key, meta in get_canonical_block_tag_dictionary().items():
        for alias in meta.get("aliases") or []:
            alias_map[str(alias)] = canonical_key
    return alias_map


def get_block_tag_value_alias_map() -> Dict[str, Dict[str, str]]:
    """Return canonical_key -> {alias_value: canonical_value} mapping."""
    result: Dict[str, Dict[str, str]] = {}
    for canonical_key, meta in get_canonical_block_tag_dictionary().items():
        value_aliases = meta.get("value_aliases") or {}
        if isinstance(value_aliases, dict) and value_aliases:
            result[canonical_key] = {str(k): str(v) for k, v in value_aliases.items()}
    return result


def list_canonical_block_tag_keys() -> List[str]:
    return sorted(get_canonical_block_tag_dictionary().keys())


def _normalize_scalar_tag_value(
    key: str,
    value: Any,
    *,
    apply_value_aliases: bool,
) -> Tuple[Any, List[Dict[str, str]]]:
    if not apply_value_aliases:
        return value, []
    if not isinstance(value, str):
        return value, []
    value_aliases = (get_canonical_block_tag_dictionary().get(key) or {}).get("value_aliases") or {}
    if not isinstance(value_aliases, dict):
        return value, []
    mapped = value_aliases.get(value)
    if mapped is None:
        return value, []
    return str(mapped), [{"key": key, "from_value": value, "to_value": str(mapped)}]


def normalize_block_tags(
    tags: Dict[str, Any],
    *,
    apply_value_aliases: bool = True,
) -> Dict[str, Any]:
    """Normalize prompt-block tags to canonical keys/value aliases (non-mutating).

    Returns a structured payload suitable for API responses and tooling.
    """
    alias_key_map = get_block_tag_alias_key_map()
    canonical_keys = set(get_canonical_block_tag_dictionary().keys())

    normalized: Dict[str, Any] = {}
    key_sources: Dict[str, str] = {}  # canonical | alias | unknown
    key_changes: List[Dict[str, str]] = []
    value_changes: List[Dict[str, str]] = []
    warnings: List[Dict[str, Any]] = []
    unknown_keys: List[str] = []
    alias_keys_seen: List[str] = []

    if not isinstance(tags, dict):
        return {
            "normalized_tags": {},
            "changed": False,
            "key_changes": [],
            "value_changes": [],
            "warnings": [{"kind": "invalid_input", "message": "tags must be an object"}],
            "unknown_keys": [],
            "alias_keys_seen": [],
        }

    for raw_key, raw_value in tags.items():
        key = str(raw_key)
        canonical_key = alias_key_map.get(key, key)
        source_kind = "alias" if key in alias_key_map else ("canonical" if key in canonical_keys else "unknown")

        if source_kind == "alias":
            alias_keys_seen.append(key)
            key_changes.append({"from_key": key, "to_key": canonical_key})
        elif source_kind == "unknown":
            unknown_keys.append(key)

        normalized_value = raw_value
        local_value_changes: List[Dict[str, str]] = []
        if isinstance(raw_value, list):
            normalized_list: List[Any] = []
            seen_scalars: set[str] = set()
            for item in raw_value:
                item_value, item_changes = _normalize_scalar_tag_value(
                    canonical_key,
                    item,
                    apply_value_aliases=apply_value_aliases,
                )
                local_value_changes.extend(item_changes)
                if isinstance(item_value, (str, int, float, bool)) or item_value is None:
                    dedupe_key = repr(item_value)
                    if dedupe_key in seen_scalars:
                        continue
                    seen_scalars.add(dedupe_key)
                normalized_list.append(item_value)
            normalized_value = normalized_list
        elif isinstance(raw_value, dict):
            # Nested dict tag values are allowed but not canonicalized deeply yet.
            warnings.append(
                {
                    "kind": "nested_value_passthrough",
                    "key": canonical_key,
                    "message": f"Nested tag value for '{canonical_key}' was passed through without normalization.",
                }
            )
        else:
            normalized_value, local_value_changes = _normalize_scalar_tag_value(
                canonical_key,
                raw_value,
                apply_value_aliases=apply_value_aliases,
            )

        value_changes.extend(local_value_changes)

        if canonical_key not in normalized:
            normalized[canonical_key] = normalized_value
            key_sources[canonical_key] = source_kind
            continue

        existing_value = normalized[canonical_key]
        existing_source = key_sources.get(canonical_key, "unknown")
        if existing_value == normalized_value:
            warnings.append(
                {
                    "kind": "duplicate_key_same_value",
                    "key": canonical_key,
                    "message": f"Duplicate key '{canonical_key}' resolved to same value; kept one entry.",
                }
            )
            continue

        # Conflict resolution policy:
        # - canonical key wins over alias-derived key
        # - otherwise keep first seen and warn
        if existing_source == "alias" and source_kind == "canonical":
            normalized[canonical_key] = normalized_value
            key_sources[canonical_key] = source_kind
            warnings.append(
                {
                    "kind": "key_conflict_replaced_by_canonical",
                    "key": canonical_key,
                    "message": f"Canonical key '{canonical_key}' replaced conflicting alias-derived value.",
                    "kept_source": "canonical",
                }
            )
        else:
            warnings.append(
                {
                    "kind": "key_conflict_kept_first",
                    "key": canonical_key,
                    "message": f"Conflicting values for '{canonical_key}'; kept first value.",
                    "kept_source": existing_source,
                    "discarded_source": source_kind,
                }
            )

    return {
        "normalized_tags": normalized,
        "changed": (normalized != tags) or bool(key_changes) or bool(value_changes),
        "key_changes": key_changes,
        "value_changes": value_changes,
        "warnings": warnings,
        "unknown_keys": sorted(set(unknown_keys)),
        "alias_keys_seen": sorted(set(alias_keys_seen)),
    }
