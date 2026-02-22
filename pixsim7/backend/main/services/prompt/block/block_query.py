"""Shared PromptBlock query builder.

Centralizes block filtering logic used by template slot matching and block search APIs.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from sqlalchemy import func, or_, select

from pixsim7.backend.main.domain.prompt import PromptBlock


_COMPLEXITY_ORDER = ["simple", "moderate", "complex", "very_complex"]


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

    if tag_constraints and isinstance(tag_constraints, dict):
        for tag_key, tag_value in tag_constraints.items():
            extracted = func.jsonb_extract_path_text(PromptBlock.tags, str(tag_key))
            if isinstance(tag_value, list):
                if not tag_value:
                    continue  # empty list = no constraint
                query = query.where(extracted.in_([str(v) for v in tag_value]))
            else:
                query = query.where(extracted == str(tag_value))

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

