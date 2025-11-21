"""
Asset management request/response schemas
"""
from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, model_validator
from pixsim7_backend.domain.enums import MediaType, SyncStatus


# ===== REQUEST SCHEMAS =====

class AssetFilterRequest(BaseModel):
    """Filter assets request (offset-based, legacy)"""
    media_type: Optional[MediaType] = None
    sync_status: Optional[SyncStatus] = None
    provider_id: Optional[str] = None
    tag: Optional[str] = None
    q: Optional[str] = None
    limit: int = Field(50, ge=1, le=100)
    offset: int = Field(0, ge=0)


# ===== RESPONSE SCHEMAS =====

class AssetResponse(BaseModel):
    """Asset information response (aligned with domain Asset)"""
    id: int
    user_id: int

    # Media & provider
    media_type: MediaType
    provider_id: str
    provider_asset_id: str

    # URLs / paths
    remote_url: Optional[str] = None  # Now optional (may be None if only stored locally)
    thumbnail_url: Optional[str] = None
    local_path: Optional[str] = None

    # Computed field for frontend to use
    file_url: Optional[str] = None

    # Sync
    sync_status: SyncStatus
    file_size_bytes: Optional[int] = None

    # Media metadata
    duration_sec: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    mime_type: Optional[str] = None

    # Semantics
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)

    # Provider status (derived field)
    provider_status: Optional[Literal["ok", "local_only", "unknown", "flagged"]] = None

    # Provider moderation/flagging
    provider_flagged: bool = False
    provider_flag_reason: Optional[str] = None

    # Timestamps
    created_at: datetime

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def compute_urls(self):
        """
        Compute file_url and thumbnail_url with smart fallbacks.

        Priority for file_url:
        1. Local file endpoint (if local_path exists)
        2. Remote URL (if valid HTTP(S) URL)
        3. None

        Priority for thumbnail_url:
        1. Explicit thumbnail_url (if set)
        2. file_url (computed above)
        """
        asset_id = getattr(self, "id", None)
        local_path = getattr(self, "local_path", None)
        remote_url = getattr(self, "remote_url", None)

        # Compute file_url
        if local_path:
            # Prefer local file endpoint
            object.__setattr__(self, "file_url", f"/api/v1/assets/{asset_id}/file")
        elif remote_url and (remote_url.startswith("http://") or remote_url.startswith("https://")):
            # Use remote URL if it's valid
            object.__setattr__(self, "file_url", remote_url)
        else:
            # No valid URL available
            object.__setattr__(self, "file_url", None)

        # Compute thumbnail_url fallback
        if getattr(self, "thumbnail_url", None) is None:
            file_url = getattr(self, "file_url", None)
            if file_url:
                object.__setattr__(self, "thumbnail_url", file_url)

        return self


class AssetListResponse(BaseModel):
    """Asset list response with pagination (offset-based, legacy)"""
    assets: list[AssetResponse]
    total: int
    limit: int
    offset: int
    next_cursor: Optional[str] = Field(default=None, description="Opaque cursor for next page if available")


class AssetStatsResponse(BaseModel):
    """Asset storage statistics"""
    total_assets: int
    total_size_bytes: int
    total_size_gb: float
    by_media_type: dict[str, int]
    by_sync_status: dict[str, int]
