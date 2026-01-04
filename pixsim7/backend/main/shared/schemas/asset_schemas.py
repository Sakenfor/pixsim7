"""
Asset management request/response schemas
"""
from datetime import datetime
from typing import Optional, List, Literal, Dict
from pydantic import BaseModel, Field, model_validator
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus, ContentDomain, OperationType
from pixsim7.backend.main.shared.schemas.tag_schemas import TagSummary
from pixsim7.backend.main.shared.storage_utils import storage_key_to_url


# ===== REQUEST SCHEMAS =====

class AssetFilterRequest(BaseModel):
    """Filter assets request with advanced search capabilities."""
    # Existing filters
    media_type: Optional[MediaType] = None
    sync_status: Optional[SyncStatus] = None
    provider_id: Optional[str] = None
    tag: Optional[str] = None
    q: Optional[str] = Field(None, description="Full-text search over description and tags")
    limit: int = Field(50, ge=1, le=100)
    offset: int = Field(0, ge=0)

    # Date range filters
    created_from: Optional[datetime] = Field(None, description="Filter by created_at >= value")
    created_to: Optional[datetime] = Field(None, description="Filter by created_at <= value")

    # Dimension filters (use `is not None` checks so 0 works as valid value)
    min_width: Optional[int] = Field(None, ge=0, description="Minimum width")
    max_width: Optional[int] = Field(None, ge=0, description="Maximum width")
    min_height: Optional[int] = Field(None, ge=0, description="Minimum height")
    max_height: Optional[int] = Field(None, ge=0, description="Maximum height")

    # Content filters
    content_domain: Optional[ContentDomain] = Field(None, description="Filter by content domain")
    content_category: Optional[str] = Field(None, description="Filter by content category")
    content_rating: Optional[str] = Field(None, description="Filter by content rating (general/mature/adult/explicit)")

    # Visibility filters
    searchable: Optional[bool] = Field(True, description="Filter by searchable flag (default: true)")

    # Lineage filters (via EXISTS subqueries, not JOINs)
    source_generation_id: Optional[int] = Field(None, description="Filter by source generation ID")
    operation_type: Optional[OperationType] = Field(None, description="Filter by lineage operation type")
    has_parent: Optional[bool] = Field(None, description="Filter assets with/without lineage parent")
    has_children: Optional[bool] = Field(None, description="Filter assets with/without lineage children")

    # Sort options
    sort_by: Optional[str] = Field(None, pattern=r"^(created_at|file_size_bytes)$", description="Sort field")
    sort_dir: Optional[str] = Field("desc", pattern=r"^(asc|desc)$", description="Sort direction")


# ===== RESPONSE SCHEMAS =====

class AssetResponse(BaseModel):
    """Asset information response (aligned with domain Asset)"""
    id: int
    user_id: int

    # Media & provider
    media_type: MediaType
    provider_id: str
    provider_asset_id: str

    # Provenance
    source_generation_id: Optional[int] = None

    # Storage keys (source of truth for file locations)
    stored_key: Optional[str] = None
    thumbnail_key: Optional[str] = None
    preview_key: Optional[str] = None

    # URLs / paths (computed from keys or remote sources)
    remote_url: Optional[str] = None  # Now optional (may be None if only stored locally)
    thumbnail_url: Optional[str] = None  # Computed from thumbnail_key
    preview_url: Optional[str] = None  # Computed from preview_key
    local_path: Optional[str] = None

    # Computed field for frontend to use
    file_url: Optional[str] = None

    # State
    sync_status: SyncStatus
    is_archived: bool = False
    file_size_bytes: Optional[int] = None

    # Media metadata
    duration_sec: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    mime_type: Optional[str] = None

    # Semantics
    description: Optional[str] = None
    tags: List[TagSummary] = Field(default_factory=list)

    # Provider status (derived field)
    provider_status: Optional[Literal["ok", "local_only", "unknown", "flagged"]] = None

    # Upload method (source): 'extension', 'local_folders', 'api', 'generated', etc.
    upload_method: Optional[str] = None

    # Cross-provider upload mapping (provider_id -> uploaded asset URL/ID)
    # Used by frontend to get provider-specific URLs for operations like IMAGE_TO_IMAGE
    provider_uploads: Optional[Dict[str, str]] = None

    # Upload history (Task 104 - derived from media_metadata)
    last_upload_status_by_provider: Optional[Dict[str, Literal['success', 'error']]] = None

    # Versioning (git-like iteration tracking)
    version_family_id: Optional[str] = None
    version_number: Optional[int] = None
    parent_asset_id: Optional[int] = None
    version_message: Optional[str] = None

    # Timestamps
    created_at: datetime

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def compute_urls(self):
        """
        Compute file_url, thumbnail_url, and preview_url with smart fallbacks.

        Priority for file_url:
        1. Local file endpoint (from stored_key if exists)
        2. Legacy local_path endpoint (if local_path exists)
        3. Remote URL (if valid HTTP(S) URL)
        4. None

        Priority for thumbnail_url:
        1. Generated from thumbnail_key
        2. file_url (fallback)

        Priority for preview_url:
        1. Generated from preview_key
        2. file_url (fallback)
        """
        asset_id = getattr(self, "id", None)
        stored_key = getattr(self, "stored_key", None)
        thumbnail_key = getattr(self, "thumbnail_key", None)
        preview_key = getattr(self, "preview_key", None)
        local_path = getattr(self, "local_path", None)
        remote_url = getattr(self, "remote_url", None)
        original_source_url = getattr(self, "original_source_url", None)

        # Helper to check valid HTTP(S) URL
        def is_valid_url(url):
            return url and (url.startswith("http://") or url.startswith("https://"))

        # Compute file_url
        if stored_key:
            # Prefer content-addressed storage key
            object.__setattr__(self, "file_url", storage_key_to_url(stored_key))
        elif local_path:
            # Legacy: local file endpoint
            object.__setattr__(self, "file_url", f"/api/v1/assets/{asset_id}/file")
        elif is_valid_url(remote_url):
            # Use remote URL if it's valid
            object.__setattr__(self, "file_url", remote_url)
        elif is_valid_url(original_source_url):
            # Fall back to original source URL
            object.__setattr__(self, "file_url", original_source_url)
        else:
            # No valid URL available
            object.__setattr__(self, "file_url", None)

        # Compute thumbnail_url from key
        # Priority: thumbnail_key > file_url > remote_url > original_source_url
        if thumbnail_key:
            object.__setattr__(self, "thumbnail_url", storage_key_to_url(thumbnail_key))
        elif getattr(self, "thumbnail_url", None) is None:
            file_url = getattr(self, "file_url", None)
            if file_url:
                object.__setattr__(self, "thumbnail_url", file_url)
            elif is_valid_url(remote_url):
                # Direct fallback to remote_url for thumbnail
                object.__setattr__(self, "thumbnail_url", remote_url)
            elif is_valid_url(original_source_url):
                object.__setattr__(self, "thumbnail_url", original_source_url)

        # Compute preview_url from key
        if preview_key:
            object.__setattr__(self, "preview_url", storage_key_to_url(preview_key))
        elif getattr(self, "preview_url", None) is None:
            file_url = getattr(self, "file_url", None)
            if file_url:
                object.__setattr__(self, "preview_url", file_url)
            elif is_valid_url(remote_url):
                object.__setattr__(self, "preview_url", remote_url)
            elif is_valid_url(original_source_url):
                object.__setattr__(self, "preview_url", original_source_url)

        return self

    @model_validator(mode="before")
    @classmethod
    def extract_upload_history(cls, data):
        """
        Extract upload history from media_metadata (Task 104)

        Reads media_metadata.upload_history.last_upload_status_by_provider
        and exposes it as a top-level field for easy frontend access.
        """
        # Handle both dict and SQLAlchemy model instances
        if hasattr(data, "media_metadata"):
            media_metadata = data.media_metadata
        elif isinstance(data, dict):
            media_metadata = data.get("media_metadata")
        else:
            return data

        # Extract upload history if present
        if media_metadata and isinstance(media_metadata, dict):
            upload_history = media_metadata.get("upload_history")
            if upload_history and isinstance(upload_history, dict):
                last_status = upload_history.get("last_upload_status_by_provider")
                if last_status and isinstance(last_status, dict):
                    # Set the field if data is a dict
                    if isinstance(data, dict):
                        data["last_upload_status_by_provider"] = last_status
                    # For SQLAlchemy models, we'll set it via __dict__
                    elif hasattr(data, "__dict__"):
                        data.__dict__["last_upload_status_by_provider"] = last_status

        return data


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
