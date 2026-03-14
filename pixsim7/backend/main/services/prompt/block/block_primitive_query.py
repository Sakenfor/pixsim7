"""BlockPrimitive query builder.

Simplified version of block_query.py targeting the BlockPrimitive model
in the separate pixsim7_blocks database. No role/kind/intent/complexity —
primitives are categorized purely by category + tags.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, Iterable, Optional

from sqlalchemy import Select, and_, func, or_, select

from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.services.prompt.block.block_query import normalize_tag_query
from pixsim7.backend.main.shared.composition import (
    CATEGORY_TO_COMPOSITION_ROLE,
    COMPOSITION_ROLE_ALIASES,
    PROMPT_ROLE_TO_COMPOSITION_ROLE,
    TAG_NAMESPACE_TO_COMPOSITION_ROLE,
    TAG_SLUG_TO_COMPOSITION_ROLE,
)


def _normalize_role_id(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized.startswith("role:"):
        normalized = normalized.split(":", 1)[1]
    canonical = COMPOSITION_ROLE_ALIASES.get(normalized, normalized)
    return canonical or None


def _build_composition_role_reverse_maps() -> dict[str, dict[str, tuple[Any, ...]]]:
    slug_reverse: dict[str, list[tuple[str, str]]] = defaultdict(list)
    namespace_reverse: dict[str, set[str]] = defaultdict(set)
    category_reverse: dict[str, set[str]] = defaultdict(set)
    role_reverse: dict[str, set[str]] = defaultdict(set)

    for raw_slug, raw_role in TAG_SLUG_TO_COMPOSITION_ROLE.items():
        canonical_role = _normalize_role_id(raw_role)
        if not canonical_role:
            continue
        slug_text = str(raw_slug).strip().lower()
        if ":" not in slug_text:
            continue
        tag_key, tag_value = slug_text.split(":", 1)
        if not tag_key or not tag_value:
            continue
        slug_reverse[canonical_role].append((tag_key, tag_value))

    for raw_tag_key, raw_role in TAG_NAMESPACE_TO_COMPOSITION_ROLE.items():
        canonical_role = _normalize_role_id(raw_role)
        tag_key = str(raw_tag_key).strip().lower()
        if canonical_role and tag_key:
            namespace_reverse[canonical_role].add(tag_key)

    for raw_category, raw_role in CATEGORY_TO_COMPOSITION_ROLE.items():
        canonical_role = _normalize_role_id(raw_role)
        category = str(raw_category).strip().lower()
        if canonical_role and category:
            category_reverse[canonical_role].add(category)

    combined_role_map: dict[str, str] = dict(COMPOSITION_ROLE_ALIASES)
    combined_role_map.update(PROMPT_ROLE_TO_COMPOSITION_ROLE)
    for raw_role_key, raw_role in combined_role_map.items():
        canonical_role = _normalize_role_id(raw_role)
        role_key = str(raw_role_key).strip().lower()
        if canonical_role and role_key:
            role_reverse[canonical_role].add(role_key)
    for canonical_role in set(category_reverse) | set(namespace_reverse) | set(slug_reverse) | set(role_reverse):
        role_reverse[canonical_role].add(canonical_role)

    return {
        "slug": {k: tuple(v) for k, v in slug_reverse.items()},
        "namespace": {k: tuple(sorted(v)) for k, v in namespace_reverse.items()},
        "category": {k: tuple(sorted(v)) for k, v in category_reverse.items()},
        "role": {k: tuple(sorted(v)) for k, v in role_reverse.items()},
    }


_COMPOSITION_ROLE_MAPS = _build_composition_role_reverse_maps()


def _build_composition_role_clause(composition_role: str):
    canonical_role = _normalize_role_id(composition_role)
    if not canonical_role:
        return None

    tags_column = BlockPrimitive.tags
    clauses = []

    composition_role_expr = func.lower(func.jsonb_extract_path_text(tags_column, "composition_role"))
    clauses.append(composition_role_expr == canonical_role)
    clauses.append(composition_role_expr == f"role:{canonical_role}")

    for tag_key, tag_value in _COMPOSITION_ROLE_MAPS["slug"].get(canonical_role, ()):
        value_expr = func.lower(func.jsonb_extract_path_text(tags_column, tag_key))
        clauses.append(value_expr == tag_value)

    for tag_key in _COMPOSITION_ROLE_MAPS["namespace"].get(canonical_role, ()):
        value_expr = func.jsonb_extract_path_text(tags_column, tag_key)
        clauses.append(value_expr.isnot(None))

    categories = _COMPOSITION_ROLE_MAPS["category"].get(canonical_role, ())
    if categories:
        clauses.append(func.lower(BlockPrimitive.category).in_(list(categories)))

    role_terms = _COMPOSITION_ROLE_MAPS["role"].get(canonical_role, ())
    if role_terms:
        role_expr = func.lower(func.jsonb_extract_path_text(tags_column, "role"))
        clauses.append(role_expr.in_(list(role_terms)))

    if not clauses:
        return None
    return or_(*clauses)


def build_block_primitive_query(
    *,
    category: Optional[str] = None,
    composition_role: Optional[str] = None,
    tag_constraints: Optional[Dict[str, Any]] = None,
    tag_query: Optional[Dict[str, Any]] = None,
    min_rating: Optional[float] = None,
    exclude_block_ids: Optional[Iterable[str]] = None,
    is_public: Optional[bool] = True,
    private_owner_user_id: Optional[int] = None,
    private_source_packs: Optional[Iterable[str]] = None,
    text_query: Optional[str] = None,
) -> Select:
    """Build a SQLAlchemy select for BlockPrimitive with shared filter semantics."""
    query = select(BlockPrimitive)

    if category:
        query = query.where(BlockPrimitive.category == category)
    if composition_role:
        role_clause = _build_composition_role_clause(composition_role)
        if role_clause is not None:
            query = query.where(role_clause)

    if min_rating is not None:
        query = query.where(BlockPrimitive.avg_rating >= min_rating)

    # Reuse the same tag normalization as PromptBlock queries
    tag_groups = normalize_tag_query(tag_constraints=tag_constraints, tag_query=tag_query)

    for tag_key, tag_value in tag_groups["all"].items():
        extracted = func.jsonb_extract_path_text(BlockPrimitive.tags, str(tag_key))
        if isinstance(tag_value, list):
            if not tag_value:
                continue
            query = query.where(extracted.in_(tag_value))
        else:
            query = query.where(extracted == str(tag_value))

    any_clauses = []
    for tag_key, tag_value in tag_groups["any"].items():
        extracted = func.jsonb_extract_path_text(BlockPrimitive.tags, str(tag_key))
        if isinstance(tag_value, list):
            if not tag_value:
                continue
            any_clauses.append(extracted.in_(tag_value))
        else:
            any_clauses.append(extracted == str(tag_value))
    if any_clauses:
        query = query.where(or_(*any_clauses))

    for tag_key, tag_value in tag_groups["not"].items():
        extracted = func.jsonb_extract_path_text(BlockPrimitive.tags, str(tag_key))
        if isinstance(tag_value, list):
            if not tag_value:
                continue
            query = query.where(or_(extracted.is_(None), extracted.notin_(tag_value)))
        else:
            query = query.where(or_(extracted.is_(None), extracted != str(tag_value)))

    if exclude_block_ids:
        query = query.where(BlockPrimitive.block_id.notin_(exclude_block_ids))

    if private_owner_user_id is not None:
        owner_expr = func.jsonb_extract_path_text(BlockPrimitive.tags, "owner_user_id") == str(private_owner_user_id)
        private_clauses = [
            BlockPrimitive.is_public.is_(False),
            owner_expr,
        ]
        source_pack_values = [
            str(value).strip()
            for value in (private_source_packs or [])
            if str(value).strip()
        ]
        include_private_scope = bool(source_pack_values)
        if source_pack_values:
            source_pack_expr = func.jsonb_extract_path_text(BlockPrimitive.tags, "source_pack")
            private_clauses.append(source_pack_expr.in_(source_pack_values))
        private_scope_clause = and_(*private_clauses)

        if is_public is True:
            if include_private_scope:
                query = query.where(
                    or_(
                        BlockPrimitive.is_public.is_(True),
                        private_scope_clause,
                    )
                )
            else:
                query = query.where(BlockPrimitive.is_public.is_(True))
        elif is_public is False:
            query = query.where(private_scope_clause)
        else:
            query = query.where(private_scope_clause)
    elif is_public is not None:
        query = query.where(BlockPrimitive.is_public == is_public)

    if text_query:
        pattern = f"%{text_query}%"
        query = query.where(
            or_(
                BlockPrimitive.block_id.ilike(pattern),
                BlockPrimitive.text.ilike(pattern),
            )
        )

    return query
