"""
Shared image composition roles and mapping utilities.

This module defines the canonical composition roles used across prompt blocks,
fusion, and multi-image editing. Provider adapters collapse these roles into
provider-specific formats.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional


class ImageCompositionRole(str, Enum):
    MAIN_CHARACTER = "main_character"
    COMPANION = "companion"
    ENVIRONMENT = "environment"
    PROP = "prop"
    STYLE_REFERENCE = "style_reference"
    EFFECT = "effect"


# Canonical role aliases for normalization.
COMPOSITION_ROLE_ALIASES = {
    # Characters
    "character": ImageCompositionRole.MAIN_CHARACTER.value,
    "char": ImageCompositionRole.MAIN_CHARACTER.value,
    "hero": ImageCompositionRole.MAIN_CHARACTER.value,
    "subject": ImageCompositionRole.MAIN_CHARACTER.value,
    "npc": ImageCompositionRole.COMPANION.value,
    "companion": ImageCompositionRole.COMPANION.value,
    "monster": ImageCompositionRole.COMPANION.value,
    # Environments
    "environment": ImageCompositionRole.ENVIRONMENT.value,
    "setting": ImageCompositionRole.ENVIRONMENT.value,
    "background": ImageCompositionRole.ENVIRONMENT.value,
    "bg": ImageCompositionRole.ENVIRONMENT.value,
    "scene": ImageCompositionRole.ENVIRONMENT.value,
    # Props
    "prop": ImageCompositionRole.PROP.value,
    "object": ImageCompositionRole.PROP.value,
    "vehicle": ImageCompositionRole.PROP.value,
    # Style / effects
    "style": ImageCompositionRole.STYLE_REFERENCE.value,
    "style_reference": ImageCompositionRole.STYLE_REFERENCE.value,
    "reference": ImageCompositionRole.STYLE_REFERENCE.value,
    "effect": ImageCompositionRole.EFFECT.value,
    "lighting": ImageCompositionRole.EFFECT.value,
}

# Prompt role mapping (PromptSegmentRole -> composition role)
PROMPT_ROLE_TO_COMPOSITION_ROLE = {
    "character": ImageCompositionRole.MAIN_CHARACTER.value,
    "setting": ImageCompositionRole.ENVIRONMENT.value,
    "mood": ImageCompositionRole.STYLE_REFERENCE.value,
    "romance": ImageCompositionRole.STYLE_REFERENCE.value,
    "action": ImageCompositionRole.EFFECT.value,
    "camera": ImageCompositionRole.EFFECT.value,
}

# Tag namespace mapping (Tag.namespace -> composition role)
TAG_NAMESPACE_TO_COMPOSITION_ROLE = {
    "character": ImageCompositionRole.MAIN_CHARACTER.value,
    "person": ImageCompositionRole.MAIN_CHARACTER.value,
    "npc": ImageCompositionRole.MAIN_CHARACTER.value,
    "animal": ImageCompositionRole.COMPANION.value,
    "creature": ImageCompositionRole.COMPANION.value,
    "object": ImageCompositionRole.PROP.value,
    "prop": ImageCompositionRole.PROP.value,
    "vehicle": ImageCompositionRole.PROP.value,
    "location": ImageCompositionRole.ENVIRONMENT.value,
    "environment": ImageCompositionRole.ENVIRONMENT.value,
    "setting": ImageCompositionRole.ENVIRONMENT.value,
    "background": ImageCompositionRole.ENVIRONMENT.value,
    "scene": ImageCompositionRole.ENVIRONMENT.value,
    "place": ImageCompositionRole.ENVIRONMENT.value,
    "style": ImageCompositionRole.STYLE_REFERENCE.value,
    "lighting": ImageCompositionRole.EFFECT.value,
    "camera": ImageCompositionRole.EFFECT.value,
}

# Tag slug mapping (Tag.slug -> composition role)
TAG_SLUG_TO_COMPOSITION_ROLE = {
    "char:hero": ImageCompositionRole.MAIN_CHARACTER.value,
    "char:npc": ImageCompositionRole.COMPANION.value,
    "char:monster": ImageCompositionRole.COMPANION.value,
    "pov:player": ImageCompositionRole.MAIN_CHARACTER.value,
    "role:bg": ImageCompositionRole.ENVIRONMENT.value,
    "role:environment": ImageCompositionRole.ENVIRONMENT.value,
    "role:setting": ImageCompositionRole.ENVIRONMENT.value,
    "role:char": ImageCompositionRole.MAIN_CHARACTER.value,
    "role:character": ImageCompositionRole.MAIN_CHARACTER.value,
    "comic_frame": ImageCompositionRole.STYLE_REFERENCE.value,
}


def normalize_composition_role(role: Optional[str]) -> Optional[str]:
    """Normalize a role string to a canonical composition role id."""
    if not role:
        return None
    key = role.strip().lower()
    if key.startswith("role:"):
        key = key.split(":", 1)[1]
    return COMPOSITION_ROLE_ALIASES.get(key, key)


def map_prompt_role_to_composition_role(prompt_role: Optional[str]) -> Optional[str]:
    """Map a prompt role id to a composition role id."""
    if not prompt_role:
        return None
    key = prompt_role.strip().lower()
    return PROMPT_ROLE_TO_COMPOSITION_ROLE.get(key, normalize_composition_role(key))


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

    if slug_key and slug_key in TAG_SLUG_TO_COMPOSITION_ROLE:
        return TAG_SLUG_TO_COMPOSITION_ROLE[slug_key]

    if namespace_key == "role" and name_key:
        return normalize_composition_role(name_key)

    return TAG_NAMESPACE_TO_COMPOSITION_ROLE.get(namespace_key)


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
