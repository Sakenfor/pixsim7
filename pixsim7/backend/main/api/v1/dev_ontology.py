"""
Dev Ontology Usage API

Dev-only endpoint for inspecting ontology IDs and their usage in ActionBlocks.

Purpose:
- View all ontology IDs defined in ontology.yaml
- See which ontology IDs are used in ActionBlocks
- Track usage statistics for ontology alignment

Design:
- Dev-only endpoint (no production use)
- Reads from ontology.yaml and scans ActionBlock tags
- Helps evolve the ontology over time
"""
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim7.backend.main.domain.ontology import get_ontology_registry
from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.prompt.block.tagging import extract_ontology_ids_from_tags
from sqlalchemy import select
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/ontology", tags=["dev", "ontology"])


# ===== Response Models =====

class OntologyIdUsage(BaseModel):
    """Usage statistics for a single ontology ID."""
    id: str
    label: Optional[str] = None
    category: str
    action_block_count: int = 0
    example_action_block_ids: List[str] = []
    notes: Optional[str] = None


class OntologyUsageResponse(BaseModel):
    """Complete ontology usage report."""
    ontology_version: str
    total_ids: int
    total_action_blocks_scanned: int
    ids: List[OntologyIdUsage]


# ===== Helper Functions =====

def extract_all_domain_ids_from_registry() -> Dict[str, Dict[str, Any]]:
    """
    Extract all ontology IDs from the domain section using the registry.

    Returns:
        Dict mapping ontology ID to metadata {label, category}
    """
    registry = get_ontology_registry()
    raw_core = registry._raw_core

    id_map: Dict[str, Dict[str, Any]] = {}

    # Get domain packs from raw data
    domain = raw_core.get("domain", {})
    packs = domain.get("packs", {})
    default_pack = packs.get("default", {})

    # Helper to extract IDs from a category
    def extract_from_category(category_name: str, category_label: str) -> None:
        category_items = default_pack.get(category_name, [])
        if not isinstance(category_items, list):
            return

        for item in category_items:
            if not isinstance(item, dict):
                continue

            item_id = item.get("id")
            label = item.get("label")

            if item_id:
                id_map[item_id] = {
                    "label": label,
                    "category": category_label
                }

    # Extract from all domain categories
    extract_from_category("anatomy_parts", "anatomy.part")
    extract_from_category("anatomy_regions", "anatomy.region")
    extract_from_category("actions", "action")
    extract_from_category("states_physical", "state.physical")
    extract_from_category("states_emotional", "state.emotional")
    extract_from_category("states_positional", "state.positional")
    extract_from_category("spatial_location", "spatial.location")
    extract_from_category("spatial_orientation", "spatial.orientation")
    extract_from_category("spatial_contact", "spatial.contact")
    extract_from_category("camera_views", "camera.view")
    extract_from_category("camera_framing", "camera.framing")
    extract_from_category("beats_sequence", "beat.sequence")
    extract_from_category("beats_micro", "beat.micro")

    # Add core intensity and speed IDs
    core = raw_core.get("core", {})
    intensity_labels = core.get("intensity", {}).get("labels", [])
    if isinstance(intensity_labels, list):
        for intensity_item in intensity_labels:
            if isinstance(intensity_item, dict):
                item_id = intensity_item.get("id")
                if item_id:
                    id_map[item_id] = {
                        "label": item_id.replace("intensity:", "").capitalize(),
                        "category": "intensity"
                    }

    speed_labels = core.get("speed", {}).get("labels", {})
    for speed_key, speed_data in speed_labels.items():
        if isinstance(speed_data, dict):
            item_id = speed_data.get("id")
            if item_id:
                id_map[item_id] = {
                    "label": speed_key.capitalize(),
                    "category": "speed"
                }

    return id_map


async def count_ontology_id_usage(db, ontology_id: str, limit: int = 5) -> tuple[int, List[str]]:
    """
    Count how many ActionBlocks use a specific ontology ID.

    Args:
        db: Database session
        ontology_id: The ontology ID to search for
        limit: Max number of example block IDs to return

    Returns:
        (count, example_block_ids)
    """
    # Query all action blocks (limited to avoid performance issues)
    # In production, this should be optimized with better indexing or caching
    result = await db.execute(
        select(PromptBlock).limit(1000)  # Limit scan to first 1000 blocks
    )
    blocks = result.scalars().all()

    matching_count = 0
    example_block_ids = []

    for block in blocks:
        # Extract ontology IDs from this block's tags
        if not block.tags:
            continue

        block_ontology_ids = extract_ontology_ids_from_tags(block.tags)

        # Check if our target ID is in this block
        if ontology_id in block_ontology_ids:
            matching_count += 1

            # Add to examples if we haven't hit the limit
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
    Get ontology IDs and their usage in ActionBlocks.

    Returns:
        Complete ontology usage report with:
        - List of all ontology IDs
        - Usage counts per ID
        - Example ActionBlock IDs using each ID
    """
    try:
        # Get registry and extract version
        registry = get_ontology_registry()
        version = registry._raw_core.get("version", "unknown")

        # Extract all domain IDs
        id_map = extract_all_domain_ids_from_registry()

        # Build usage report for each ID
        id_usages: List[OntologyIdUsage] = []

        for ontology_id, metadata in id_map.items():
            # Count usage in ActionBlocks
            count, examples = await count_ontology_id_usage(db, ontology_id, limit=5)

            id_usages.append(
                OntologyIdUsage(
                    id=ontology_id,
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
            ontology_version=version,
            total_ids=len(id_usages),
            total_action_blocks_scanned=total_blocks,
            ids=id_usages,
        )

        logger.info(
            f"Generated ontology usage report: {len(id_usages)} IDs, {total_blocks} blocks scanned",
            extra={"user_id": user.id if user else None}
        )

        return response

    except Exception as e:
        logger.error(
            f"Failed to generate ontology usage report: {e}",
            extra={"user_id": user.id if user else None},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate ontology usage report: {str(e)}"
        )


@router.get("/info")
async def get_ontology_info(
    user: CurrentUser = None,
) -> Dict[str, Any]:
    """
    Get basic ontology information.

    Returns:
        Ontology metadata (version, label, description)
    """
    try:
        registry = get_ontology_registry()
        raw_core = registry._raw_core

        info = {
            "version": raw_core.get("version", "unknown"),
            "label": raw_core.get("label", ""),
            "description": raw_core.get("description", ""),
            "has_core_section": bool(raw_core.get("core")),
            "has_domain_section": bool(raw_core.get("domain")),
        }

        logger.info(
            "Retrieved ontology info",
            extra={"user_id": user.id if user else None}
        )

        return info

    except Exception as e:
        logger.error(
            f"Failed to get ontology info: {e}",
            extra={"user_id": user.id if user else None},
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get ontology info: {str(e)}"
        )
