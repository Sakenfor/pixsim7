"""
User management API endpoints
"""
from typing import Any, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, CurrentUser, DatabaseSession, UserSvc
from pixsim7.backend.main.shared.schemas.user_schemas import (
    AdminUpdateUserRequest,
    AdminUserPermissionsResponse,
    AdminUsersListResponse,
    UpdateUserRequest,
    UpdateUserPermissionsRequest,
    UpdateUserPreferencesRequest,
    UserResponse,
    UserPreferences,
    UserPreferencesResponse,
    UserUsageResponse,
)
from pixsim7.backend.main.shared.auth import hash_password
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    ValidationError as DomainValidationError,
)
from pixsim7.backend.main.services.analysis.analyzer_defaults import (
    canonicalize_analyzer_preferences,
)

router = APIRouter()


def _normalize_permissions(permissions: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for raw in permissions:
        permission = str(raw or "").strip().lower()
        if not permission or permission in seen:
            continue
        seen.add(permission)
        normalized.append(permission)

    return normalized


def _canonicalize_analyzer_preferences_in_payload(preferences: dict) -> dict:
    if not isinstance(preferences, dict):
        return preferences
    analyzer = preferences.get("analyzer")
    if isinstance(analyzer, dict):
        updated = dict(preferences)
        updated["analyzer"] = canonicalize_analyzer_preferences(analyzer)
        return updated
    return preferences


def _build_user_response(user: Any) -> UserResponse:
    response = UserResponse.model_validate(user)
    canonicalized = _canonicalize_analyzer_preferences_in_payload(user.preferences or {})
    response.preferences = UserPreferences.model_validate(canonicalized)
    return response


# ===== GET CURRENT USER =====

@router.get("/users/me", response_model=UserResponse)
async def get_current_user(principal: CurrentUser, user_service: UserSvc):
    """
    Get current authenticated user profile

    Returns the profile information for the currently authenticated user.
    """
    user = await user_service.get_user(principal.id)
    return _build_user_response(user)


# ===== UPDATE CURRENT USER =====

@router.patch("/users/me", response_model=UserResponse)
async def update_current_user(
    request: UpdateUserRequest,
    user: CurrentUser,
    user_service: UserSvc
):
    """
    Update current user profile

    Allows updating username and full_name for the current user.
    Email and role cannot be changed through this endpoint.
    """
    try:
        # Build updates dict
        updates = {}
        if request.username is not None:
            updates["username"] = request.username
        if request.full_name is not None:
            updates["full_name"] = request.full_name

        # Update user
        if updates:
            updated_user = await user_service.update_user(user.id, **updates)
            return _build_user_response(updated_user)

        # No updates provided — load full user for response
        full_user = await user_service.get_user(user.id)
        return _build_user_response(full_user)

    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")


# ===== GET USER USAGE =====

@router.get("/users/me/usage", response_model=UserUsageResponse)
async def get_user_usage(
    user: CurrentUser,
    user_service: UserSvc
):
    """
    Get current user usage statistics

    Returns:
    - Job counts (total, pending, processing, completed, failed)
    - Storage usage
    - Account count
    - Quota information
    - Status flags (quota exceeded, can create job)
    """
    try:
        usage = await user_service.get_user_usage(user.id)
        return UserUsageResponse.model_validate(usage)

    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="Usage data not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get usage: {str(e)}")


# ===== GET USER PREFERENCES =====

@router.get("/users/me/preferences", response_model=UserPreferencesResponse)
async def get_user_preferences(user: CurrentUser):
    """
    Get current user preferences

    Returns the preferences dictionary for the currently authenticated user.
    Preferences can include theme, notification settings, cube state, etc.
    """
    canonicalized = _canonicalize_analyzer_preferences_in_payload(user.preferences or {})
    validated = UserPreferences.model_validate(canonicalized)
    return UserPreferencesResponse(preferences=validated)


# ===== UPDATE USER PREFERENCES =====

@router.patch("/users/me/preferences", response_model=UserPreferencesResponse)
async def update_user_preferences(
    request: UpdateUserPreferencesRequest,
    user: CurrentUser,
    user_service: UserSvc
):
    """
    Update current user preferences

    Merges the provided preferences with existing preferences.
    To delete a preference key, set its value to null in the request.
    """
    try:
        # Merge with existing preferences (patch semantics at top level).
        current_raw_prefs = _canonicalize_analyzer_preferences_in_payload(user.preferences or {})
        current_prefs = UserPreferences.model_validate(current_raw_prefs).model_dump(exclude_none=True)
        incoming_prefs = request.preferences.model_dump(exclude_unset=True)
        updated_prefs = {**current_prefs, **incoming_prefs}

        # Remove null values (allows deleting preferences)
        updated_prefs = {k: v for k, v in updated_prefs.items() if v is not None}

        # Validate and persist canonical structured keys only.
        canonicalized_prefs = _canonicalize_analyzer_preferences_in_payload(updated_prefs)
        validated = UserPreferences.model_validate(canonicalized_prefs)
        validated_dict = validated.model_dump(exclude_none=True)

        # Update user
        updated_user = await user_service.update_user(user.id, preferences=validated_dict)
        response_canonicalized = _canonicalize_analyzer_preferences_in_payload(
            updated_user.preferences or {}
        )
        response_prefs = UserPreferences.model_validate(response_canonicalized)
        return UserPreferencesResponse(preferences=response_prefs)

    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update preferences: {str(e)}")


# ===== DEBUG SETTINGS META =====


@router.get("/users/me/debug/categories")
async def get_debug_categories(principal: CurrentUser):
    """Return available debug categories with descriptions and current state."""
    from pixsim7.backend.main.services.debug import DebugSettings

    current = DebugSettings.from_dict(
        (principal.preferences or {}).get("debug", {})
    )
    categories = []
    for name, field_info in DebugSettings.model_fields.items():
        categories.append({
            "id": name,
            "description": field_info.description or "",
            "enabled": getattr(current, name, False),
            "default": field_info.default,
        })
    return {"categories": categories}


# ===== LOCAL FOLDER HASH CACHE =====


class HashManifestEntry(BaseModel):
    relativePath: str
    sha256: str
    fileSize: int | None = None
    lastModified: int | None = None


class HashManifestUpload(BaseModel):
    relativePath: str
    sha256: str
    fileSize: int | None = None
    lastModified: int | None = None


class HashManifestResponse(BaseModel):
    folder_id: str
    manifest: List[HashManifestEntry] = Field(default_factory=list)
    updated_at: str | None = None


@router.get(
    "/users/me/local-folder-hashes/{folder_id}",
    response_model=HashManifestResponse,
)
async def get_folder_hash_manifest(
    folder_id: str,
    principal: CurrentUser,
    db: DatabaseSession,
):
    """Return the persisted hash manifest for a local folder."""
    from sqlalchemy import select
    from pixsim7.backend.main.domain.local_folder_hash_cache import LocalFolderHashCache

    row = (
        await db.execute(
            select(LocalFolderHashCache).where(
                LocalFolderHashCache.user_id == principal.id,
                LocalFolderHashCache.folder_id == folder_id,
            )
        )
    ).scalar_one_or_none()

    if not row:
        return HashManifestResponse(folder_id=folder_id, manifest=[], updated_at=None)

    return HashManifestResponse(
        folder_id=folder_id,
        manifest=[HashManifestEntry(**e) for e in (row.manifest or [])],
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.put(
    "/users/me/local-folder-hashes/{folder_id}",
    response_model=HashManifestResponse,
)
async def upsert_folder_hash_manifest(
    folder_id: str,
    manifest: List[HashManifestUpload],
    principal: CurrentUser,
    db: DatabaseSession,
):
    """Create or replace the hash manifest for a local folder."""
    from sqlalchemy import select
    from pixsim7.backend.main.domain.local_folder_hash_cache import LocalFolderHashCache
    from pixsim7.backend.main.shared.datetime_utils import utcnow

    entries = [e.model_dump() for e in manifest]
    now = utcnow()

    row = (
        await db.execute(
            select(LocalFolderHashCache).where(
                LocalFolderHashCache.user_id == principal.id,
                LocalFolderHashCache.folder_id == folder_id,
            )
        )
    ).scalar_one_or_none()

    if row:
        row.manifest = entries
        row.updated_at = now
    else:
        row = LocalFolderHashCache(
            user_id=principal.id,
            folder_id=folder_id,
            manifest=entries,
            updated_at=now,
        )
        db.add(row)

    await db.commit()
    await db.refresh(row)

    return HashManifestResponse(
        folder_id=folder_id,
        manifest=[HashManifestEntry(**e) for e in row.manifest],
        updated_at=row.updated_at.isoformat() if row.updated_at else None,
    )


@router.delete("/users/me/local-folder-hashes/{folder_id}", status_code=204)
async def delete_folder_hash_manifest(
    folder_id: str,
    principal: CurrentUser,
    db: DatabaseSession,
):
    """Delete the hash manifest when a folder is removed."""
    from sqlalchemy import delete
    from pixsim7.backend.main.domain.local_folder_hash_cache import LocalFolderHashCache

    await db.execute(
        delete(LocalFolderHashCache).where(
            LocalFolderHashCache.user_id == principal.id,
            LocalFolderHashCache.folder_id == folder_id,
        )
    )
    await db.commit()


# ===== ADMIN: USER PERMISSIONS =====

@router.get("/admin/users", response_model=AdminUsersListResponse)
async def list_users_for_admin(
    admin: CurrentAdminUser,
    user_service: UserSvc,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str | None = Query(default=None, max_length=255),
):
    """
    Admin-only user listing with explicit permission grants.
    """
    _ = admin
    try:
        users = await user_service.list_users(limit=limit, offset=offset, search=search)
        total = await user_service.count_users(search=search)
        return AdminUsersListResponse(
            users=[AdminUserPermissionsResponse.model_validate(user) for user in users],
            total=total,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list users: {str(e)}")


@router.put("/admin/users/{user_id}/permissions", response_model=AdminUserPermissionsResponse)
async def update_user_permissions_for_admin(
    user_id: int,
    request: UpdateUserPermissionsRequest,
    admin: CurrentAdminUser,
    user_service: UserSvc,
):
    """
    Admin-only endpoint to replace a user's explicit permission list.
    """
    _ = admin
    try:
        normalized_permissions = _normalize_permissions(request.permissions)
        updated_user = await user_service.update_user(user_id, permissions=normalized_permissions)
        return AdminUserPermissionsResponse.model_validate(updated_user)
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="User not found")
    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user permissions: {str(e)}")


@router.patch("/admin/users/{user_id}", response_model=AdminUserPermissionsResponse)
async def admin_update_user(
    user_id: int,
    request: AdminUpdateUserRequest,
    admin: CurrentAdminUser,
    user_service: UserSvc,
):
    """
    Admin-only endpoint to update a user's role, active status, password, or permissions.
    """
    _ = admin
    try:
        updates: dict[str, Any] = {}
        if request.role is not None:
            updates["role"] = request.role
        if request.is_active is not None:
            updates["is_active"] = request.is_active
        if request.password is not None:
            updates["password_hash"] = await hash_password(request.password)
        if request.permissions is not None:
            updates["permissions"] = _normalize_permissions(request.permissions)

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        updated_user = await user_service.update_user(user_id, **updates)
        return AdminUserPermissionsResponse.model_validate(updated_user)
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="User not found")
    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")


@router.delete("/admin/users/{user_id}", response_model=AdminUserPermissionsResponse)
async def admin_deactivate_user(
    user_id: int,
    admin: CurrentAdminUser,
    user_service: UserSvc,
):
    """
    Admin-only endpoint to deactivate a user (soft delete).
    """
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    try:
        await user_service.delete_user(user_id)
        user = await user_service.get_user(user_id)
        return AdminUserPermissionsResponse.model_validate(user)
    except ResourceNotFoundError:
        raise HTTPException(status_code=404, detail="User not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to deactivate user: {str(e)}")
