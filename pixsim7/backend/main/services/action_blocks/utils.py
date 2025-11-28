"""
Utilities for building ActionBlock objects from AI suggestions

Helps convert category discovery suggestions into draft ActionBlockDB instances
that can be persisted via the existing API.
"""
from typing import Optional
from datetime import datetime

from pixsim7.backend.main.domain.action_block import ActionBlockDB
from pixsim7.backend.main.api.v1.dev_prompt_categories import SuggestedActionBlock


def build_draft_action_block_from_suggestion(
    suggestion: SuggestedActionBlock,
    package_name: Optional[str] = None,
    source_prompt: Optional[str] = None,
) -> ActionBlockDB:
    """
    Build a draft ActionBlockDB instance from an AI suggestion.

    Creates a minimal draft action block with:
    - block_id from suggestion.block_id
    - prompt from suggestion.prompt
    - tags from suggestion.tags (ontology-aligned where possible)
    - source_type: "ai_suggested"
    - is_composite: False by default
    - Other fields set to sensible defaults

    Args:
        suggestion: The AI-suggested action block entry
        package_name: Optional package/library name to organize the block
        source_prompt: Optional excerpt from the prompt that generated this suggestion

    Returns:
        A new ActionBlockDB instance (not yet persisted to DB)
    """
    # Build metadata for traceability (Task D)
    block_metadata = {
        "source_type": "ai_suggested",
        "source_discovery_timestamp": datetime.utcnow().isoformat(),
    }

    # Add source prompt excerpt if provided (first 200 chars)
    if source_prompt:
        excerpt_length = min(200, len(source_prompt))
        block_metadata["source_prompt_excerpt"] = source_prompt[:excerpt_length]

    # Add any notes from the suggestion
    if suggestion.notes:
        block_metadata["ai_suggestion_notes"] = suggestion.notes

    # Calculate basic stats
    char_count = len(suggestion.prompt)
    word_count = len(suggestion.prompt.split())

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
    kind = suggestion.tags.get("kind", "single_state")
    if kind not in ["single_state", "transition"]:
        kind = "single_state"

    # Create the draft action block
    block = ActionBlockDB(
        block_id=suggestion.block_id,
        kind=kind,
        prompt=suggestion.prompt,
        negative_prompt=None,  # Not provided in suggestions
        style="soft_cinema",  # Default style
        duration_sec=6.0,  # Default duration
        tags=suggestion.tags,
        compatible_next=[],  # Will be determined later during compatibility analysis
        compatible_prev=[],  # Will be determined later during compatibility analysis
        complexity_level=complexity_level,
        char_count=char_count,
        word_count=word_count,
        source_type="ai_suggested",
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
        description=suggestion.notes or f"AI-suggested block: {suggestion.block_id}",
        block_metadata=block_metadata,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    return block
