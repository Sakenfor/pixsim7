"""
NPC Surface Validation Helpers

Provides utilities to validate that NpcExpression.meta fields conform to
the surface type convention and reference registered surface types.
"""

from __future__ import annotations

from typing import Optional, Dict, Any
import logging

from .package_registry import find_surface_types

logger = logging.getLogger(__name__)


def validate_expression_meta(meta: Optional[Dict[str, Any]], npc_id: Optional[int] = None) -> bool:
    """
    Validate that an NpcExpression meta dict conforms to the surface type convention.

    Expected meta structure:
        {
            "surfaceType": "portrait",          # Required: surface type ID
            "pluginId": "game-romance",         # Optional: plugin that owns this
            "tags": ["romance", "closeup"]      # Optional: additional tags
        }

    Args:
        meta: The NpcExpression.meta dict to validate
        npc_id: Optional NPC ID for better error messages

    Returns:
        bool: True if valid, False if invalid (logs warnings)

    Notes:
        - This is a soft validation - it logs warnings but does not raise exceptions
        - Missing surfaceType is allowed (legacy expressions may not have it)
        - Unknown surfaceTypes log a warning but don't fail validation
    """
    if not meta:
        # Legacy expressions without meta are allowed
        return True

    if not isinstance(meta, dict):
        logger.warning(
            "NpcExpression.meta is not a dict",
            extra={"npc_id": npc_id, "meta_type": type(meta).__name__}
        )
        return False

    surface_type = meta.get("surfaceType")
    if not surface_type:
        # Missing surfaceType is allowed for legacy expressions
        return True

    if not isinstance(surface_type, str):
        logger.warning(
            "NpcExpression.meta.surfaceType is not a string",
            extra={"npc_id": npc_id, "surface_type": surface_type}
        )
        return False

    # Check if the surface type is registered in any package
    matches = find_surface_types(surface_type)
    if not matches:
        logger.warning(
            "NpcExpression.meta.surfaceType not found in any registered package",
            extra={
                "npc_id": npc_id,
                "surface_type": surface_type,
                "hint": "Consider registering a surface package for this type"
            }
        )
        # This is a warning, not a failure - allow unknown surface types
        # to support plugins that haven't registered their packages yet

    return True


def build_expression_meta(
    surface_type: str,
    plugin_id: Optional[str] = None,
    tags: Optional[list[str]] = None,
    **extra_fields: Any
) -> Dict[str, Any]:
    """
    Build a properly-structured NpcExpression.meta dict.

    Args:
        surface_type: The surface type ID (e.g. "portrait", "closeup_kiss")
        plugin_id: Optional plugin ID that owns this expression
        tags: Optional list of tags for filtering/categorization
        **extra_fields: Additional metadata fields to include

    Returns:
        Dict with properly structured meta for NpcExpression

    Example:
        >>> meta = build_expression_meta("closeup_kiss", plugin_id="game-romance", tags=["romance"])
        >>> meta
        {"surfaceType": "closeup_kiss", "pluginId": "game-romance", "tags": ["romance"]}
    """
    result: Dict[str, Any] = {
        "surfaceType": surface_type,
    }

    if plugin_id:
        result["pluginId"] = plugin_id

    if tags:
        result["tags"] = tags

    # Include any extra fields
    result.update(extra_fields)

    return result


def get_surface_type(meta: Optional[Dict[str, Any]]) -> Optional[str]:
    """
    Extract the surface type from an NpcExpression.meta dict.

    Args:
        meta: The NpcExpression.meta dict

    Returns:
        The surface type string, or None if not present

    Example:
        >>> meta = {"surfaceType": "portrait"}
        >>> get_surface_type(meta)
        "portrait"
    """
    if not meta or not isinstance(meta, dict):
        return None
    return meta.get("surfaceType")
