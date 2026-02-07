"""
Prompt Block Candidates

Helpers for normalizing parsed prompt segments and AI suggestions into a
single candidate schema for reuse.
"""
from typing import Any, Dict, Iterable, List

from pixsim7.backend.main.shared.schemas.discovery_schemas import (
    PromptBlockCandidate,
    SuggestedActionBlock,
)
from pixsim7.backend.main.services.prompt.block.tagging import extract_ontology_ids_from_tags
from pixsim7.backend.main.services.prompt.parser import PromptSegment


def _get_value(segment: Any, key: str, default: Any = None) -> Any:
    if isinstance(segment, dict):
        return segment.get(key, default)
    return getattr(segment, key, default)


def _normalize_ontology_ids(raw: Any) -> List[str]:
    if not isinstance(raw, (list, tuple, set)):
        return []
    ids: List[str] = []
    for value in raw:
        if isinstance(value, str) and value:
            ids.append(value)
    return ids


def candidate_from_segment(
    segment: PromptSegment | Dict[str, Any],
    *,
    source_type: str = "parsed",
) -> PromptBlockCandidate:
    """
    Convert a parsed prompt segment (or block-like dict) into a candidate.

    Accepts either PromptSegment instances or dicts with compatible keys.
    """
    metadata = _get_value(segment, "metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    role = _get_value(segment, "role")
    text = _get_value(segment, "text") or _get_value(segment, "prompt") or ""
    category = _get_value(segment, "category")
    if not category:
        meta_category = metadata.get("category")
        if isinstance(meta_category, str):
            category = meta_category

    raw_ontology_ids = _get_value(segment, "ontology_ids")
    ontology_ids = _normalize_ontology_ids(raw_ontology_ids)
    if not ontology_ids:
        ontology_ids = _normalize_ontology_ids(metadata.get("ontology_ids"))

    tags = _get_value(segment, "tags")
    if not isinstance(tags, dict):
        tags = {}

    matched_keywords = _get_value(segment, "matched_keywords")
    if not isinstance(matched_keywords, list):
        matched_keywords = []

    role_scores = _get_value(segment, "role_scores")
    if not isinstance(role_scores, dict):
        role_scores = {}

    return PromptBlockCandidate(
        role=str(role) if role is not None else None,
        text=str(text),
        category=str(category) if category is not None else None,
        ontology_ids=ontology_ids,
        tags=tags,
        source_type=source_type,
        block_id=_get_value(segment, "block_id"),
        confidence=_get_value(segment, "confidence"),
        sentence_index=_get_value(segment, "sentence_index"),
        start_pos=_get_value(segment, "start_pos"),
        end_pos=_get_value(segment, "end_pos"),
        matched_keywords=matched_keywords,
        role_scores=role_scores,
        metadata=metadata,
    )


def candidate_from_suggested_action_block(
    suggestion: SuggestedActionBlock,
    *,
    source_type: str = "ai_suggested",
) -> PromptBlockCandidate:
    """Convert a SuggestedActionBlock into a normalized candidate."""
    tags = suggestion.tags or {}
    ontology_ids = extract_ontology_ids_from_tags(tags)

    category = None
    if isinstance(tags.get("category"), str):
        category = tags.get("category")

    role = tags.get("role") if isinstance(tags, dict) else None
    if isinstance(role, str) and role.startswith("role:"):
        role = role.split(":", 1)[1]

    return PromptBlockCandidate(
        block_id=suggestion.block_id,
        role=role if isinstance(role, str) else None,
        text=suggestion.prompt,
        category=category,
        ontology_ids=ontology_ids,
        tags=tags,
        source_type=source_type,
        notes=suggestion.notes,
    )


def candidates_from_segments(
    segments: Iterable[PromptSegment | Dict[str, Any]],
    *,
    source_type: str = "parsed",
) -> List[PromptBlockCandidate]:
    """Convert a list of segments into candidates."""
    return [candidate_from_segment(segment, source_type=source_type) for segment in segments]
