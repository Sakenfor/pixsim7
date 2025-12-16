"""Character Linkage Helpers

Utilities for linking characters to scenes, assets, and generations via metadata.
No schema changes required - uses existing JSON fields with standardized conventions.

Conventions:
- Scene metadata: GameScene.meta.character_roles = { "protagonist": "character:uuid", ... }
- Scene node metadata: GameSceneNode.meta.character_refs = ["character:uuid", ...]
- Asset metadata: Asset.media_metadata.character_refs = { "character_template_id": "uuid", "character_instance_id": "uuid", "scene_id": 123 }
- Generation metadata: Generation.canonical_params.character_refs = ["character:uuid", ...]
"""
from typing import Optional, List, Dict, Any, Union
from uuid import UUID

from ..core.models import GameScene, GameSceneNode
from pixsim7.backend.main.domain.asset import Asset
from pixsim7.backend.main.domain.generation import Generation


# ============================================================================
# Character Reference Format
# ============================================================================


def format_character_ref(character_id: UUID) -> str:
    """Format character ID as standard reference string

    Args:
        character_id: Character template UUID

    Returns:
        String like "character:550e8400-e29b-41d4-a716-446655440000"
    """
    return f"character:{character_id}"


def format_instance_ref(instance_id: UUID) -> str:
    """Format character instance ID as standard reference string

    Args:
        instance_id: Character instance UUID

    Returns:
        String like "instance:550e8400-e29b-41d4-a716-446655440000"
    """
    return f"instance:{instance_id}"


def parse_character_ref(ref: str) -> Optional[Dict[str, Any]]:
    """Parse character reference string

    Args:
        ref: Reference string like "character:uuid" or "instance:uuid"

    Returns:
        Dict with "type" and "id", or None if invalid
    """
    if not ref or ":" not in ref:
        return None

    parts = ref.split(":", 1)
    if len(parts) != 2:
        return None

    ref_type, ref_id = parts
    if ref_type not in ("character", "instance"):
        return None

    try:
        # Validate UUID format
        UUID(ref_id)
        return {"type": ref_type, "id": ref_id}
    except ValueError:
        return None


# ============================================================================
# Scene Role Bindings
# ============================================================================


def set_scene_role_binding(
    scene: GameScene,
    role: str,
    character_ref: str,
) -> GameScene:
    """Set character role binding in scene metadata

    Args:
        scene: GameScene to update
        role: Role name (e.g., "protagonist", "love_interest", "antagonist")
        character_ref: Character reference (use format_character_ref() or format_instance_ref())

    Returns:
        Updated scene (in-place modification)

    Example:
        >>> scene = GameScene(...)
        >>> set_scene_role_binding(scene, "protagonist", format_character_ref(char_id))
        >>> scene.meta["character_roles"]["protagonist"]
        "character:550e8400-e29b-41d4-a716-446655440000"
    """
    if scene.meta is None:
        scene.meta = {}

    if "character_roles" not in scene.meta:
        scene.meta["character_roles"] = {}

    scene.meta["character_roles"][role] = character_ref
    return scene


def get_scene_role_binding(scene: GameScene, role: str) -> Optional[str]:
    """Get character reference for a role in scene

    Args:
        scene: GameScene to query
        role: Role name

    Returns:
        Character reference string or None
    """
    if not scene.meta or "character_roles" not in scene.meta:
        return None

    return scene.meta["character_roles"].get(role)


def get_all_scene_roles(scene: GameScene) -> Dict[str, str]:
    """Get all role bindings for a scene

    Args:
        scene: GameScene to query

    Returns:
        Dict of role -> character_ref
    """
    if not scene.meta or "character_roles" not in scene.meta:
        return {}

    return scene.meta["character_roles"]


def clear_scene_role_binding(scene: GameScene, role: str) -> GameScene:
    """Clear a role binding from scene

    Args:
        scene: GameScene to update
        role: Role name to clear

    Returns:
        Updated scene
    """
    if scene.meta and "character_roles" in scene.meta:
        scene.meta["character_roles"].pop(role, None)

    return scene


# ============================================================================
# Scene Node Character References
# ============================================================================


def add_scene_node_character_ref(
    node: GameSceneNode,
    character_ref: str,
) -> GameSceneNode:
    """Add character reference to scene node metadata

    Args:
        node: GameSceneNode to update
        character_ref: Character reference

    Returns:
        Updated node
    """
    if node.meta is None:
        node.meta = {}

    if "character_refs" not in node.meta:
        node.meta["character_refs"] = []

    if character_ref not in node.meta["character_refs"]:
        node.meta["character_refs"].append(character_ref)

    return node


def get_scene_node_character_refs(node: GameSceneNode) -> List[str]:
    """Get all character references from scene node

    Args:
        node: GameSceneNode to query

    Returns:
        List of character references
    """
    if not node.meta or "character_refs" not in node.meta:
        return []

    return node.meta["character_refs"]


def remove_scene_node_character_ref(
    node: GameSceneNode,
    character_ref: str,
) -> GameSceneNode:
    """Remove character reference from scene node

    Args:
        node: GameSceneNode to update
        character_ref: Character reference to remove

    Returns:
        Updated node
    """
    if node.meta and "character_refs" in node.meta:
        if character_ref in node.meta["character_refs"]:
            node.meta["character_refs"].remove(character_ref)

    return node


# ============================================================================
# Asset Character Linkage
# ============================================================================


def set_asset_character_linkage(
    asset: Asset,
    character_template_id: Optional[UUID] = None,
    character_instance_id: Optional[UUID] = None,
    scene_id: Optional[int] = None,
    scene_node_id: Optional[int] = None,
) -> Asset:
    """Set character linkage metadata on asset

    Args:
        asset: Asset to update
        character_template_id: Character template UUID
        character_instance_id: Character instance UUID
        scene_id: Scene this asset belongs to
        scene_node_id: Scene node this asset belongs to

    Returns:
        Updated asset
    """
    if asset.media_metadata is None:
        asset.media_metadata = {}

    if "character_linkage" not in asset.media_metadata:
        asset.media_metadata["character_linkage"] = {}

    linkage = asset.media_metadata["character_linkage"]

    if character_template_id:
        linkage["character_template_id"] = str(character_template_id)

    if character_instance_id:
        linkage["character_instance_id"] = str(character_instance_id)

    if scene_id is not None:
        linkage["scene_id"] = scene_id

    if scene_node_id is not None:
        linkage["scene_node_id"] = scene_node_id

    return asset


def get_asset_character_linkage(asset: Asset) -> Dict[str, Any]:
    """Get character linkage metadata from asset

    Args:
        asset: Asset to query

    Returns:
        Dict with character_template_id, character_instance_id, scene_id, scene_node_id
    """
    if not asset.media_metadata or "character_linkage" not in asset.media_metadata:
        return {}

    return asset.media_metadata["character_linkage"]


def add_asset_character_tag(
    asset: Asset,
    character_ref: str,
) -> Asset:
    """Add character reference to asset tags

    Args:
        asset: Asset to update
        character_ref: Character reference (e.g., "character:uuid")

    Returns:
        Updated asset
    """
    if character_ref not in asset.tags:
        asset.tags.append(character_ref)

    return asset


# ============================================================================
# Generation Character Linkage
# ============================================================================


def set_generation_character_refs(
    generation: Generation,
    character_refs: List[str],
) -> Generation:
    """Set character references in generation canonical params

    Args:
        generation: Generation to update
        character_refs: List of character references

    Returns:
        Updated generation
    """
    if generation.canonical_params is None:
        generation.canonical_params = {}

    generation.canonical_params["character_refs"] = character_refs
    return generation


def add_generation_character_ref(
    generation: Generation,
    character_ref: str,
) -> Generation:
    """Add character reference to generation

    Args:
        generation: Generation to update
        character_ref: Character reference

    Returns:
        Updated generation
    """
    if generation.canonical_params is None:
        generation.canonical_params = {}

    if "character_refs" not in generation.canonical_params:
        generation.canonical_params["character_refs"] = []

    if character_ref not in generation.canonical_params["character_refs"]:
        generation.canonical_params["character_refs"].append(character_ref)

    return generation


def get_generation_character_refs(generation: Generation) -> List[str]:
    """Get character references from generation

    Args:
        generation: Generation to query

    Returns:
        List of character references
    """
    if not generation.canonical_params or "character_refs" not in generation.canonical_params:
        return []

    return generation.canonical_params["character_refs"]


def set_generation_scene_id(
    generation: Generation,
    scene_id: int,
) -> Generation:
    """Set scene ID in generation canonical params

    Args:
        generation: Generation to update
        scene_id: Scene this generation is for

    Returns:
        Updated generation
    """
    if generation.canonical_params is None:
        generation.canonical_params = {}

    generation.canonical_params["scene_id"] = scene_id
    return generation


def get_generation_scene_id(generation: Generation) -> Optional[int]:
    """Get scene ID from generation

    Args:
        generation: Generation to query

    Returns:
        Scene ID or None
    """
    if not generation.canonical_params:
        return None

    return generation.canonical_params.get("scene_id")


# ============================================================================
# Character Usage Tracking (Extended)
# ============================================================================


async def track_character_usage_in_scene(
    db,
    character_id: UUID,
    scene_id: int,
):
    """Track character usage in a scene

    This extends CharacterUsage to track scene appearances.
    Uses usage_type = "scene"

    Args:
        db: Database session
        character_id: Character template UUID
        scene_id: GameScene ID
    """
    from pixsim7.backend.main.domain.game.entities.character import CharacterUsage
    from datetime import datetime

    usage = CharacterUsage(
        character_id=character_id,
        usage_type="scene",
        template_reference=f"scene:{scene_id}",
        used_at=datetime.utcnow(),
    )

    db.add(usage)
    await db.commit()


async def track_character_usage_in_asset(
    db,
    character_id: UUID,
    asset_id: int,
):
    """Track character usage in an asset

    Args:
        db: Database session
        character_id: Character template UUID
        asset_id: Asset ID
    """
    from pixsim7.backend.main.domain.game.entities.character import CharacterUsage
    from datetime import datetime

    usage = CharacterUsage(
        character_id=character_id,
        usage_type="asset",
        template_reference=f"asset:{asset_id}",
        used_at=datetime.utcnow(),
    )

    db.add(usage)
    await db.commit()


async def track_character_usage_in_generation(
    db,
    character_id: UUID,
    generation_id: int,
):
    """Track character usage in a generation

    Args:
        db: Database session
        character_id: Character template UUID
        generation_id: Generation ID
    """
    from pixsim7.backend.main.domain.game.entities.character import CharacterUsage
    from datetime import datetime

    usage = CharacterUsage(
        character_id=character_id,
        usage_type="generation",
        template_reference=f"generation:{generation_id}",
        used_at=datetime.utcnow(),
    )

    db.add(usage)
    await db.commit()


# ============================================================================
# Role Validation
# ============================================================================


STANDARD_SCENE_ROLES = [
    "protagonist",
    "love_interest",
    "antagonist",
    "supporting",
    "background",
    "narrator",
    "companion",
    "rival",
    "mentor",
    "student",
]


def is_valid_role_name(role: str) -> bool:
    """Check if role name is valid

    Args:
        role: Role name to validate

    Returns:
        True if valid (alphanumeric + underscore)
    """
    return role.replace("_", "").isalnum()


def suggest_role_name(role: str) -> Optional[str]:
    """Suggest a standard role name if role is non-standard

    Args:
        role: Role name to check

    Returns:
        Standard role name suggestion or None
    """
    role_lower = role.lower()

    # Direct match
    if role_lower in STANDARD_SCENE_ROLES:
        return role_lower

    # Fuzzy match
    for standard_role in STANDARD_SCENE_ROLES:
        if role_lower in standard_role or standard_role in role_lower:
            return standard_role

    return None
