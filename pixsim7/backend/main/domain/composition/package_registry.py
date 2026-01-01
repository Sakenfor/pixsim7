"""
Composition Package Registry

Manages registration and lookup of composition packages.
Packages contribute roles that can be used in image/video generation.

Uses SimpleRegistry base class for standard registry operations.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from pixsim7.backend.main.lib.registry import SimpleRegistry

logger = logging.getLogger(__name__)


@dataclass
class CompositionRoleDefinition:
    """
    Definition of a composition role contributed by a package.

    Roles define semantic slots for multi-image composition
    (e.g., pov_hands, main_character, environment).
    """
    id: str
    """Unique role ID (e.g., 'pov_hands', 'main_character')"""

    label: str
    """Human-readable label (e.g., 'POV Hands', 'Main Character')"""

    description: str
    """Description of what this role represents"""

    color: str
    """Tailwind color name for UI badges (e.g., 'amber', 'blue')"""

    default_layer: int = 0
    """Default layer order (0=background, higher=foreground)"""

    tags: List[str] = field(default_factory=list)
    """Tags for filtering and asset matching"""

    # Optional inference mappings (for auto-detecting role from asset tags)
    slug_mappings: List[str] = field(default_factory=list)
    """Exact tag slugs that map to this role (e.g., ['pov:hands', 'role:pov_hands'])"""

    namespace_mappings: List[str] = field(default_factory=list)
    """Tag namespace prefixes that map to this role (e.g., ['pov', 'hands'])"""


@dataclass
class CompositionPackage:
    """
    A package that contributes composition roles.

    Packages are registered by plugins or core modules.
    Worlds activate packages to make their roles available.
    """
    id: str
    """Unique package ID (e.g., 'core.base', 'pov.first_person')"""

    label: str
    """Human-readable label (e.g., 'Core Composition', 'First-Person POV')"""

    description: str = ""
    """Package description"""

    plugin_id: Optional[str] = None
    """Plugin that registered this package, or None for built-in"""

    roles: List[CompositionRoleDefinition] = field(default_factory=list)
    """Roles this package contributes"""

    recommended_for: List[str] = field(default_factory=list)
    """Game styles this package is recommended for (UI hints only)"""

    version: str = "1.0.0"
    """Package version"""


class CompositionPackageRegistry(SimpleRegistry[str, CompositionPackage]):
    """
    Registry for composition packages.

    Extends SimpleRegistry with composition-specific query methods.
    """

    def __init__(self) -> None:
        super().__init__(name="CompositionPackageRegistry", log_operations=False)

    def _get_item_key(self, item: CompositionPackage) -> str:
        return item.id

    def register_package(self, pkg: CompositionPackage) -> None:
        """Register or update a composition package."""
        existing = self._items.get(pkg.id)
        if existing:
            logger.info(
                f"Replacing composition package '{pkg.id}' "
                f"(was: plugin={existing.plugin_id}, now: plugin={pkg.plugin_id})"
            )
        else:
            logger.info(
                f"Registering composition package '{pkg.id}' "
                f"with {len(pkg.roles)} roles (plugin={pkg.plugin_id})"
            )
        self._items[pkg.id] = pkg

    def get_available_roles(
        self,
        active_package_ids: Optional[List[str]] = None,
    ) -> List[CompositionRoleDefinition]:
        """
        Get all roles from active packages.

        Args:
            active_package_ids: List of package IDs to include.
                               If None, includes all registered packages.

        Returns:
            List of role definitions from the specified packages.
            Roles are deduplicated by ID (later packages override earlier).
        """
        roles_by_id: Dict[str, CompositionRoleDefinition] = {}

        if active_package_ids:
            package_ids = list(active_package_ids)
            if self.has("core.base") and "core.base" not in package_ids:
                package_ids = ["core.base", *package_ids]
        else:
            package_ids = list(self._items.keys())

        for pkg_id in package_ids:
            pkg = self._items.get(pkg_id)
            if not pkg:
                logger.warning(f"Composition package '{pkg_id}' not found, skipping")
                continue

            for role in pkg.roles:
                if role.id in roles_by_id:
                    logger.debug(
                        f"Role '{role.id}' from package '{pkg_id}' "
                        f"overrides existing definition"
                    )
                roles_by_id[role.id] = role

        return list(roles_by_id.values())

    def get_role_by_id(
        self,
        role_id: str,
        active_package_ids: Optional[List[str]] = None,
    ) -> Optional[CompositionRoleDefinition]:
        """
        Get a specific role by ID from active packages.

        Args:
            role_id: The role ID to find
            active_package_ids: Packages to search (None = all)

        Returns:
            The role definition, or None if not found
        """
        roles = self.get_available_roles(active_package_ids)
        for role in roles:
            if role.id == role_id:
                return role
        return None


# Singleton instance
_registry = CompositionPackageRegistry()


# Public API functions (backwards compatible)
def register_composition_package(pkg: CompositionPackage) -> None:
    """Register or update a composition package."""
    _registry.register_package(pkg)


def get_composition_package(package_id: str) -> Optional[CompositionPackage]:
    """Get a composition package by ID."""
    return _registry.get(package_id) if _registry.has(package_id) else None


def list_composition_packages() -> Dict[str, CompositionPackage]:
    """Return a snapshot of all registered composition packages."""
    import copy

    return {key: copy.deepcopy(pkg) for key, pkg in _registry._items.items()}


def get_available_roles(
    active_package_ids: Optional[List[str]] = None,
) -> List[CompositionRoleDefinition]:
    """Get all roles from active packages."""
    return _registry.get_available_roles(active_package_ids)


def get_role_by_id(
    role_id: str,
    active_package_ids: Optional[List[str]] = None,
) -> Optional[CompositionRoleDefinition]:
    """Get a specific role by ID from active packages."""
    return _registry.get_role_by_id(role_id, active_package_ids)


def clear_composition_packages() -> None:
    """Clear all registered packages. Mainly for testing."""
    _registry.reset()
    # Reset the core package registration flag so it can be re-registered
    from .core_package import reset_core_composition_registration
    reset_core_composition_registration()
