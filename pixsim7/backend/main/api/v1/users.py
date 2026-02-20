"""
User management API endpoints
"""
from fastapi import APIRouter, HTTPException, Query
from pixsim7.backend.main.api.dependencies import CurrentAdminUser, CurrentUser, UserSvc
from pixsim7.backend.main.shared.schemas.user_schemas import (
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
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    ValidationError as DomainValidationError,
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


# ===== GET CURRENT USER =====

@router.get("/users/me", response_model=UserResponse)
async def get_current_user(user: CurrentUser):
    """
    Get current authenticated user profile

    Returns the profile information for the currently authenticated user.
    """
    return UserResponse.model_validate(user)


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
            return UserResponse.model_validate(updated_user)

        # No updates provided
        return UserResponse.model_validate(user)

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
    validated = UserPreferences.model_validate(user.preferences or {})
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
        current_prefs = UserPreferences.model_validate(user.preferences or {}).model_dump(exclude_none=True)
        incoming_prefs = request.preferences.model_dump(exclude_unset=True)
        updated_prefs = {**current_prefs, **incoming_prefs}

        # Remove null values (allows deleting preferences)
        updated_prefs = {k: v for k, v in updated_prefs.items() if v is not None}

        # Validate and persist canonical structured keys only.
        validated = UserPreferences.model_validate(updated_prefs)
        validated_dict = validated.model_dump(exclude_none=True)

        # Update user
        updated_user = await user_service.update_user(user.id, preferences=validated_dict)
        response_prefs = UserPreferences.model_validate(updated_user.preferences or {})
        return UserPreferencesResponse(preferences=response_prefs)

    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update preferences: {str(e)}")


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
