"""
Asset management request/response schemas
"""
from datetime import datetime
from typing import Optional, List
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
    remote_url: str
    thumbnail_url: Optional[str] = None
    local_path: Optional[str] = None

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

    # Timestamps
    created_at: datetime

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def ensure_thumbnail(self):
        """Guarantee thumbnail_url is present by falling back to remote_url."""
        if getattr(self, "thumbnail_url", None) is None and getattr(self, "remote_url", None):
            object.__setattr__(self, "thumbnail_url", self.remote_url)
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
