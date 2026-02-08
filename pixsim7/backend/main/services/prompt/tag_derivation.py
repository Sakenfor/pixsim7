"""
Shared prompt tag derivation from parsed/analyzed candidates.

This module centralizes role/ontology tag derivation so simple-parser and
LLM-analyzer paths stay behaviorally aligned.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Tuple, TypedDict

from pixsim7.backend.main.services.prompt.tag_inference import (
    derive_sub_tags_from_ontology_ids,
)


class PromptTag(TypedDict, total=False):
    """Structured tag with candidate linking."""

    tag: str
    candidates: List[int]  # Indices into candidates array
    source: str  # "role" | "ontology"
    confidence: float


def _add_tag(
    tags: Dict[str, Tuple[List[int], str]],
    tag: str,
    candidate_idx: int,
    source: str,
) -> None:
    if tag not in tags:
        tags[tag] = ([], source)
    if candidate_idx not in tags[tag][0]:
        tags[tag][0].append(candidate_idx)


def _extract_ontology_ids(candidate: Dict[str, Any]) -> List[str]:
    metadata = candidate.get("metadata") if isinstance(candidate, dict) else None
    raw = []
    if isinstance(metadata, dict):
        raw = metadata.get("ontology_ids") or []
    if not raw:
        raw = candidate.get("ontology_ids") or []

    if not isinstance(raw, list):
        return []

    result: List[str] = []
    for value in raw:
        if not isinstance(value, str):
            continue
        tag_id = value.strip()
        if not tag_id:
            continue
        result.append(tag_id)
    return result


def derive_structured_and_flat_tags(
    candidates: Iterable[Dict[str, Any]],
    *,
    include_ontology_ids: bool = True,
) -> tuple[List[PromptTag], List[str]]:
    """
    Derive structured + flat tags from candidate entries.

    Args:
        candidates: Candidate dicts with role/confidence/ontology metadata.
        include_ontology_ids: Whether to include raw ontology IDs as tags.
                              Use False for paths that only want role + derived sub-tags.
    """
    role_tag_segments: Dict[str, List[int]] = {}
    role_tag_confidence: Dict[str, float] = {}
    keyword_tags: Dict[str, Tuple[List[int], str]] = {}

    for idx, candidate in enumerate(candidates):
        role = candidate.get("role")
        confidence = candidate.get("confidence", 0.0)

        if role and role != "other":
            role_tag = f"has:{role}"
            if role_tag not in role_tag_segments:
                role_tag_segments[role_tag] = []
                role_tag_confidence[role_tag] = 0.0
            role_tag_segments[role_tag].append(idx)
            role_tag_confidence[role_tag] = max(role_tag_confidence[role_tag], confidence)

        ontology_ids = _extract_ontology_ids(candidate)
        if not ontology_ids:
            continue

        for derived in derive_sub_tags_from_ontology_ids(ontology_ids):
            _add_tag(keyword_tags, derived, idx, "ontology")

        if include_ontology_ids:
            for oid in ontology_ids:
                _add_tag(keyword_tags, oid, idx, "ontology")

    structured: List[PromptTag] = []

    for tag in sorted(role_tag_segments.keys()):
        structured.append(
            {
                "tag": tag,
                "candidates": role_tag_segments[tag],
                "source": "role",
                "confidence": round(role_tag_confidence[tag], 3),
            }
        )

    for tag in sorted(keyword_tags.keys()):
        candidate_indices, source = keyword_tags[tag]
        structured.append(
            {
                "tag": tag,
                "candidates": candidate_indices,
                "source": source,
            }
        )

    flat = [entry["tag"] for entry in structured]
    return structured, flat


def derive_flat_tags(
    candidates: Iterable[Dict[str, Any]],
    *,
    include_ontology_ids: bool = True,
) -> List[str]:
    """Derive flat tag strings from candidates."""
    _, flat = derive_structured_and_flat_tags(
        candidates,
        include_ontology_ids=include_ontology_ids,
    )
    return flat


__all__ = [
    "PromptTag",
    "derive_structured_and_flat_tags",
    "derive_flat_tags",
]

