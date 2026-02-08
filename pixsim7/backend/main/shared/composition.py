"""
Shared image composition roles and mapping utilities.

This module defines the canonical composition roles used across prompt blocks,
fusion, and multi-image editing. Provider adapters collapse these roles into
provider-specific formats.

Role mappings are loaded from the VocabularyRegistry (roles vocab).
Frontend generates equivalent TS constants via tools/codegen/generate-composition-roles.ts.
"""
from __future__ import annotations

import copy
from enum import Enum
from typing import Any, Dict, List, Optional

from pixsim7.backend.main.shared.ontology.vocabularies import get_registry


# ============================================================================
# Vocabulary Loading (Single Source of Truth)
# ============================================================================


def _strip_role_prefix(role_id: str) -> str:
    if role_id.startswith("role:"):
        return role_id.split(":", 1)[1]
    return role_id


def _normalize_mapping_values(mapping: Dict[str, str]) -> Dict[str, str]:
    return {str(k).lower(): _strip_role_prefix(str(v)) for k, v in mapping.items()}


def _load_role_data() -> Dict[str, Any]:
    """Load and normalize composition role data from VocabularyRegistry."""
    registry = get_registry()

    roles_data: Dict[str, Dict[str, Any]] = {}
    aliases: Dict[str, str] = {}

    for role in registry.all_roles():
        role_id = _strip_role_prefix(role.id)
        roles_data[role_id] = {
            "label": role.label,
            "description": role.description,
            "color": role.color,
            "defaultLayer": role.default_layer,
            "defaultInfluence": role.default_influence,
            "tags": list(role.tags),
        }

        for alias in role.aliases:
            alias_key = str(alias).strip().lower()
            if alias_key:
                aliases[alias_key] = role_id

    priority = [_strip_role_prefix(role_id) for role_id in registry.role_priority]
    if not priority:
        priority = list(roles_data.keys())

    slug_mappings = _normalize_mapping_values(registry.role_slug_mappings)
    namespace_mappings = _normalize_mapping_values(registry.role_namespace_mappings)

    return {
        "roles": roles_data,
        "priority": priority,
        "slugMappings": slug_mappings,
        "namespaceMappings": namespace_mappings,
        "aliases": aliases,
    }


def _load_prompt_role_mappings() -> Dict[str, str]:
    """Load prompt role -> composition role mappings from vocab."""
    registry = get_registry()
    mapping: Dict[str, str] = {}
    for prompt_role in registry.all_prompt_roles():
        prompt_id = str(prompt_role.id).strip().lower()
        if not prompt_id:
            continue
        composition_role = getattr(prompt_role, "composition_role", None)
        if not composition_role:
            continue
        mapping[prompt_id] = _strip_role_prefix(str(composition_role))
    return mapping


def _get_role_data() -> Dict[str, Any]:
    """Fetch normalized role data from the current registry state."""
    return _load_role_data()


def _get_prompt_role_mappings() -> Dict[str, str]:
    """Fetch prompt-role mappings from the current registry state."""
    return _load_prompt_role_mappings()


# Snapshot exports kept for compatibility with modules importing constants.
_ROLE_DATA_SNAPSHOT = _get_role_data()
_PROMPT_ROLE_TO_COMPOSITION_ROLE_SNAPSHOT = _get_prompt_role_mappings()


def _build_composition_role_enum() -> type:
    """Dynamically build ImageCompositionRole enum from vocab roles."""
    # roles is now an object with metadata, extract keys
    roles_data = _ROLE_DATA_SNAPSHOT["roles"]
    role_ids = list(roles_data.keys())
    # Create enum members: MAIN_CHARACTER = "main_character", etc.
    members = {role.upper(): role for role in role_ids}
    return Enum("ImageCompositionRole", members, type=str)


# Build enum dynamically from vocab - no separate Python edits needed
ImageCompositionRole = _build_composition_role_enum()

# Role mappings from vocab
COMPOSITION_ROLE_ALIASES: Dict[str, str] = _ROLE_DATA_SNAPSHOT["aliases"]
TAG_NAMESPACE_TO_COMPOSITION_ROLE: Dict[str, str] = _ROLE_DATA_SNAPSHOT["namespaceMappings"]
TAG_SLUG_TO_COMPOSITION_ROLE: Dict[str, str] = _ROLE_DATA_SNAPSHOT["slugMappings"]
COMPOSITION_ROLE_PRIORITY: List[str] = _ROLE_DATA_SNAPSHOT["priority"]


def get_composition_role_metadata() -> Dict[str, Dict[str, Any]]:
    """Return a defensive copy of role metadata from vocab."""
    return copy.deepcopy(_get_role_data()["roles"])


def get_role_to_influence_mapping() -> Dict[str, str]:
    """Build role->influence type mapping from vocab metadata.

    Returns a mapping from composition role id to default influence type.
    Used by lineage tracking to determine how a source asset influenced the output.

    Influence types: content, style, structure, mask, blend, replacement, reference
    """
    roles = _get_role_data()["roles"]
    return {
        role_id: meta.get("defaultInfluence", "content")
        for role_id, meta in roles.items()
    }

PROMPT_ROLE_TO_COMPOSITION_ROLE = _PROMPT_ROLE_TO_COMPOSITION_ROLE_SNAPSHOT


def get_composition_role_priority() -> List[str]:
    """Return role priority ordering from current registry data."""
    return list(_get_role_data()["priority"])


def normalize_composition_role(role: Optional[str]) -> Optional[str]:
    """Normalize a role string to a canonical composition role id."""
    if not role:
        return None
    key = role.strip().lower()
    if key.startswith("role:"):
        key = key.split(":", 1)[1]
    aliases = _get_role_data()["aliases"]
    return aliases.get(key, key)


def map_prompt_role_to_composition_role(prompt_role: Optional[str]) -> Optional[str]:
    """Map a prompt role id to a composition role id."""
    if not prompt_role:
        return None
    key = prompt_role.strip().lower()
    role_map = _get_prompt_role_mappings()
    return role_map.get(key, normalize_composition_role(key))


def map_tag_to_composition_role(
    namespace: Optional[str],
    *,
    name: Optional[str] = None,
    slug: Optional[str] = None,
) -> Optional[str]:
    """Map a tag namespace/name/slug to a composition role id."""
    if not namespace:
        return None
    namespace_key = namespace.strip().lower()
    name_key = name.strip().lower() if name else None
    slug_key = slug.strip().lower() if slug else None
    role_data = _get_role_data()
    slug_mappings = role_data["slugMappings"]
    namespace_mappings = role_data["namespaceMappings"]

    if slug_key and slug_key in slug_mappings:
        return slug_mappings[slug_key]

    if namespace_key == "role" and name_key:
        return normalize_composition_role(name_key)

    return namespace_mappings.get(namespace_key)


def map_composition_role_to_pixverse_type(
    role: Optional[str],
    *,
    layer: Optional[int] = None,
) -> Optional[str]:
    """
    Collapse a composition role to Pixverse's subject/background role.

    If role is missing, fall back to layer: layer<=0 -> background, else subject.
    """
    normalized = normalize_composition_role(role) if role else None
    if normalized == ImageCompositionRole.ENVIRONMENT.value:
        return "background"
    if normalized:
        return "subject"
    if layer is not None:
        return "background" if layer <= 0 else "subject"
    return None
