"""Helpers for user-owned resources (owner + public visibility semantics)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from fastapi import HTTPException

from pixsim7.backend.main.shared.entity_refs import entity_ref_to_string, extract_entity_id


@dataclass(frozen=True)
class UserOwnedListScope:
    """Normalized list scope for user-owned resources."""

    owner_user_id: Optional[int]
    is_public: Optional[bool]
    include_public_for_owner: bool


def _is_admin_user(user: Any) -> bool:
    if user is None:
        return False
    admin_attr = getattr(user, "is_admin", None)
    if callable(admin_attr):
        return bool(admin_attr())
    return bool(admin_attr)


def _normalize_username(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def resolve_user_owner(
    *,
    model_owner_user_id: Any = None,
    owner_payload: Any = None,
    created_by: Any = None,
) -> Dict[str, Optional[Any]]:
    """Resolve canonical owner fields from model column + flexible payload."""
    owner = owner_payload if isinstance(owner_payload, dict) else {}

    owner_user_id = extract_entity_id(
        model_owner_user_id,
        entity_type="user",
        default_type="user",
    )
    if owner_user_id is None:
        owner_user_id = extract_entity_id(
            owner.get("user_id"),
            entity_type="user",
            default_type="user",
        )

    owner_ref = entity_ref_to_string(
        owner.get("entity_ref") or owner.get("ref"),
        default_type="user",
    )
    if owner_user_id is None:
        owner_user_id = extract_entity_id(owner_ref, entity_type="user")
    if owner_user_id is not None:
        ref_owner_id = extract_entity_id(owner_ref, entity_type="user") if owner_ref else None
        if ref_owner_id != owner_user_id:
            owner_ref = f"user:{owner_user_id}"

    owner_username = _normalize_username(owner.get("username"))
    if owner_username is None:
        owner_username = _normalize_username(owner.get("name"))
    if owner_username is None:
        owner_username = _normalize_username(created_by)

    return {
        "owner_user_id": owner_user_id,
        "owner_ref": owner_ref,
        "owner_username": owner_username,
    }


def can_write_user_owned(
    *,
    user: Any,
    owner_user_id: Optional[int],
    created_by: Any = None,
) -> bool:
    """Return True when user can modify a user-owned resource."""
    if _is_admin_user(user):
        return True
    if owner_user_id is not None and owner_user_id == getattr(user, "id", None):
        return True

    created_by_name = _normalize_username(created_by)
    user_name = _normalize_username(getattr(user, "username", None))
    return bool(created_by_name and user_name and created_by_name == user_name)


def assert_can_write_user_owned(
    *,
    user: Any,
    owner_user_id: Optional[int],
    created_by: Any = None,
    denied_detail: str = "Not allowed to modify this resource",
) -> None:
    """Raise HTTP 403 when the user cannot modify a user-owned resource."""
    if can_write_user_owned(user=user, owner_user_id=owner_user_id, created_by=created_by):
        return
    raise HTTPException(status_code=403, detail=denied_detail)


def resolve_user_owned_list_scope(
    *,
    current_user: Any,
    requested_owner_user_id: Optional[int],
    requested_is_public: Optional[bool],
    mine: bool,
    include_public_when_mine: bool,
    mine_requires_auth_detail: str = "Authentication required for mine=true",
    mine_forbidden_cross_owner_detail: str = "Not allowed to query another user's templates with mine=true",
    private_owner_forbidden_detail: str = "Not allowed to query private templates of another user",
) -> UserOwnedListScope:
    """Normalize owner/public list parameters with auth-aware safeguards."""
    effective_owner_user_id = requested_owner_user_id
    include_public_for_owner = False
    effective_is_public = requested_is_public

    if mine:
        if current_user is None:
            raise HTTPException(status_code=401, detail=mine_requires_auth_detail)
        requested_owner = requested_owner_user_id
        effective_owner_user_id = current_user.id
        include_public_for_owner = bool(include_public_when_mine)
        if (
            requested_owner is not None
            and requested_owner != current_user.id
            and not _is_admin_user(current_user)
        ):
            raise HTTPException(status_code=403, detail=mine_forbidden_cross_owner_detail)
    elif (
        effective_owner_user_id is not None
        and (
            current_user is None
            or (not _is_admin_user(current_user) and effective_owner_user_id != current_user.id)
        )
    ):
        if effective_is_public is False:
            raise HTTPException(status_code=403, detail=private_owner_forbidden_detail)
        effective_is_public = True

    return UserOwnedListScope(
        owner_user_id=effective_owner_user_id,
        is_public=effective_is_public,
        include_public_for_owner=include_public_for_owner,
    )
