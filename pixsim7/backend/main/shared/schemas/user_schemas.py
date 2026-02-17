"""
User management request/response schemas
"""
from datetime import datetime
from typing import Any, Dict, List, Literal
from pydantic import BaseModel, Field, ConfigDict


class DebugPreferences(BaseModel):
    """Debug flag preferences for developer diagnostics."""

    model_config = ConfigDict(extra="allow")

    generation: bool | None = None
    provider: bool | None = None
    worker: bool | None = None
    persistence: bool | None = None
    rehydration: bool | None = None
    stores: bool | None = None
    backend: bool | None = None
    registry: bool | None = None
    websocket: bool | None = None
    validateCompositionVocabs: bool | None = Field(
        default=None,
        description="Validate composition vocab fields against registry",
    )


DevToolSettingValue = bool | int | float | str
DevToolsPreferences = Dict[str, Dict[str, DevToolSettingValue]]


class TagDisplayPreferences(BaseModel):
    """Tag display and behavior preferences."""

    model_config = ConfigDict(extra="allow")

    default_namespace: str | None = None
    favorite_namespaces: List[str] | None = None
    hidden_namespaces: List[str] | None = None
    click_action: Literal["filter", "add_to_search", "copy"] | None = None
    show_usage_counts: bool | None = None
    group_by_namespace: bool | None = None


class AutoTagsPreferences(BaseModel):
    """Auto-tagging preferences for assets based on source."""

    model_config = ConfigDict(extra="allow")

    generated: List[str] | None = None
    synced: List[str] | None = None
    extension: List[str] | None = None
    capture: List[str] | None = None
    uploaded: List[str] | None = None
    local_folder: List[str] | None = None
    include_provider: bool | None = None
    include_operation: bool | None = None
    include_site: bool | None = None


class AnalyzerPreferences(BaseModel):
    """Analyzer tag-application preferences for generated assets."""

    model_config = ConfigDict(extra="allow")

    prompt_default_id: str | None = Field(
        default=None,
        description="Default prompt analyzer ID (e.g., 'prompt:simple')",
    )
    asset_default_image_id: str | None = Field(
        default=None,
        description="Default asset analyzer ID for image media",
    )
    asset_default_video_id: str | None = Field(
        default=None,
        description="Default asset analyzer ID for video media",
    )
    auto_apply_tags: bool | None = None
    tag_prefix: str | None = None


class SyncedFolderMeta(BaseModel):
    """Synced folder metadata used for local-folder recovery."""

    id: str
    name: str
    addedAt: int | None = Field(
        default=None,
        description="Unix timestamp in milliseconds when folder was added",
    )


class UserPreferences(BaseModel):
    """Structured user preferences payload stored in users.preferences JSON."""

    model_config = ConfigDict(extra="allow")

    # Existing broad sections used by app UI
    cubes: Any = None
    workspace: Any = None
    theme: str | None = None
    notifications: Any = None

    # Structured sections
    debug: DebugPreferences | None = None
    devtools: DevToolsPreferences | None = None
    tags: TagDisplayPreferences | None = None
    auto_tags: AutoTagsPreferences | None = None
    analyzer: AnalyzerPreferences | None = None

    # Local folders sync (frontend currently uses camelCase key)
    localFolders: List[SyncedFolderMeta] | None = Field(
        default=None,
        description="Synced local folder metadata for recovery",
    )

    # Content preference keys used by generation/social-context logic
    maxContentRating: Literal["sfw", "romantic", "mature_implied", "restricted"] | None = None
    reduceRomanticIntensity: bool | None = None
    requireMatureContentConfirmation: bool | None = None


# ===== REQUEST SCHEMAS =====

class UpdateUserRequest(BaseModel):
    """Update user profile request"""
    username: str | None = Field(None, min_length=3, max_length=50)
    full_name: str | None = Field(None, max_length=100)


class UpdateUserPreferencesRequest(BaseModel):
    """Update user preferences request"""
    preferences: UserPreferences = Field(..., description="Structured user preferences payload")


class UpdateUserPermissionsRequest(BaseModel):
    """Admin request to replace a user's explicit permissions."""
    permissions: List[str] = Field(default_factory=list)


# ===== RESPONSE SCHEMAS =====

class UserResponse(BaseModel):
    """User profile response"""
    id: int
    email: str
    username: str
    full_name: str | None = None
    role: str
    permissions: List[str] = Field(default_factory=list)
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None
    preferences: UserPreferences = Field(default_factory=UserPreferences)

    class Config:
        from_attributes = True


class UserPreferencesResponse(BaseModel):
    """User preferences response"""
    preferences: UserPreferences = Field(default_factory=UserPreferences)

    class Config:
        from_attributes = True


class UserQuotaResponse(BaseModel):
    """User quota information"""
    max_jobs: int
    max_storage_gb: float
    max_accounts: int

    class Config:
        from_attributes = True


class UserUsageResponse(BaseModel):
    """User usage statistics"""
    user_id: int
    # Job counts
    jobs_total: int
    jobs_pending: int
    jobs_processing: int
    jobs_completed: int
    jobs_failed: int
    # Storage
    storage_used_bytes: int
    storage_used_gb: float
    # Accounts
    accounts_count: int
    # Quotas
    quota: UserQuotaResponse
    # Status
    is_quota_exceeded: bool
    can_create_job: bool

    class Config:
        from_attributes = True


class AdminUserPermissionsResponse(BaseModel):
    """Admin-facing user summary with explicit permission grants."""
    id: int
    email: str
    username: str
    role: str
    is_active: bool
    permissions: List[str] = Field(default_factory=list)
    created_at: datetime
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True


class AdminUsersListResponse(BaseModel):
    users: List[AdminUserPermissionsResponse]
    total: int
