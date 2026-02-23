"""Shared role catalog helpers for composition/concepts APIs."""

from __future__ import annotations

from typing import List, Optional, Tuple

from pixsim7.backend.main.shared.composition import get_composition_role_priority

from .package_registry import CompositionRoleDefinition, get_available_roles


def parse_package_ids(packages: Optional[str]) -> Optional[List[str]]:
    """Parse comma-separated package IDs from query params."""
    if not packages:
        return None
    return [p.strip() for p in packages.split(",") if p.strip()]


def get_role_catalog(
    active_package_ids: Optional[List[str]] = None,
) -> Tuple[List[CompositionRoleDefinition], List[str]]:
    """Return ordered roles and effective leaf-role priority."""
    roles = get_available_roles(active_package_ids)
    roles_by_id = {role.id: role for role in roles}

    base_priority = get_composition_role_priority()
    ordered_ids = [role_id for role_id in base_priority if role_id in roles_by_id]
    ordered_set = set(ordered_ids)
    plugin_extra_ids = sorted(
        role_id
        for role_id, role in roles_by_id.items()
        if role_id not in ordered_set and not role.is_group
    )

    effective_priority = [*ordered_ids, *plugin_extra_ids]
    remaining_ids = sorted(role_id for role_id in roles_by_id if role_id not in set(effective_priority))
    ordered_role_ids = [*effective_priority, *remaining_ids]
    ordered_roles = [roles_by_id[role_id] for role_id in ordered_role_ids]
    return ordered_roles, effective_priority
