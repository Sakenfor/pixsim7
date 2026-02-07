"""
Utilities for building Semantic Pack objects from AI suggestions

Helps convert category discovery suggestions into draft SemanticPackDB instances
that can be persisted via the existing API.
"""
from typing import Dict, List, Optional
from datetime import datetime, timezone

from pixsim7.backend.main.domain.semantic_pack import SemanticPackDB
from pixsim7.backend.main.shared.schemas.discovery_schemas import SuggestedPackEntry


def build_draft_pack_from_suggestion(
    suggestion: SuggestedPackEntry,
    source_prompt: Optional[str] = None,
) -> SemanticPackDB:
    """
    Build a draft SemanticPackDB instance from an AI suggestion.

    Creates a minimal draft pack with:
    - ID from suggestion.pack_id
    - Initial version "0.1.0"
    - Label from suggestion.pack_label
    - Parser hints from suggestion.parser_hints
    - Status: "draft"
    - Metadata tracking AI suggestion source

    Args:
        suggestion: The AI-suggested pack entry
        source_prompt: Optional excerpt from the prompt that generated this suggestion

    Returns:
        A new SemanticPackDB instance (not yet persisted to DB)
    """
    # Build metadata for traceability (Task D)
    extra_metadata = {
        "source_type": "ai_suggested",
        "source_discovery_timestamp": datetime.now(timezone.utc).isoformat(),
    }

    # Add source prompt excerpt if provided (first 200 chars)
    if source_prompt:
        excerpt_length = min(200, len(source_prompt))
        extra_metadata["source_prompt_excerpt"] = source_prompt[:excerpt_length]

    # Add any notes from the suggestion
    if suggestion.notes:
        extra_metadata["ai_suggestion_notes"] = suggestion.notes

    # Create the draft pack
    pack = SemanticPackDB(
        id=suggestion.pack_id,
        version="0.1.0",  # Initial version for new draft
        label=suggestion.pack_label,
        description=suggestion.notes or f"AI-suggested pack: {suggestion.pack_label}",
        author="ai_discovery",  # Mark as AI-generated
        status="draft",
        parser_hints=suggestion.parser_hints,
        tags=["ai-suggested"],  # Tag for easy filtering
        action_block_ids=[],  # Will be populated later as blocks are applied
        prompt_family_slugs=[],  # Will be populated later if needed
        extra=extra_metadata,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    return pack


def merge_parser_hints(
    existing_hints: Dict[str, List[str]],
    new_hints: Dict[str, List[str]],
) -> Dict[str, List[str]]:
    """
    Merge new parser hints into existing ones without duplicates.

    For each key in new_hints:
    - If key exists in existing_hints, append new values (deduplicated)
    - If key doesn't exist, add it with its values

    Args:
        existing_hints: Current parser hints dict
        new_hints: New parser hints to merge in

    Returns:
        Merged dict with deduplicated values
    """
    result = existing_hints.copy()

    for key, new_values in new_hints.items():
        if key in result:
            # Merge and deduplicate
            combined = set(result[key]) | set(new_values)
            result[key] = sorted(list(combined))
        else:
            # Add new key
            result[key] = sorted(list(set(new_values)))

    return result
