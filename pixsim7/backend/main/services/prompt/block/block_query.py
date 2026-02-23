"""Shared PromptBlock query builder.

Centralizes block filtering logic used by template slot matching and block search APIs.
Supports canonical tag query groups (``all`` / ``any`` / ``not``) while remaining
backward-compatible with legacy flat ``tag_constraints`` maps.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from sqlalchemy import func, or_, select

from pixsim7.backend.main.domain.prompt import PromptBlock


_COMPLEXITY_ORDER = ["simple", "moderate", "complex", "very_complex"]
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


def build_prompt_block_query(
    *,
    role: Optional[str] = None,
    category: Optional[str] = None,
    kind: Optional[str] = None,
    intent: Optional[str] = None,
    package_name: Optional[str] = None,
    complexity_min: Optional[str] = None,
    complexity_max: Optional[str] = None,
    min_rating: Optional[float] = None,
    tag_constraints: Optional[Dict[str, Any]] = None,
    tag_query: Optional[Dict[str, Any]] = None,
    exclude_block_ids: Optional[Iterable[Any]] = None,
    is_public: Optional[bool] = None,
    text_query: Optional[str] = None,
):
    """Build a SQLAlchemy select for PromptBlock with shared filter semantics."""
    query = select(PromptBlock)

    if role:
        query = query.where(PromptBlock.role == role)
    if category:
        query = query.where(PromptBlock.category == category)
    if kind:
        query = query.where(PromptBlock.kind == kind)
    if intent:
        query = query.where(PromptBlock.default_intent == intent)
    if package_name:
        query = query.where(PromptBlock.package_name == package_name)

    if complexity_min or complexity_max:
        min_idx = (
            _COMPLEXITY_ORDER.index(complexity_min)
            if complexity_min and complexity_min in _COMPLEXITY_ORDER
            else 0
        )
        max_idx = (
            _COMPLEXITY_ORDER.index(complexity_max)
            if complexity_max and complexity_max in _COMPLEXITY_ORDER
            else len(_COMPLEXITY_ORDER) - 1
        )
        allowed = _COMPLEXITY_ORDER[min_idx : max_idx + 1]
        query = query.where(PromptBlock.complexity_level.in_(allowed))

    if min_rating is not None:
        query = query.where(PromptBlock.avg_rating >= min_rating)

    tag_groups = normalize_tag_query(tag_constraints=tag_constraints, tag_query=tag_query)

    for tag_key, tag_value in tag_groups["all"].items():
        extracted = func.jsonb_extract_path_text(PromptBlock.tags, str(tag_key))
        if isinstance(tag_value, list):
            if not tag_value:
                continue
            query = query.where(extracted.in_(tag_value))
        else:
            query = query.where(extracted == str(tag_value))

    any_clauses = []
    for tag_key, tag_value in tag_groups["any"].items():
        extracted = func.jsonb_extract_path_text(PromptBlock.tags, str(tag_key))
        if isinstance(tag_value, list):
            if not tag_value:
                continue
            any_clauses.append(extracted.in_(tag_value))
        else:
            any_clauses.append(extracted == str(tag_value))
    if any_clauses:
        query = query.where(or_(*any_clauses))

    for tag_key, tag_value in tag_groups["not"].items():
        extracted = func.jsonb_extract_path_text(PromptBlock.tags, str(tag_key))
        if isinstance(tag_value, list):
            if not tag_value:
                continue
            query = query.where(or_(extracted.is_(None), extracted.notin_(tag_value)))
        else:
            query = query.where(or_(extracted.is_(None), extracted != str(tag_value)))

    if exclude_block_ids:
        query = query.where(PromptBlock.id.notin_(exclude_block_ids))

    if is_public is not None:
        query = query.where(PromptBlock.is_public == is_public)

    if text_query:
        pattern = f"%{text_query}%"
        query = query.where(
            or_(
                PromptBlock.block_id.ilike(pattern),
                PromptBlock.text.ilike(pattern),
            )
        )

    return query
