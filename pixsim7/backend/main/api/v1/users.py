"""
User management API endpoints
"""
from fastapi import APIRouter, HTTPException
from pixsim7.backend.main.api.dependencies import CurrentUser, UserSvc
from pixsim7.backend.main.shared.schemas.user_schemas import (
    UpdateUserRequest,
    UpdateUserPreferencesRequest,
    UserResponse,
    UserPreferencesResponse,
    UserUsageResponse,
)
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    ValidationError as DomainValidationError,
)

router = APIRouter()


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
    return UserPreferencesResponse(preferences=user.preferences or {})


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
        # Merge with existing preferences
        current_prefs = user.preferences or {}
        updated_prefs = {**current_prefs, **request.preferences}

        # Remove null values (allows deleting preferences)
        updated_prefs = {k: v for k, v in updated_prefs.items() if v is not None}

        # Update user
        updated_user = await user_service.update_user(user.id, preferences=updated_prefs)
        return UserPreferencesResponse(preferences=updated_user.preferences or {})

    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update preferences: {str(e)}")
