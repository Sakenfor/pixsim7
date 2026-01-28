"""
Generation Service Helpers

Shared utility functions for generation services to avoid duplication.
"""
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.generation import Generation
from pixsim7.backend.main.shared.errors import ResourceNotFoundError


async def get_generation_or_404(db: AsyncSession, generation_id: int) -> Generation:
    """
    Get generation by ID or raise ResourceNotFoundError.

    Args:
        db: Database session
        generation_id: Generation ID to look up

    Returns:
        Generation object

    Raises:
        ResourceNotFoundError: If generation not found
    """
    generation = await db.get(Generation, generation_id)
    if not generation:
        raise ResourceNotFoundError(f"Generation {generation_id} not found")
    return generation


def get_status_value(status: Any) -> str:
    """
    Normalize status to string value.

    Handles both enum and string status (SQLModel may return either).

    Args:
        status: Status enum or string

    Returns:
        String status value
    """
    return status.value if hasattr(status, 'value') else str(status)


def safe_dict_get(params: Any, key: str, default: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Safely extract dict from params with type checking.

    Args:
        params: Parent dict (or any value)
        key: Key to extract
        default: Default value if not found or wrong type

    Returns:
        Dict value or default
    """
    if not isinstance(params, dict):
        return default or {}
    result = params.get(key)
    if isinstance(result, dict):
        return result
    return default or {}
