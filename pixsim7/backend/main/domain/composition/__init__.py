"""
Composition Package System

Provides pluggable composition roles for image/video generation.
Packages contribute roles, world config sets policies.

Usage:
    from pixsim7.backend.main.domain.composition import (
        register_composition_package,
        get_available_roles,
        list_composition_packages,
    )
"""

from .package_registry import (
    CompositionRoleDefinition,
    CompositionPackage,
    register_composition_package,
    get_composition_package,
    list_composition_packages,
    get_available_roles,
    get_role_by_id,
    clear_composition_packages,
)
from .package_loader import (
    load_composition_package_from_yaml,
    register_composition_package_from_yaml,
    register_composition_packages_from_dir,
)
from .core_package import (
    CORE_COMPOSITION_PACKAGE,
    register_core_composition_package,
    reset_core_composition_registration,
)
from .role_resolver import (
    resolve_role,
    resolve_role_from_tags,
    resolve_role_from_prompt_role,
)

__all__ = [
    # Types
    "CompositionRoleDefinition",
    "CompositionPackage",
    # Registry functions
    "register_composition_package",
    "load_composition_package_from_yaml",
    "register_composition_package_from_yaml",
    "register_composition_packages_from_dir",
    "get_composition_package",
    "list_composition_packages",
    "get_available_roles",
    "get_role_by_id",
    "clear_composition_packages",
    # Core package
    "CORE_COMPOSITION_PACKAGE",
    "register_core_composition_package",
    "reset_core_composition_registration",
    # Role resolver
    "resolve_role",
    "resolve_role_from_tags",
    "resolve_role_from_prompt_role",
]
