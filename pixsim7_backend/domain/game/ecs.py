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


# ===================
# Metric Registry Integration
# ===================


def get_metric_registry(world: Any) -> Dict[str, Dict[str, Any]]:
    """
    Get the metric registry from a GameWorld.

    Args:
        world: GameWorld instance

    Returns:
        Metric registry dictionary (from world.meta.metrics)

    Example:
        registry = get_metric_registry(world)
        npc_rel_metrics = registry.get("npcRelationship", {})
    """
    meta = world.meta or {}
    return meta.get("metrics", {})


def resolve_metric(
    world: Any, metric_id: str
) -> Optional[tuple[str, str, Optional[str]]]:
    """
    Resolve a metric ID to its component, category, and path.

    Args:
        world: GameWorld instance
        metric_id: Metric ID (e.g., "npcRelationship.affinity")

    Returns:
        Tuple of (category, component, path) or None if not found.
        Path is optional (may be None if metric maps directly to component field).

    Example:
        result = resolve_metric(world, "npcRelationship.affinity")
        if result:
            category, component, path = result
            # category = "npcRelationship"
            # component = "core"
            # path = None (or "affinity" if nested)
    """
    registry = get_metric_registry(world)

    # Parse metric ID: category.metricName
    if "." not in metric_id:
        logger.warning(f"Invalid metric ID format: {metric_id} (expected 'category.name')")
        return None

    category, metric_name = metric_id.split(".", 1)

    # Look up in registry
    category_metrics = registry.get(category, {})
    if metric_name not in category_metrics:
        logger.warning(
            f"Metric '{metric_id}' not found in registry category '{category}'"
        )
        return None

    metric_def = category_metrics[metric_name]
    component = metric_def.get("component")
    path = metric_def.get("path")  # Optional path within component

    if not component:
        logger.warning(f"Metric '{metric_id}' has no component specified")
        return None

    return category, component, path


def get_npc_metric(
    session: Any, npc_id: int, metric_id: str, world: Any, default: Any = None
) -> Any:
    """
    Get a metric value for an NPC using the metric registry.

    The registry maps metric IDs to components and paths, allowing metrics
    to be read without knowing the underlying component structure.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        metric_id: Metric ID (e.g., "npcRelationship.affinity")
        world: GameWorld instance (for registry lookup)
        default: Default value if metric not found

    Returns:
        Metric value, or default if not found

    Example:
        affinity = get_npc_metric(session, 123, "npcRelationship.affinity", world)
        arousal = get_npc_metric(session, 123, "npcRelationship.arousal", world, default=0.0)
    """
    resolution = resolve_metric(world, metric_id)
    if not resolution:
        logger.warning(f"Could not resolve metric '{metric_id}'")
        return default

    category, component_name, path = resolution
    component = get_npc_component(session, npc_id, component_name, default={})

    # Navigate path if specified
    if path:
        # Support dot notation for nested paths
        parts = path.split(".")
        value = component
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
                if value is None:
                    return default
            else:
                return default
        return value
    else:
        # Metric name maps directly to field in component
        metric_name = metric_id.split(".", 1)[1]
        return component.get(metric_name, default)


def set_npc_metric(
    session: Any,
    npc_id: int,
    metric_id: str,
    value: Any,
    world: Any,
    validate: bool = True,
) -> bool:
    """
    Set a metric value for an NPC using the metric registry.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        metric_id: Metric ID (e.g., "npcRelationship.affinity")
        value: New value
        world: GameWorld instance (for registry lookup)
        validate: Whether to validate/clamp value (default True)

    Returns:
        True if successful, False otherwise

    Example:
        set_npc_metric(session, 123, "npcRelationship.affinity", 75.0, world)
        set_npc_metric(session, 123, "npcRelationship.arousal", 0.5, world)
    """
    resolution = resolve_metric(world, metric_id)
    if not resolution:
        logger.warning(f"Could not resolve metric '{metric_id}'")
        return False

    category, component_name, path = resolution
    registry = get_metric_registry(world)
    category_metrics = registry.get(category, {})
    metric_name = metric_id.split(".", 1)[1]
    metric_def = category_metrics.get(metric_name, {})

    # Validate/clamp value if requested
    if validate:
        value = _validate_metric_value(value, metric_def)

    # Get current component
    component = get_npc_component(session, npc_id, component_name, default={})

    # Set value (handle path if specified)
    if path:
        # Support dot notation for nested paths
        parts = path.split(".")
        current = component
        for i, part in enumerate(parts[:-1]):
            if part not in current:
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value
    else:
        # Metric name maps directly to field in component
        component[metric_name] = value

    # Write back component
    set_npc_component(session, npc_id, component_name, component, validate=False)
    logger.debug(f"Set metric '{metric_id}' = {value} for npc:{npc_id}")
    return True


def _validate_metric_value(value: Any, metric_def: Dict[str, Any]) -> Any:
    """
    Validate and clamp a metric value based on its definition.

    Args:
        value: Raw value
        metric_def: Metric definition from registry

    Returns:
        Validated/clamped value
    """
    metric_type = metric_def.get("type", "float")
    min_val = metric_def.get("min")
    max_val = metric_def.get("max")
    allowed_values = metric_def.get("values")

    # Type conversion
    if metric_type == "float":
        value = float(value)
    elif metric_type == "int":
        value = int(value)
    elif metric_type == "boolean":
        value = bool(value)

    # Clamp numeric values
    if metric_type in ("float", "int"):
        if min_val is not None and value < min_val:
            logger.debug(f"Clamping value {value} to min {min_val}")
            value = min_val
        if max_val is not None and value > max_val:
            logger.debug(f"Clamping value {value} to max {max_val}")
            value = max_val

    # Validate enum values
    if metric_type == "enum" and allowed_values:
        if value not in allowed_values:
            logger.warning(
                f"Value '{value}' not in allowed values {allowed_values}, using first"
            )
            value = allowed_values[0] if allowed_values else value

    return value


def update_npc_metric(
    session: Any,
    npc_id: int,
    metric_id: str,
    delta: float,
    world: Any,
    validate: bool = True,
) -> bool:
    """
    Update (add to) a numeric metric value.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        metric_id: Metric ID (e.g., "npcRelationship.affinity")
        delta: Amount to add (can be negative)
        world: GameWorld instance (for registry lookup)
        validate: Whether to validate/clamp result (default True)

    Returns:
        True if successful, False otherwise

    Example:
        # Increase affinity by 5
        update_npc_metric(session, 123, "npcRelationship.affinity", 5.0, world)

        # Decrease trust by 3
        update_npc_metric(session, 123, "npcRelationship.trust", -3.0, world)
    """
    current = get_npc_metric(session, npc_id, metric_id, world, default=0)

    # Convert to numeric
    try:
        current_val = float(current)
    except (TypeError, ValueError):
        logger.warning(
            f"Metric '{metric_id}' current value '{current}' is not numeric"
        )
        return False

    new_val = current_val + delta
    return set_npc_metric(session, npc_id, metric_id, new_val, world, validate=validate)


def list_metrics_for_category(world: Any, category: str) -> list[str]:
    """
    List all metric names in a category.

    Args:
        world: GameWorld instance
        category: Category name (e.g., "npcRelationship")

    Returns:
        List of metric names

    Example:
        metrics = list_metrics_for_category(world, "npcRelationship")
        # ["affinity", "trust", "chemistry", "tension", "arousal", ...]
    """
    registry = get_metric_registry(world)
    category_metrics = registry.get(category, {})
    return list(category_metrics.keys())


def get_metric_definition(world: Any, metric_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the full metric definition from the registry.

    Args:
        world: GameWorld instance
        metric_id: Metric ID (e.g., "npcRelationship.affinity")

    Returns:
        Metric definition dictionary or None if not found

    Example:
        definition = get_metric_definition(world, "npcRelationship.affinity")
        if definition:
            print(f"Type: {definition.get('type')}")
            print(f"Range: {definition.get('min')}-{definition.get('max')}")
    """
    if "." not in metric_id:
        return None

    category, metric_name = metric_id.split(".", 1)
    registry = get_metric_registry(world)
    category_metrics = registry.get(category, {})
    return category_metrics.get(metric_name)


# ===================
# Migration & Projection Helpers
# ===================


def migrate_relationship_to_components(
    session: Any, npc_id: int, relationship_data: Dict[str, Any]
) -> None:
    """
    Migrate legacy relationship data to ECS components.

    Reads from session.relationships["npc:{id}"] and writes to
    components["core"] in the entity state.

    Args:
        session: GameSession instance
        npc_id: NPC ID
        relationship_data: Legacy relationship dictionary

    Example:
        rel = session.relationships.get("npc:123", {})
        migrate_relationship_to_components(session, 123, rel)
    """
    # Extract core relationship fields
    core_component = {
        "affinity": relationship_data.get("affinity", 50.0),
        "trust": relationship_data.get("trust", 50.0),
        "chemistry": relationship_data.get("chemistry", 50.0),
        "tension": relationship_data.get("tension", 0.0),
    }

    # Include computed fields if present
    if "tierId" in relationship_data:
        core_component["tierId"] = relationship_data["tierId"]
    if "intimacyLevelId" in relationship_data:
        core_component["intimacyLevelId"] = relationship_data["intimacyLevelId"]

    # Write to components
    set_npc_component(session, npc_id, "core", core_component, validate=True)

    logger.debug(f"Migrated relationship data for npc:{npc_id} to core component")


def project_components_to_relationship(session: Any, npc_id: int) -> Dict[str, Any]:
    """
    Project ECS components to legacy relationship format.

    Reads from components["core"] and returns a dictionary compatible
    with session.relationships["npc:{id}"].

    Args:
        session: GameSession instance
        npc_id: NPC ID

    Returns:
        Relationship dictionary in legacy format

    Example:
        rel_data = project_components_to_relationship(session, 123)
        session.relationships[f"npc:{npc_id}"] = rel_data
    """
    core = get_npc_component(session, npc_id, "core", default={})

    relationship = {
        "affinity": core.get("affinity", 50.0),
        "trust": core.get("trust", 50.0),
        "chemistry": core.get("chemistry", 50.0),
        "tension": core.get("tension", 0.0),
    }

    # Include computed fields if present
    if "tierId" in core:
        relationship["tierId"] = core["tierId"]
    if "intimacyLevelId" in core:
        relationship["intimacyLevelId"] = core["intimacyLevelId"]

    # Add metadata to indicate this is a projection
    relationship["meta"] = {"last_modified_by": "relationship_core_projection"}

    return relationship


def sync_relationship_to_components(session: Any, npc_id: int) -> None:
    """
    Sync legacy relationship data to components (one-way: relationships → components).

    This is useful during transition period where code may still update
    session.relationships directly.

    Args:
        session: GameSession instance
        npc_id: NPC ID

    Example:
        # After legacy code updates relationships
        sync_relationship_to_components(session, 123)
    """
    npc_key = f"npc:{npc_id}"
    relationships = session.relationships or {}

    if npc_key in relationships:
        migrate_relationship_to_components(session, npc_id, relationships[npc_key])


def sync_components_to_relationship(session: Any, npc_id: int) -> None:
    """
    Sync components to legacy relationship data (one-way: components → relationships).

    This keeps session.relationships updated for backward compatibility.

    Args:
        session: GameSession instance
        npc_id: NPC ID

    Example:
        # After updating components via ECS
        sync_components_to_relationship(session, 123)
    """
    npc_key = f"npc:{npc_id}"

    if session.relationships is None:
        session.relationships = {}

    session.relationships[npc_key] = project_components_to_relationship(session, npc_id)


def ensure_npc_entity_initialized(session: Any, npc_id: int) -> None:
    """
    Ensure an NPC entity exists with default core component.

    If the entity doesn't exist yet, initialize it with default values.
    If legacy relationship data exists, migrate it.

    Args:
        session: GameSession instance
        npc_id: NPC ID

    Example:
        # Before reading/writing NPC data
        ensure_npc_entity_initialized(session, 123)
    """
    entity = get_npc_entity(session, npc_id)

    # Check if core component exists
    if "core" not in entity.get("components", {}):
        # Check if legacy relationship data exists
        npc_key = f"npc:{npc_id}"
        relationships = session.relationships or {}

        if npc_key in relationships:
            # Migrate from legacy
            migrate_relationship_to_components(session, npc_id, relationships[npc_key])
            logger.debug(f"Initialized npc:{npc_id} entity from legacy relationship data")
        else:
            # Create default core component
            default_core = {
                "affinity": 50.0,
                "trust": 50.0,
                "chemistry": 50.0,
                "tension": 0.0,
            }
            set_npc_component(session, npc_id, "core", default_core, validate=True)
            logger.debug(f"Initialized npc:{npc_id} entity with default core component")
