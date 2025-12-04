"""
Operation mapping registry

Provides a single source of truth for how structured generation_type
values map to backend OperationType enums. This is used by the unified
generations API and can also be exposed to frontends for tooling.
"""
from typing import Dict, List

from pixsim7.backend.main.domain.enums import OperationType


# Canonical mapping from structured generation_type (JSON/config)
# to internal OperationType enum.
GENERATION_TYPE_OPERATION_MAP: Dict[str, OperationType] = {
    # Scene transitions between images
    "transition": OperationType.VIDEO_TRANSITION,

    # Generic "prompt to video" variations (Control Center)
    "variation": OperationType.TEXT_TO_VIDEO,
    "dialogue": OperationType.TEXT_TO_VIDEO,
    "environment": OperationType.TEXT_TO_VIDEO,

    # Image → video NPC response clips
    "npc_response": OperationType.IMAGE_TO_VIDEO,

    # Image → image edits / transformations
    "image_edit": OperationType.IMAGE_TO_IMAGE,

    # Fusion / character-consistent video
    "fusion": OperationType.FUSION,
}


def resolve_operation_type(generation_type: str) -> OperationType:
    """
    Resolve OperationType for a given generation_type string.

    Falls back to TEXT_TO_VIDEO if the generation_type is unknown.
    """
    return GENERATION_TYPE_OPERATION_MAP.get(generation_type, OperationType.TEXT_TO_VIDEO)


def list_generation_operation_metadata() -> List[dict]:
    """
    Return metadata for all known generation_type → operation_type mappings.

    This is intended for tooling and UI consumers so they do not need
    to duplicate backend mappings.
    """
    items: List[dict] = []
    for gen_type, op_type in GENERATION_TYPE_OPERATION_MAP.items():
        items.append(
            {
                "generation_type": gen_type,
                "operation_type": op_type.value,
            }
        )
    return items

