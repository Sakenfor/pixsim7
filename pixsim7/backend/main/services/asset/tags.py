"""Asset tagging helper - derive ontology-aligned tags from asset metadata

This module provides helpers to extract ontology IDs from assets
based on their generation prompts and provider metadata.
"""
from typing import Dict, Any, List, Optional
from sqlmodel import Session

from pixsim7.backend.main.domain.asset import Asset
from pixsim7.backend.main.domain.generation import Generation
from pixsim7.backend.main.domain.ontology import match_keywords
from pixsim7.backend.main.services.prompt_parser import SimplePromptParser


async def tag_asset_from_metadata(
    asset: Asset,
    generation: Optional[Generation] = None,
    session: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Best-effort ontology tag extraction for an asset.

    Sources:
      - Generation prompt text (if available via final_prompt)
      - Asset metadata/captions from provider (if any)

    Strategy:
      - Run SimplePromptParser + ontology.match_keywords on prompts/captions
      - Merge ontology_ids into a dict { "ontology_ids": [...], "roles": [...], ... }

    Args:
        asset: Asset to tag
        generation: Optional Generation record associated with this asset
        session: Optional SQLModel session (for loading generation if not provided)

    Returns:
        Dict with:
        {
            "ontology_ids": ["cam:pov", "intensity:soft", ...],
            "roles": ["character", "action", ...],
            "text_sources": ["final_prompt", "caption", ...]
        }
    """
    ontology_ids: List[str] = []
    roles: List[str] = []
    text_sources: List[str] = []

    # Strategy 1: Use generation's final_prompt if available
    if generation and generation.final_prompt:
        text_sources.append("final_prompt")
        # Parse the prompt to get ontology IDs and roles
        parser = SimplePromptParser()
        parsed = await parser.parse(generation.final_prompt)

        # Extract roles from parsed blocks
        for block in parsed.blocks:
            role = block.role.value
            if role not in roles:
                roles.append(role)

            # Check if block metadata has ontology_ids
            if hasattr(block, 'metadata') and isinstance(block.metadata, dict):
                block_ontology_ids = block.metadata.get('ontology_ids', [])
                for oid in block_ontology_ids:
                    if oid not in ontology_ids:
                        ontology_ids.append(oid)

        # Also run keyword matching on the full prompt text
        matched_ids = match_keywords(generation.final_prompt)
        for oid in matched_ids:
            if oid not in ontology_ids:
                ontology_ids.append(oid)

    # Strategy 2: Check asset metadata for captions or descriptions
    # (This is optional - the Asset model may have a metadata JSON field in the future)
    # For now, we skip this as Asset doesn't have a general metadata field yet

    # If we have no ontology_ids, try to infer basic ones from asset properties
    if not ontology_ids:
        # Check if asset has dimensions that might suggest camera views
        if asset.width and asset.height:
            aspect_ratio = asset.width / asset.height
            # These are just heuristics - not reliable but better than nothing
            if aspect_ratio > 1.7:  # Wide format might be cinematic
                text_sources.append("inferred_from_dimensions")
                # Don't add IDs here - too unreliable

    return {
        "ontology_ids": ontology_ids,
        "roles": roles,
        "text_sources": text_sources,
    }


def extract_ontology_ids_from_asset_tags(asset_tags: Dict[str, Any]) -> List[str]:
    """
    Extract just the ontology IDs list from asset tags dict.

    Args:
        asset_tags: Dict returned from tag_asset_from_metadata

    Returns:
        List of ontology ID strings
    """
    return asset_tags.get("ontology_ids", [])
