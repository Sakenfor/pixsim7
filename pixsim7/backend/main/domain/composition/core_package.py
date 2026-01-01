"""
Core Composition Package

Provides the base composition roles that are always available.
These are derived from shared/composition-roles.yaml.

This package is auto-registered and cannot be deactivated.
"""

from __future__ import annotations

from typing import Dict, List

from pixsim7.backend.main.shared.composition import (
    TAG_NAMESPACE_TO_COMPOSITION_ROLE,
    TAG_SLUG_TO_COMPOSITION_ROLE,
    get_composition_role_metadata,
)

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


def _build_core_roles() -> List[CompositionRoleDefinition]:
    roles_meta = get_composition_role_metadata()
    slug_by_role = _invert_mapping(TAG_SLUG_TO_COMPOSITION_ROLE)
    namespace_by_role = _invert_mapping(TAG_NAMESPACE_TO_COMPOSITION_ROLE)

    roles: List[CompositionRoleDefinition] = []
    for role_id, meta in roles_meta.items():
        default_layer = meta.get("defaultLayer", meta.get("default_layer", 0))
        if default_layer is None:
            default_layer = 0
        roles.append(
            CompositionRoleDefinition(
                id=role_id,
                label=meta.get("label") or _format_role_label(role_id),
                description=meta.get("description", ""),
                color=meta.get("color", "slate"),
                default_layer=int(default_layer),
                tags=list(meta.get("tags") or []),
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
