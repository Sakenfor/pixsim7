"""
Utilities for building ActionBlock objects from AI suggestions

Helps convert category discovery suggestions into draft PromptBlock instances
that can be persisted via the existing API.
"""
from typing import Optional
from datetime import datetime, timezone

from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.prompt.candidates import candidate_from_suggested_action_block
from pixsim7.backend.main.shared.schemas.discovery_schemas import (
    PromptBlockCandidate,
    SuggestedActionBlock,
)


def build_draft_action_block_from_candidate(
    candidate: PromptBlockCandidate,
    package_name: Optional[str] = None,
    source_prompt: Optional[str] = None,
) -> PromptBlock:
    """
    Build a draft PromptBlock instance from a normalized candidate.

    Creates a minimal draft action block with:
    - block_id from candidate.block_id
    - prompt from candidate.text
    - tags from candidate.tags (ontology-aligned where possible)
    - source_type: candidate.source_type (default: "ai_suggested")
    - is_composite: False by default
    - Other fields set to sensible defaults

    Args:
        candidate: The normalized candidate to promote to a block
        package_name: Optional package/library name to organize the block
        source_prompt: Optional excerpt from the prompt that generated this suggestion

    Returns:
        A new PromptBlock instance (not yet persisted to DB)
    """
    if not candidate.block_id:
        raise ValueError("PromptBlockCandidate.block_id is required")

    source_type = candidate.source_type or "ai_suggested"

    # Build metadata for traceability (Task D)
    block_metadata = {
        "source_type": source_type,
        "source_discovery_timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Add source prompt excerpt if provided (first 200 chars)
    if source_prompt:
        excerpt_length = min(200, len(source_prompt))
        block_metadata["source_prompt_excerpt"] = source_prompt[:excerpt_length]

    # Add any notes from the candidate
    if candidate.notes:
        block_metadata["ai_suggestion_notes"] = candidate.notes

    if candidate.metadata:
        block_metadata["candidate_metadata"] = candidate.metadata

    if candidate.matched_keywords:
        block_metadata["candidate_matched_keywords"] = candidate.matched_keywords

    if candidate.role_scores:
        block_metadata["candidate_role_scores"] = candidate.role_scores

    if candidate.ontology_ids:
        block_metadata["candidate_ontology_ids"] = candidate.ontology_ids

    # Calculate basic stats
    char_count = len(candidate.text)
    word_count = len(candidate.text.split())

    # Determine complexity level based on character count
    if char_count < 300:
        complexity_level = "simple"
    elif char_count < 600:
        complexity_level = "moderate"
    elif char_count < 1000:
        complexity_level = "complex"
    else:
        complexity_level = "very_complex"

    # Determine kind from tags if available, default to single_state
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

    kind = tags.get("kind", "single_state")
    if kind not in ["single_state", "transition"]:
        kind = "single_state"

    # Create the draft action block
    block = PromptBlock(
        block_id=candidate.block_id,
        role=candidate.role,
        category=candidate.category,
        kind=kind,
        prompt=candidate.text,
        negative_prompt=None,  # Not provided in suggestions
        style="soft_cinema",  # Default style
        duration_sec=6.0,  # Default duration
        tags=tags,
        compatible_next=[],  # Will be determined later during compatibility analysis
        compatible_prev=[],  # Will be determined later during compatibility analysis
        complexity_level=complexity_level,
        char_count=char_count,
        word_count=word_count,
        source_type=source_type,
        extracted_from_prompt_version=None,  # Not linked to a specific prompt version
        is_composite=False,  # Simple blocks by default
        component_blocks=[],
        composition_strategy=None,
        prompt_version_id=None,
        package_name=package_name or "ai_suggested",
        camera_movement=None,
        consistency=None,
        intensity_progression=None,
        usage_count=0,
        success_count=0,
        avg_rating=None,
        is_public=False,  # Keep AI-suggested blocks private by default until reviewed
        created_by="ai_discovery",
        description=candidate.notes or f"AI-suggested block: {candidate.block_id}",
        block_metadata=block_metadata,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    return block


def build_draft_action_block_from_suggestion(
    suggestion: SuggestedActionBlock,
    package_name: Optional[str] = None,
    source_prompt: Optional[str] = None,
) -> PromptBlock:
    """
    Build a draft PromptBlock instance from an AI suggestion.

    Backward-compatible wrapper that normalizes into PromptBlockCandidate.
    """
    candidate = candidate_from_suggested_action_block(suggestion)
    return build_draft_action_block_from_candidate(
        candidate,
        package_name=package_name,
        source_prompt=source_prompt,
    )
