"""
Generic entity context resolver - works with any entity type.

This module provides entity-agnostic context resolution that works with
the FieldMapping system. Any entity type (NPC, item, prop, player, etc.)
can use this resolver by providing:
1. A field mapping table
2. A dict of sources (e.g., {"template": template_data, "runtime": runtime_data})
3. Entity-specific configuration

The resolver handles:
- Source priority and fallback resolution
- Nested field access via dot notation
- Transform application
- Generic snapshot building

Example:
    # For an item
    sources = {
        "template": item_definition,
        "runtime": item_instance
    }

    mapping = get_item_field_mapping()

    snapshot = resolve_entity_context(
        entity_type="item",
        mapping=mapping,
        sources=sources,
        entity_id=item_id,
        entity_name=item_name
    )
"""

from typing import Dict, Any, Optional
from pixsim7.backend.main.services.prompt.context.mapping import (
    FieldMapping,
    set_nested_value,
    get_nested_value,
)


def resolve_entity_context(
    entity_type: str,
    mapping: Dict[str, FieldMapping],
    sources: Dict[str, Any],
    entity_id: Optional[str] = None,
    entity_name: Optional[str] = None,
    template_id: Optional[str] = None,
    prefer_live: bool = True,
    **kwargs
) -> Dict[str, Any]:
    """
    Generic entity context resolver using field mappings and sources.

    This is a pure function that resolves entity context based on mapping
    configuration and provided sources. It's entity-agnostic and can work
    with NPCs, items, props, players, or any custom entity type.

    Args:
        entity_type: Entity type identifier (e.g., "npc", "item", "prop")
        mapping: Field mapping table for this entity type
        sources: Dict of source_name -> source_data
            Examples:
            - For NPCs: {"instance": character_instance, "npc": game_npc, "state": npc_state}
            - For items: {"template": item_def, "runtime": item_instance}
            - For props: {"template": prop_def, "runtime": prop_state, "config": location_config}
        entity_id: Runtime entity ID (optional)
        entity_name: Entity display name (optional)
        template_id: Template/definition ID (optional)
        prefer_live: Whether to prefer runtime sources over template sources
        **kwargs: Additional context passed to transform functions

    Returns:
        Dict containing resolved entity context with keys:
        - entity_type: str
        - entity_id: Optional[str]
        - entity_name: Optional[str]
        - template_id: Optional[str]
        - fields: Dict[str, Any] (resolved field data using target_path)
        - source: "live" | "template" | "merged"

    Example:
        # Resolve item context
        mapping = get_item_field_mapping()
        sources = {
            "template": ItemDefinition(...),
            "runtime": GameItem(...)
        }

        context = resolve_entity_context(
            entity_type="item",
            mapping=mapping,
            sources=sources,
            entity_id="456",
            entity_name="Health Potion"
        )

        # Access resolved fields via target_path
        durability = context["fields"]["state"]["durability"]
    """

    # Build snapshot_data using field mappings
    snapshot_data: Dict[str, Any] = {}

    for field_key, field_mapping in mapping.items():
        value = _resolve_field_generic(
            field_mapping,
            sources,
            prefer_live
        )

        if value is not None:
            # Apply transform if provided
            if field_mapping.transform:
                transform_ctx = {
                    "sources": sources,
                    "prefer_live": prefer_live,
                    "entity_type": entity_type,
                    **kwargs
                }
                value = field_mapping.transform(value, transform_ctx)

            # Set value at target path (entity-agnostic)
            set_nested_value(snapshot_data, field_mapping.target_path, value)

    # Determine source type
    has_runtime = any(src for src_name, src in sources.items()
                     if src_name in ["runtime", "npc", "state"] and src is not None)
    has_template = any(src for src_name, src in sources.items()
                      if src_name in ["template", "instance"] and src is not None)

    if has_runtime and prefer_live:
        source = "live"
    elif has_runtime and has_template:
        source = "merged"
    elif has_template:
        source = "template"
    else:
        source = "live"

    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "template_id": template_id,
        "fields": snapshot_data,
        "source": source,
    }


def _resolve_field_generic(
    mapping: FieldMapping,
    sources: Dict[str, Any],
    prefer_live: bool
) -> Any:
    """
    Resolve a single field value from sources using generic mapping.

    This function is entity-agnostic and works purely with the mapping
    configuration and provided sources.

    Args:
        mapping: FieldMapping with source, fallback, and source_paths
        sources: Dict of source_name -> source_data
        prefer_live: Whether to prefer runtime sources

    Returns:
        Resolved value, or None if not found
    """

    # Determine primary source
    primary_source = mapping.source
    fallback_source = mapping.fallback

    # Handle "both" source (heuristic for runtime vs template)
    if primary_source == "both":
        # Prefer runtime if available and prefer_live is True
        runtime_candidates = ["runtime", "npc", "state"]
        template_candidates = ["template", "instance"]

        if prefer_live:
            # Try runtime first
            for candidate in runtime_candidates:
                if candidate in sources and sources[candidate] is not None:
                    primary_source = candidate
                    fallback_source = template_candidates[0] if template_candidates[0] in sources else "none"
                    break
            else:
                # No runtime, use template
                primary_source = template_candidates[0] if template_candidates[0] in sources else "template"
        else:
            # Try template first
            for candidate in template_candidates:
                if candidate in sources and sources[candidate] is not None:
                    primary_source = candidate
                    fallback_source = runtime_candidates[0] if runtime_candidates[0] in sources else "none"
                    break
            else:
                # No template, use runtime
                primary_source = runtime_candidates[0] if runtime_candidates[0] in sources else "runtime"

    # Try primary source
    value = _get_value_from_source(mapping, primary_source, sources)

    # Try fallback if primary failed
    if value is None and fallback_source != "none":
        value = _get_value_from_source(mapping, fallback_source, sources)

    return value


def _get_value_from_source(
    mapping: FieldMapping,
    source_name: str,
    sources: Dict[str, Any]
) -> Any:
    """
    Get value from a specific source using the mapping's source_paths.

    Args:
        mapping: FieldMapping with source_paths configuration
        source_name: Name of source to read from
        sources: Dict of available sources

    Returns:
        Value from source, or None if not found
    """

    # Get source data
    source_data = sources.get(source_name)
    if source_data is None:
        return None

    # Get path for this source
    if not mapping.source_paths or source_name not in mapping.source_paths:
        return None

    source_path = mapping.source_paths[source_name]

    # Handle special cases for well-known paths
    # This provides backward compatibility with existing NPC logic

    # Handle direct attribute access (no dots)
    if "." not in source_path:
        # Try as dict key first
        if isinstance(source_data, dict):
            return source_data.get(source_path)
        # Try as object attribute
        return getattr(source_data, source_path, None)

    # Handle nested paths
    # Special case: "state.field_name" when source_data has a state dict attribute
    if source_path.startswith("state.") and hasattr(source_data, "state"):
        state_key = source_path.split(".", 1)[1]
        state_dict = getattr(source_data, "state", None)
        if isinstance(state_dict, dict):
            return get_nested_value(state_dict, state_key)

    # Special case: "transform" field for spatial data
    if source_path == "transform" and hasattr(source_data, "transform"):
        return getattr(source_data, "transform", None)

    # Special case: "current_location_id" field
    if source_path == "current_location_id" and hasattr(source_data, "current_location_id"):
        return getattr(source_data, "current_location_id", None)

    # Generic nested dict access
    if isinstance(source_data, dict):
        return get_nested_value(source_data, source_path)

    # Try as nested object attributes (e.g., personality.mood)
    parts = source_path.split(".")
    value = source_data
    for part in parts:
        if isinstance(value, dict):
            value = value.get(part)
        elif hasattr(value, part):
            value = getattr(value, part)
        else:
            return None
        if value is None:
            return None

    return value
