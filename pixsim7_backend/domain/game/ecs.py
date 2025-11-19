"""
ECS (Entity-Component-System) helpers for NPC state management.

This module provides a component-based access layer for NPC relationship and
session state, replacing direct JSON manipulation with typed, validated operations.

Key concepts:
- **Entity**: An NPC in a session, identified by (session_id, npc_id)
- **Component**: A typed data structure (e.g., "core", "romance", "behavior")
- **Metric**: A named value resolved via the metric registry

Storage:
- Authoritative: GameSession.flags.npcs["npc:{id}"].components
- Projection: GameSession.relationships["npc:{id}"] (backward compatibility)

Usage:
    from pixsim7_backend.domain.game.ecs import (
        get_npc_component,
        set_npc_component,
        update_npc_component,
    )

    # Read component
    core = get_npc_component(session, npc_id, "core")
    affinity = core.get("affinity", 0)

    # Write component
    set_npc_component(session, npc_id, "core", {
        "affinity": 75,
        "trust": 65,
        "chemistry": 50,
        "tension": 15,
    })

    # Update component (merge)
    update_npc_component(session, npc_id, "romance", {
        "arousal": 0.5,
        "stage": "dating",
    })
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from pixsim7_backend.domain.game.schemas import (
    BehaviorStateComponentSchema,
    InteractionStateComponentSchema,
    MoodStateComponentSchema,
    NpcEntityStateSchema,
    QuestParticipationComponentSchema,
    RelationshipCoreComponentSchema,
    RomanceComponentSchema,
    StealthComponentSchema,
)

logger = logging.getLogger(__name__)

# Component schema registry for validation
COMPONENT_SCHEMAS = {
    "core": RelationshipCoreComponentSchema,
    "romance": RomanceComponentSchema,
    "stealth": StealthComponentSchema,
    "mood": MoodStateComponentSchema,
    "quests": QuestParticipationComponentSchema,
    "behavior": BehaviorStateComponentSchema,
    "interactions": InteractionStateComponentSchema,
}


def _get_npc_key(npc_id: int) -> str:
    """Generate the NPC key for flags.npcs dictionary."""
    return f"npc:{npc_id}"


def get_npc_entity(session: Any, npc_id: int) -> Dict[str, Any]:
    """
    Get the full NPC entity state from session.

    Args:
        session: GameSession instance
        npc_id: NPC ID

    Returns:
        NPC entity state dictionary with components, tags, and metadata.
        Returns default empty structure if entity doesn't exist.

    Example:
        entity = get_npc_entity(session, 123)
        components = entity.get("components", {})
        tags = entity.get("tags", [])
    """
    npc_key = _get_npc_key(npc_id)
    flags = session.flags or {}
    npcs = flags.get("npcs", {})
    entity = npcs.get(npc_key, {})

    # Ensure entity has the expected structure
    if "components" not in entity:
        entity["components"] = {}

    return entity


def set_npc_entity(session: Any, npc_id: int, entity: Dict[str, Any]) -> None:
    """
    Set the full NPC entity state in session.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        entity: Entity state dictionary

    Example:
        set_npc_entity(session, 123, {
            "components": {"core": {...}},
            "tags": ["shopkeeper"],
            "metadata": {"lastSeenAt": "location:shop"}
        })
    """
    npc_key = _get_npc_key(npc_id)

    # Ensure flags.npcs exists
    if session.flags is None:
        session.flags = {}
    if "npcs" not in session.flags:
        session.flags["npcs"] = {}

    session.flags["npcs"][npc_key] = entity
    logger.debug(f"Set entity for {npc_key}")


def get_npc_component(
    session: Any,
    npc_id: int,
    component_name: str,
    default: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Get a specific component from an NPC entity.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        component_name: Component key (e.g., "core", "romance", "plugin:my-plugin")
        default: Default value if component doesn't exist

    Returns:
        Component data dictionary, or default if not found.

    Example:
        core = get_npc_component(session, 123, "core")
        affinity = core.get("affinity", 0)

        plugin_data = get_npc_component(session, 123, "plugin:game-romance", default={})
    """
    entity = get_npc_entity(session, npc_id)
    components = entity.get("components", {})
    component = components.get(component_name)

    if component is None:
        return default if default is not None else {}

    return component


def set_npc_component(
    session: Any,
    npc_id: int,
    component_name: str,
    value: Dict[str, Any],
    validate: bool = True,
) -> None:
    """
    Set (replace) a component in an NPC entity.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        component_name: Component key
        value: Component data dictionary
        validate: Whether to validate against schema (default True)

    Raises:
        ValueError: If validation fails

    Example:
        set_npc_component(session, 123, "core", {
            "affinity": 75,
            "trust": 65,
            "chemistry": 50,
            "tension": 15,
        })
    """
    # Validate if schema exists and validation is enabled
    if validate and component_name in COMPONENT_SCHEMAS:
        schema_cls = COMPONENT_SCHEMAS[component_name]
        try:
            schema_cls(**value)
        except Exception as e:
            raise ValueError(
                f"Component '{component_name}' validation failed: {e}"
            ) from e

    entity = get_npc_entity(session, npc_id)
    if "components" not in entity:
        entity["components"] = {}

    entity["components"][component_name] = value
    set_npc_entity(session, npc_id, entity)

    logger.debug(f"Set component '{component_name}' for npc:{npc_id}")


def update_npc_component(
    session: Any,
    npc_id: int,
    component_name: str,
    updates: Dict[str, Any],
    validate: bool = True,
) -> None:
    """
    Update (merge) fields in a component.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        component_name: Component key
        updates: Fields to update (merged with existing)
        validate: Whether to validate result against schema (default True)

    Raises:
        ValueError: If validation fails

    Example:
        update_npc_component(session, 123, "romance", {
            "arousal": 0.5,
            "stage": "dating",
        })
    """
    current = get_npc_component(session, npc_id, component_name, default={})
    merged = {**current, **updates}
    set_npc_component(session, npc_id, component_name, merged, validate=validate)

    logger.debug(
        f"Updated component '{component_name}' for npc:{npc_id} with {len(updates)} fields"
    )


def delete_npc_component(session: Any, npc_id: int, component_name: str) -> None:
    """
    Delete a component from an NPC entity.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        component_name: Component key

    Example:
        delete_npc_component(session, 123, "plugin:my-plugin")
    """
    entity = get_npc_entity(session, npc_id)
    components = entity.get("components", {})

    if component_name in components:
        del components[component_name]
        set_npc_entity(session, npc_id, entity)
        logger.debug(f"Deleted component '{component_name}' for npc:{npc_id}")


def has_npc_component(session: Any, npc_id: int, component_name: str) -> bool:
    """
    Check if an NPC has a specific component.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        component_name: Component key

    Returns:
        True if component exists, False otherwise

    Example:
        if has_npc_component(session, 123, "romance"):
            print("NPC has romance component")
    """
    entity = get_npc_entity(session, npc_id)
    components = entity.get("components", {})
    return component_name in components


def list_npc_components(session: Any, npc_id: int) -> list[str]:
    """
    List all component names for an NPC.

    Args:
        session: GameSession instance
        npc_id: NPC ID

    Returns:
        List of component names

    Example:
        components = list_npc_components(session, 123)
        # ["core", "romance", "behavior", "plugin:game-romance"]
    """
    entity = get_npc_entity(session, npc_id)
    components = entity.get("components", {})
    return list(components.keys())


def get_npc_tags(session: Any, npc_id: int) -> list[str]:
    """
    Get entity tags for an NPC.

    Args:
        session: GameSession instance
        npc_id: NPC ID

    Returns:
        List of tags

    Example:
        tags = get_npc_tags(session, 123)
        if "shopkeeper" in tags:
            print("This NPC is a shopkeeper")
    """
    entity = get_npc_entity(session, npc_id)
    return entity.get("tags", [])


def set_npc_tags(session: Any, npc_id: int, tags: list[str]) -> None:
    """
    Set entity tags for an NPC.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        tags: List of tags

    Example:
        set_npc_tags(session, 123, ["shopkeeper", "romanceTarget"])
    """
    entity = get_npc_entity(session, npc_id)
    entity["tags"] = tags
    set_npc_entity(session, npc_id, entity)
    logger.debug(f"Set {len(tags)} tags for npc:{npc_id}")


def add_npc_tag(session: Any, npc_id: int, tag: str) -> None:
    """
    Add a tag to an NPC (if not already present).

    Args:
        session: GameSession instance
        npc_id: NPC ID
        tag: Tag to add

    Example:
        add_npc_tag(session, 123, "romanceTarget")
    """
    tags = get_npc_tags(session, npc_id)
    if tag not in tags:
        tags.append(tag)
        set_npc_tags(session, npc_id, tags)


def remove_npc_tag(session: Any, npc_id: int, tag: str) -> None:
    """
    Remove a tag from an NPC.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        tag: Tag to remove

    Example:
        remove_npc_tag(session, 123, "romanceTarget")
    """
    tags = get_npc_tags(session, npc_id)
    if tag in tags:
        tags.remove(tag)
        set_npc_tags(session, npc_id, tags)


def get_npc_metadata(session: Any, npc_id: int) -> Dict[str, Any]:
    """
    Get entity metadata for an NPC.

    Args:
        session: GameSession instance
        npc_id: NPC ID

    Returns:
        Metadata dictionary

    Example:
        metadata = get_npc_metadata(session, 123)
        last_seen = metadata.get("lastSeenAt")
    """
    entity = get_npc_entity(session, npc_id)
    return entity.get("metadata", {})


def set_npc_metadata(session: Any, npc_id: int, metadata: Dict[str, Any]) -> None:
    """
    Set entity metadata for an NPC.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        metadata: Metadata dictionary

    Example:
        set_npc_metadata(session, 123, {
            "lastSeenAt": "location:shop",
            "lastInteractionAt": 1732000000
        })
    """
    entity = get_npc_entity(session, npc_id)
    entity["metadata"] = metadata
    set_npc_entity(session, npc_id, entity)
    logger.debug(f"Set metadata for npc:{npc_id}")


def update_npc_metadata(session: Any, npc_id: int, updates: Dict[str, Any]) -> None:
    """
    Update (merge) entity metadata for an NPC.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        updates: Metadata fields to update

    Example:
        update_npc_metadata(session, 123, {
            "lastInteractionAt": 1732000000
        })
    """
    metadata = get_npc_metadata(session, npc_id)
    merged = {**metadata, **updates}
    set_npc_metadata(session, npc_id, merged)


def validate_entity(session: Any, npc_id: int) -> tuple[bool, Optional[str]]:
    """
    Validate an NPC entity against schemas.

    Args:
        session: GameSession instance
        npc_id: NPC ID

    Returns:
        Tuple of (is_valid, error_message)

    Example:
        valid, error = validate_entity(session, 123)
        if not valid:
            print(f"Validation error: {error}")
    """
    try:
        entity = get_npc_entity(session, npc_id)
        NpcEntityStateSchema(**entity)

        # Validate individual components
        components = entity.get("components", {})
        for component_name, component_data in components.items():
            if component_name in COMPONENT_SCHEMAS:
                schema_cls = COMPONENT_SCHEMAS[component_name]
                schema_cls(**component_data)

        return True, None
    except Exception as e:
        return False, str(e)
