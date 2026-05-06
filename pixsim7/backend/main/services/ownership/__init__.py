"""Ownership policy helpers.

Abstract primitives live in :mod:`pixsim7.common.ownership` (so sibling
packages can use them without main-backend dependencies); this package
re-exports them and adds the game-domain assertions.
"""
from .policies import (
    AccessFlag,
    OwnershipPolicy,
    OwnershipScope,
    PUBLIC_FLAG,
    SHARED_FLAG,
    SYSTEM_FLAG,
    apply_ownership_filter,
    apply_visibility_filter,
    assert_can_access,
    assert_can_edit,
    assert_can_view,
    assert_session_access,
    assert_world_access,
    gate_admin_only_writes,
)
from .user_owned import (
    UserOwnedListScope,
    assert_can_write_user_owned,
    can_write_user_owned,
    resolve_user_owned_list_scope,
    resolve_user_owner,
)

__all__ = [
    # Scope axis
    "OwnershipScope",
    "OwnershipPolicy",
    "assert_can_access",
    "apply_ownership_filter",
    # Access-flag axis (composable visibility/write modifiers)
    "AccessFlag",
    "SYSTEM_FLAG",
    "SHARED_FLAG",
    "PUBLIC_FLAG",
    "apply_visibility_filter",
    "assert_can_view",
    "assert_can_edit",
    "gate_admin_only_writes",
    # Game-domain access assertions
    "assert_world_access",
    "assert_session_access",
    # User-owned legacy helpers
    "UserOwnedListScope",
    "resolve_user_owner",
    "can_write_user_owned",
    "assert_can_write_user_owned",
    "resolve_user_owned_list_scope",
]
