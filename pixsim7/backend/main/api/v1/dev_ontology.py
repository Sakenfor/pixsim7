"""
Dev Vocabulary Usage API

Dev-only endpoint for inspecting vocabulary IDs and their usage in ActionBlocks.

Purpose:
- View all vocabulary IDs from VocabularyRegistry
- See which vocabulary IDs are used in ActionBlocks
- Track usage statistics for vocabulary alignment

Design:
- Dev-only endpoint (no production use)
- Reads from VocabularyRegistry and scans ActionBlock tags
- Helps evolve the vocabulary over time
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.shared.ontology.vocabularies import get_registry
from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.prompt.block.tagging import extract_ontology_ids_from_tags
from sqlalchemy import select
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/ontology", tags=["dev", "ontology"])


# ===== Response Models =====

class OntologyIdUsage(BaseModel):
    """Usage statistics for a single vocabulary ID."""
    id: str
    label: Optional[str] = None
    category: str
    action_block_count: int = 0
    example_action_block_ids: List[str] = []
    notes: Optional[str] = None


class OntologyUsageResponse(BaseModel):
    """Complete vocabulary usage report."""
    vocabulary_version: str
    total_ids: int
    total_action_blocks_scanned: int
    ids: List[OntologyIdUsage]


# ===== Helper Functions =====

def extract_all_vocab_ids_from_registry() -> Dict[str, Dict[str, Any]]:
    """
    Extract all vocabulary IDs from VocabularyRegistry.

    Returns:
        Dict mapping vocabulary ID to metadata {label, category}
    """
    registry = get_registry()
    id_map: Dict[str, Dict[str, Any]] = {}

    # Parts (anatomy)
    for part in registry.all_parts():
        id_map[part.id] = {
            "label": part.label,
            "category": f"part.{part.category}" if part.category else "part"
        }

    # Spatial (camera views, framing, orientation)
    for spatial in registry.all_spatial():
        id_map[spatial.id] = {
            "label": spatial.label,
            "category": f"spatial.{spatial.category}" if spatial.category else "spatial"
        }

    # Poses
    for pose in registry.all_poses():
        id_map[pose.id] = {
            "label": pose.label,
            "category": f"pose.{pose.category}" if pose.category else "pose"
        }

    # Moods
    for mood in registry.all_moods():
        id_map[mood.id] = {
            "label": mood.label,
            "category": f"mood.{mood.category}" if mood.category else "mood"
        }

    # Locations
    for location in registry.all_locations():
        id_map[location.id] = {
            "label": location.label,
            "category": f"location.{location.category}" if location.category else "location"
        }

    # Ratings
    for rating in registry.all_ratings():
        id_map[rating.id] = {
            "label": rating.label,
            "category": "rating"
        }

    # Roles
    for role in registry.all_roles():
        id_map[role.id] = {
            "label": role.label,
            "category": "role"
        }

    return id_map


async def count_vocab_id_usage(db, vocab_id: str, limit: int = 5) -> tuple[int, List[str]]:
    """
    Count how many ActionBlocks use a specific vocabulary ID.

    Args:
        db: Database session
        vocab_id: The vocabulary ID to search for
        limit: Max number of example block IDs to return

    Returns:
        (count, example_block_ids)
    """
    # Query all action blocks (limited to avoid performance issues)
    result = await db.execute(
        select(PromptBlock).limit(1000)
    )
    blocks = result.scalars().all()

    matching_count = 0
    example_block_ids = []

    for block in blocks:
        if not block.tags:
            continue

        block_ontology_ids = extract_ontology_ids_from_tags(block.tags)

        if vocab_id in block_ontology_ids:
            matching_count += 1
            if len(example_block_ids) < limit:
                example_block_ids.append(block.block_id)

    return matching_count, example_block_ids


# ===== Endpoints =====

@router.get("/usage", response_model=OntologyUsageResponse)
async def get_ontology_usage(
    db: DatabaseSession,
    user: CurrentUser = None,
) -> OntologyUsageResponse:
    """
    Get vocabulary IDs and their usage in ActionBlocks.

    Returns:
        Complete vocabulary usage report with:
        - List of all vocabulary IDs
        - Usage counts per ID
        - Example ActionBlock IDs using each ID
    """
    try:
        registry = get_registry()

        # Extract all vocab IDs
        id_map = extract_all_vocab_ids_from_registry()

        # Build usage report for each ID
        id_usages: List[OntologyIdUsage] = []

        for vocab_id, metadata in id_map.items():
            count, examples = await count_vocab_id_usage(db, vocab_id, limit=5)

            id_usages.append(
                OntologyIdUsage(
                    id=vocab_id,
                    label=metadata.get("label"),
                    category=metadata.get("category", "unknown"),
                    action_block_count=count,
                    example_action_block_ids=examples,
                )
            )

        # Sort by usage count (descending) then by ID
        id_usages.sort(key=lambda x: (-x.action_block_count, x.id))

        # Count total action blocks scanned
        result = await db.execute(select(PromptBlock))
        total_blocks = len(result.scalars().all())

        response = OntologyUsageResponse(
            vocabulary_version="1.0.0",
            total_ids=len(id_usages),
            total_action_blocks_scanned=total_blocks,
            ids=id_usages,
        )

        logger.info(
            f"Generated vocabulary usage report: {len(id_usages)} IDs, {total_blocks} blocks scanned",
            extra={"user_id": user.id if user else None}
        )

        return response

    except Exception as e:
        logger.error(
            f"Failed to generate vocabulary usage report: {e}",
            extra={"user_id": user.id if user else None},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate vocabulary usage report: {str(e)}"
        )


@router.get("/info")
async def get_ontology_info(
    user: CurrentUser = None,
) -> Dict[str, Any]:
    """
    Get basic vocabulary information.

    Returns:
        Vocabulary metadata and counts
    """
    try:
        registry = get_registry()

        info = {
            "version": "1.0.0",
            "label": "PixSim7 Vocabulary Registry",
            "description": "Unified vocabulary system for poses, moods, locations, parts, spatial, etc.",
            "counts": {
                "poses": len(registry.all_poses()),
                "moods": len(registry.all_moods()),
                "locations": len(registry.all_locations()),
                "ratings": len(registry.all_ratings()),
                "roles": len(registry.all_roles()),
                "parts": len(registry.all_parts()),
                "spatial": len(registry.all_spatial()),
            },
            "loaded_packs": [p.id for p in registry.packs],
        }

        logger.info(
            "Retrieved vocabulary info",
            extra={"user_id": user.id if user else None}
        )

        return info

    except Exception as e:
        logger.error(
            f"Failed to get vocabulary info: {e}",
            extra={"user_id": user.id if user else None},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get vocabulary info: {str(e)}"
        )
