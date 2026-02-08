"""
Core Composition Package

Provides the base composition roles that are always available.
These are derived from the VocabularyRegistry (roles vocab).

This package is auto-registered and cannot be deactivated.
"""

from __future__ import annotations

from typing import Dict, List

from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

from .package_registry import (
    CompositionPackage,
    CompositionRoleDefinition,
    register_composition_package,
)


CORE_PACKAGE_ID = "core.base"


_ACRONYM_WORDS = {
    "pov": "POV",
    "npc": "NPC",
}


def _format_role_label(role_id: str) -> str:
    words = role_id.replace("-", " ").replace("_", " ").split()
    return " ".join(_ACRONYM_WORDS.get(word, word.capitalize()) for word in words)


def _invert_mapping(mapping: Dict[str, str]) -> Dict[str, List[str]]:
    inverted: Dict[str, List[str]] = {}
    for key, role in mapping.items():
        inverted.setdefault(role, []).append(key)
    return inverted


def _strip_role_prefix(role_id: str) -> str:
    if role_id.startswith("role:"):
        return role_id.split(":", 1)[1]
    return role_id


def _build_core_roles() -> List[CompositionRoleDefinition]:
    registry = get_registry()

    slug_mappings = {
        str(k).lower(): _strip_role_prefix(str(v))
        for k, v in registry.role_slug_mappings.items()
    }
    namespace_mappings = {
        str(k).lower(): _strip_role_prefix(str(v))
        for k, v in registry.role_namespace_mappings.items()
    }

    slug_by_role = _invert_mapping(slug_mappings)
    namespace_by_role = _invert_mapping(namespace_mappings)

    roles: List[CompositionRoleDefinition] = []
    for role in registry.all_roles():
        role_id = _strip_role_prefix(role.id)
        default_layer = role.default_layer
        if default_layer is None:
            default_layer = 0
        roles.append(
            CompositionRoleDefinition(
                id=role_id,
                label=role.label or _format_role_label(role_id),
                description=role.description or "",
                color=role.color or "slate",
                default_layer=int(default_layer),
                tags=list(role.tags or []),
                slug_mappings=sorted(slug_by_role.get(role_id, [])),
                namespace_mappings=sorted(namespace_by_role.get(role_id, [])),
            )
        )
    return roles


CORE_COMPOSITION_PACKAGE = CompositionPackage(
    id=CORE_PACKAGE_ID,
    label="Core Composition",
    description="Base composition roles for image/video generation",
    plugin_id=None,  # Built-in
    roles=_build_core_roles(),
    recommended_for=[],  # Always available
    version="1.0.0",
)


_registered = False


def register_core_composition_package() -> None:
    """
    Register the core composition package.

    This is called automatically during app startup.
    Safe to call multiple times (idempotent).
    """
    global _registered
    if _registered:
        return

    register_composition_package(CORE_COMPOSITION_PACKAGE)
    _registered = True


def reset_core_composition_registration() -> None:
    """Reset the registration flag. Used by clear_composition_packages()."""
    global _registered
    _registered = False
