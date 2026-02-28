"""BlockPrimitive query builder.

Simplified version of block_query.py targeting the BlockPrimitive model
in the separate pixsim7_blocks database. No role/kind/intent/complexity —
primitives are categorized purely by category + tags.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from sqlalchemy import Select, func, or_, select

from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.services.prompt.block.block_query import normalize_tag_query


def build_block_primitive_query(
    *,
    category: Optional[str] = None,
    tag_constraints: Optional[Dict[str, Any]] = None,
    tag_query: Optional[Dict[str, Any]] = None,
    min_rating: Optional[float] = None,
    exclude_block_ids: Optional[Iterable[str]] = None,
    is_public: Optional[bool] = True,
    text_query: Optional[str] = None,
) -> Select:
    """Build a SQLAlchemy select for BlockPrimitive with shared filter semantics."""
    query = select(BlockPrimitive)

    if category:
        query = query.where(BlockPrimitive.category == category)

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

    if is_public is not None:
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
