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
)
from .core_package import (
    CORE_COMPOSITION_PACKAGE,
    register_core_composition_package,
)

__all__ = [
    # Types
    "CompositionRoleDefinition",
    "CompositionPackage",
    # Registry functions
    "register_composition_package",
    "get_composition_package",
    "list_composition_packages",
    "get_available_roles",
    "get_role_by_id",
    # Core package
    "CORE_COMPOSITION_PACKAGE",
    "register_core_composition_package",
]
