"""
Utilities for building primitive blocks from AI suggestions.

Helps convert category discovery suggestions into draft BlockPrimitive
instances that can be persisted via the existing API.
"""
from typing import Optional
from datetime import datetime, timezone

from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.services.prompt.candidates import candidate_from_suggested_action_block
from pixsim7.backend.main.shared.schemas.discovery_schemas import (
    PromptBlockCandidate,
    SuggestedActionBlock,
)


def build_draft_action_block_from_candidate(
    candidate: PromptBlockCandidate,
    package_name: Optional[str] = None,
    source_prompt: Optional[str] = None,
) -> BlockPrimitive:
    """
    Build a draft BlockPrimitive instance from a normalized candidate.

    Creates a minimal draft primitive with:
    - block_id from candidate.block_id
    - text from candidate.text
    - category from candidate.category (or candidate.role fallback)
    - tags from candidate.tags (ontology-aligned where possible)
    - source inferred from source_type
    - is_public=False by default (draft/private)

    Args:
        candidate: The normalized candidate to promote to a block
        package_name: Optional package/library name to organize the block
        source_prompt: Optional excerpt from the prompt that generated this suggestion

    Returns:
        A new BlockPrimitive instance (not yet persisted to DB)
    """
    if not candidate.block_id:
        raise ValueError("PromptBlockCandidate.block_id is required")

    source_type = candidate.source_type or "ai_suggested"
    tags = candidate.tags.copy() if isinstance(candidate.tags, dict) else {}
    if candidate.ontology_ids:
        existing = tags.get("ontology_ids")
        merged = []
        if isinstance(existing, list):
            merged.extend([value for value in existing if isinstance(value, str)])
        for value in candidate.ontology_ids:
            if value not in merged:
                merged.append(value)
        if merged:
            tags["ontology_ids"] = merged

    if candidate.role and isinstance(candidate.role, str):
        role = candidate.role.strip()
        if role:
            tags.setdefault("role", role)

    if package_name and isinstance(package_name, str):
        source_pack = package_name.strip()
        if source_pack:
            tags.setdefault("source_pack", source_pack)

    trace: dict[str, object] = {
        "source_type": source_type,
        "source_discovery_timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if source_prompt:
        excerpt_length = min(200, len(source_prompt))
        trace["source_prompt_excerpt"] = source_prompt[:excerpt_length]
    if candidate.notes:
        trace["ai_suggestion_notes"] = candidate.notes
    if candidate.metadata:
        trace["candidate_metadata"] = candidate.metadata
    if candidate.matched_keywords:
        trace["candidate_matched_keywords"] = candidate.matched_keywords
    if candidate.role_scores:
        trace["candidate_role_scores"] = candidate.role_scores
    if trace:
        tags.setdefault("trace", trace)

    category = None
    if isinstance(candidate.category, str):
        candidate_category = candidate.category.strip()
        if candidate_category:
            category = candidate_category
    if not category and isinstance(candidate.role, str):
        role_category = candidate.role.strip()
        if role_category:
            category = role_category
    if not category:
        category = "uncategorized"

    source = "imported"
    if source_type in {"library", "system"}:
        source = "system"
    elif source_type in {"user_created", "user"}:
        source = "user"

    block = BlockPrimitive(
        block_id=candidate.block_id,
        category=category,
        text=candidate.text,
        tags=tags,
        source=source,
        is_public=False,
        usage_count=0,
        avg_rating=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    return block


def build_draft_action_block_from_suggestion(
    suggestion: SuggestedActionBlock,
    package_name: Optional[str] = None,
    source_prompt: Optional[str] = None,
) -> BlockPrimitive:
    """
    Build a draft BlockPrimitive instance from an AI suggestion.

    Backward-compatible wrapper that normalizes into PromptBlockCandidate.
    """
    candidate = candidate_from_suggested_action_block(suggestion)
    return build_draft_action_block_from_candidate(
        candidate,
        package_name=package_name,
        source_prompt=source_prompt,
    )
