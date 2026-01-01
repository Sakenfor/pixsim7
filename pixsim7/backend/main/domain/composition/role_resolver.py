"""
Unified Composition Role Resolver

Single entry point for normalizing roles from various sources:
- Raw strings: "main_character", "bg", "char"
- ConceptRef format: "role:main_character"
- Tag-based inference: namespace/slug patterns
- Package-based mappings

All outputs are canonical RoleConceptRef instances.

Usage:
    from pixsim7.backend.main.domain.composition.role_resolver import (
        resolve_role,
        resolve_role_from_tags,
        resolve_role_from_prompt_role,
    )

    # From string
    ref = resolve_role("bg")  # -> ConceptRef(kind="role", id="environment")

    # From tags
    ref = resolve_role_from_tags(["npc:alice", "location:park"])
    # -> ConceptRef(kind="role", id="main_character")

    # From prompt role
    ref = resolve_role_from_prompt_role("character")
    # -> ConceptRef(kind="role", id="main_character")
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Union

from pixsim7.backend.main.domain.ontology.concept_ref import ConceptRef
from pixsim7.backend.main.shared.composition import (
    normalize_composition_role,
    map_tag_to_composition_role,
    map_prompt_role_to_composition_role,
    COMPOSITION_ROLE_PRIORITY,
)
from .package_registry import get_available_roles


def resolve_role(
    value: Optional[Union[str, ConceptRef, Dict[str, Any]]],
) -> Optional[ConceptRef]:
    """
    Resolve any role input to a canonical RoleConceptRef.

    Accepts:
    - None -> None
    - ConceptRef with kind="role" -> returned as-is
    - "role:main_character" -> ConceptRef(role, main_character)
    - "main_character" -> normalized -> ConceptRef(role, main_character)
    - "bg" (alias) -> normalized to "environment" -> ConceptRef(role, environment)
    - dict with kind="role" -> ConceptRef from dict

    Returns:
        ConceptRef with kind="role", or None
    """
    if value is None:
        return None

    # Already a ConceptRef
    if isinstance(value, ConceptRef):
        if value.kind == "role":
            return value
        # Wrong kind - try to extract and normalize the id
        value = value.id

    # Dict format
    if isinstance(value, dict):
        if value.get("kind") == "role" and value.get("id"):
            return ConceptRef(kind="role", id=str(value["id"]))
        # Try id field only
        if value.get("id"):
            value = str(value["id"])
        else:
            return None

    # String formats
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None

        # Handle "role:xxx" format
        if value.startswith("role:"):
            role_id = value[5:]
        else:
            # Normalize via shared composition logic (handles aliases)
            role_id = normalize_composition_role(value)

        if role_id:
            return ConceptRef(kind="role", id=role_id)

    return None


def resolve_role_from_tags(
    tags: List[str],
    *,
    active_package_ids: Optional[List[str]] = None,
) -> Optional[ConceptRef]:
    """
    Infer composition role from asset tag slugs.

    Uses package mappings if available, falls back to core mappings.
    Returns highest-priority role found.

    Args:
        tags: List of tag slugs (e.g., ["npc:alice", "location:park", "bg"])
        active_package_ids: Package IDs to include for mapping lookup.
                           If None, uses all registered packages.

    Returns:
        ConceptRef with kind="role", or None if no role inferred
    """
    if not tags:
        return None

    roles_found: set[str] = set()

    # Build package-based lookup maps
    role_by_slug: Dict[str, str] = {}
    role_by_namespace: Dict[str, str] = {}

    active_roles = get_available_roles(active_package_ids)
    for role in active_roles:
        for slug in role.slug_mappings:
            role_by_slug[slug.lower()] = role.id
        for ns in role.namespace_mappings:
            role_by_namespace[ns.lower()] = role.id

    for tag in tags:
        normalized = tag.lower().strip()
        if not normalized:
            continue

        # Try package slug mapping first
        if normalized in role_by_slug:
            roles_found.add(role_by_slug[normalized])
            continue

        # Try package namespace mapping
        if ":" in normalized:
            namespace = normalized.split(":")[0]
            if namespace in role_by_namespace:
                roles_found.add(role_by_namespace[namespace])
                continue

        # Fall back to core mappings from composition.py
        namespace_part = normalized.split(":")[0] if ":" in normalized else normalized
        core_role = map_tag_to_composition_role(
            namespace=namespace_part,
            slug=normalized,
        )
        if core_role:
            roles_found.add(core_role)

    # Return highest priority role
    for role_id in COMPOSITION_ROLE_PRIORITY:
        if role_id in roles_found:
            return ConceptRef(kind="role", id=role_id)

    # Return any found role if not in priority list (plugin-defined roles)
    if roles_found:
        return ConceptRef(kind="role", id=next(iter(roles_found)))

    return None


def resolve_role_from_prompt_role(
    prompt_role: Optional[str],
) -> Optional[ConceptRef]:
    """
    Map prompt segment role to composition role ConceptRef.

    Args:
        prompt_role: Prompt role ID (e.g., "character", "setting", "mood")

    Returns:
        ConceptRef with kind="role", or None
    """
    if not prompt_role:
        return None

    composition_role = map_prompt_role_to_composition_role(prompt_role)
    if composition_role:
        return ConceptRef(kind="role", id=composition_role)

    return None


__all__ = [
    "resolve_role",
    "resolve_role_from_tags",
    "resolve_role_from_prompt_role",
]
