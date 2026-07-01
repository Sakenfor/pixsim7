"""
Asset management request/response schemas
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Literal, Dict, Any, Union
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus, ContentDomain, OperationType
from pixsim7.backend.main.shared.schemas.tag_schemas import TagSummary

# Canonical asset kind values — extend this tuple when adding new kinds
ASSET_KINDS = ("content", "mask", "guidance", "reference", "extracted_frame", "probe")
AssetKind = Literal["content", "mask", "guidance", "reference", "extracted_frame", "probe"]
from pixsim7.backend.main.shared.storage_utils import storage_key_to_url
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    normalize_url as normalize_pixverse_url,
)


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
    asset_kind: Optional[str] = Field("content", description="Filter by asset kind (content/mask/guidance/reference). None = all kinds.")

    # Lineage filters (via EXISTS subqueries, not JOINs)
    source_generation_id: Optional[int] = Field(None, description="Filter by source generation ID")
    sha256: Optional[str] = Field(None, description="Filter by content hash (exact match)")
    operation_type: Optional[OperationType] = Field(None, description="Filter by lineage operation type")
    has_parent: Optional[bool] = Field(None, description="Filter assets with/without lineage parent")
    has_children: Optional[bool] = Field(None, description="Filter assets with/without lineage children")

    # Sort options
    sort_by: Optional[str] = Field(None, pattern=r"^(created_at|file_size_bytes)$", description="Sort field")
    sort_dir: Optional[str] = Field("desc", pattern=r"^(asc|desc)$", description="Sort direction")


class AssetGroupBy(str, Enum):
    source = "source"
    generation = "generation"
    prompt = "prompt"
    sibling = "sibling"


class AssetGroupPathEntry(BaseModel):
    group_by: AssetGroupBy
    group_key: str


class AssetSearchRequest(BaseModel):
    """Request body for asset search."""
    filters: dict[str, Any] = Field(
        default_factory=dict,
        description="Filter key/value pairs (registry-defined)",
    )
    group_filter: dict[str, Any] | None = Field(
        None,
        description="Optional registry filters that scope grouping eligibility",
    )
    group_path: list[AssetGroupPathEntry] = Field(
        default_factory=list,
        description="Nested grouping path (ordered list of group_by + group_key)",
    )
    tag: str | list[str] | None = Field(None, description="Filter assets containing tag (slug)")
    q: Optional[str] = Field(None, description="Full-text search over description/tags")
    include_archived: bool = Field(False, description="Include archived assets (default: false)")
    archived_only: bool = Field(False, description="Restrict to ONLY archived assets (overrides include_archived)")
    searchable: Optional[bool] = Field(True, description="Filter by searchable flag (default: true)")

    created_from: datetime | None = Field(None, description="Filter by created_at >= value")
    created_to: datetime | None = Field(None, description="Filter by created_at <= value")
    min_width: int | None = Field(None, ge=0, description="Minimum width")
    max_width: int | None = Field(None, ge=0, description="Maximum width")
    min_height: int | None = Field(None, ge=0, description="Minimum height")
    max_height: int | None = Field(None, ge=0, description="Maximum height")

    content_domain: ContentDomain | None = Field(None, description="Filter by content domain")
    content_category: str | None = Field(None, description="Filter by content category")
    content_rating: str | None = Field(None, description="Filter by content rating")

    provider_status: str | None = Field(None, description="Filter by provider status (ok, local_only, flagged, unknown, not_flagged)")
    sync_status: SyncStatus | None = Field(None, description="Filter by sync status")

    source_generation_id: int | None = Field(None, description="Filter by source generation ID")
    source_asset_id: int | None = Field(None, description="Filter by source asset ID")
    sha256: str | None = Field(None, description="Filter by content hash (exact match)")
    operation_type: OperationType | None = Field(None, description="Filter by lineage operation type")
    asset_operation_type: OperationType | None = Field(
        None,
        description="Filter by the denormalized Asset.operation_type COLUMN (set on generated "
        "assets; NULL for uploads/masks/frames). Unlike `operation_type` (a lineage EXISTS "
        "subquery), this rides the (user_id, operation_type, created_at) index, so it's the fast "
        "path for time-cohort neighbor walking where the filter value is the pivot's own column.",
    )
    has_parent: bool | None = Field(None, description="Has lineage parent")
    has_children: bool | None = Field(None, description="Has lineage children")

    asset_ids: list[int] | None = Field(None, description="Whitelist of asset IDs to include")

    upload_source_folder_id: str | None = Field(
        None,
        description="Filter by upload_context.source_folder_id (the user's tracked local folder). "
        "Used by the 'Source' cohort to walk same-folder siblings.",
    )
    upload_source_subfolder: str | None = Field(
        None,
        description="Filter by upload_context.source_subfolder (narrow to a subdirectory within the "
        "source folder). Pair with upload_source_folder_id. Empty string matches root-of-folder files.",
    )
    source_siblings_of_asset_id: int | None = Field(
        None,
        description="Server-side resolves the pivot asset's upload_context.source_folder_id and "
        "source_subfolder and applies them as filters. Use when the caller has the asset id but not "
        "its full upload_context payload.",
    )

    similar_to: int | None = Field(None, description="Asset ID for visual similarity search")
    similarity_threshold: float | None = Field(None, ge=0.0, le=1.0, description="Min similarity 0-1, default 0.3")
    embedder_id: str | None = Field(None, description="Embedder space to search in; defaults to user's primary")

    similar_prompt_version_id: UUID | None = Field(
        None,
        description="Prompt version ID for semantic prompt-similarity search "
        "(returns assets generated from semantically similar prompt versions)",
    )
    prompt_similarity_threshold: float | None = Field(
        None, ge=0.0, le=1.0, description="Min prompt similarity 0-1, default 0.5"
    )

    prompt_version_id: UUID | None = Field(None, description="Filter by prompt version ID")
    prompt_family_id: UUID | None = Field(None, description="Filter by prompt family ID (all versions of a prompt)")
    input_assets_key: str | None = Field(None, description="Filter by input-assets key (assets sharing the same input-asset set)")

    group_by: AssetGroupBy | None = Field(None, description="Group key to filter assets by (source, generation, prompt, sibling)")
    group_key: str | None = Field(
        None,
        description="Group value to filter assets by (use 'ungrouped' or 'other')",
    )

    sort_by: str | None = Field(None, pattern=r"^(created_at|file_size_bytes)$", description="Sort field")
    sort_dir: str = Field("desc", pattern=r"^(asc|desc)$", description="Sort direction")
    include_total: bool = Field(
        True,
        description="When true, computes exact total count. Set false to skip expensive count query.",
    )
    limit: int = Field(50, ge=1, le=100, description="Results per page")
    offset: int = Field(0, ge=0, description="Pagination offset (legacy)")
    cursor: str | None = Field(None, description="Opaque cursor for pagination")


class AssetGroupRequest(AssetSearchRequest):
    """Request body for asset grouping."""
    group_by: AssetGroupBy = Field(..., description="Group assets by this key")
    preview_limit: int = Field(4, ge=0, le=12, description="Preview assets per group")


# ===== RESPONSE SCHEMAS =====

class AssetResponse(BaseModel):
    """Asset information response (aligned with domain Asset)"""
    id: int
    user_id: int

    # Identity
    sha256: Optional[str] = None  # Content hash (64-char hex, for dedup/similarity)

    # Media & provider
    media_type: MediaType
    provider_id: str
    provider_asset_id: str
    model: Optional[str] = None

    # Provenance
    source_generation_id: Optional[int] = None
    operation_type: Optional[str] = None
    reproducible_hash: Optional[str] = None
    # Grouping key for "same input assets" siblings (sorted source-asset-id set).
    input_assets_key: Optional[str] = None
    # Prompt version reference (FK -> prompt_versions.id). Stable across prompt
    # text tweaks; the cohort key for "same prompt" grouping/navigation.
    prompt_version_id: Optional[str] = None
    # Prompt family (denormalized) — cohort key for "same prompt (all versions)".
    prompt_family_id: Optional[str] = None
    # Provider generation seed (denormalized Asset.gen_seed). Null when the
    # asset has no meaningful seed (uploads, seedless or random-seed generations).
    gen_seed: Optional[int] = None

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
    prompt: Optional[str] = None
    description: Optional[str] = None
    tags: List[TagSummary] = Field(default_factory=list)

    # Provider status (derived field)
    provider_status: Optional[Literal["ok", "local_only", "unknown", "flagged"]] = None

    # True when a provider-side removal ("delete only on provider") was attempted
    # but the provider rejected it — the remote copy is still present. Derived
    # from media_metadata.provider_removal_failed. Lets the gallery flag that the
    # removal didn't take and needs a retry.
    provider_removal_failed: bool = False

    # Recovered from a Pixverse false-filter / stuck-processing state
    # (derived from media_metadata.image_false_filter_recovered). Set for
    # every CDN-salvaged image regardless of the original 7/8/9/processing
    # status, so the gallery can surface a distinct "recovered" indicator.
    recovered: bool = False

    # Signal / video-health heuristic. signal_score (0-6) and signal_override
    # ('clean'|'broken') are flat mirrors of the Asset columns (auto-populated via
    # from_attributes); signal_suspicious is the heuristic's own verdict, computed
    # from media_metadata.signal_metrics at build time. Surfaced so the gallery
    # can flag suspected-broken videos at a glance.
    signal_score: Optional[int] = None
    signal_override: Optional[str] = None
    signal_suspicious: bool = False

    # Asset kind (purpose)
    asset_kind: AssetKind = "content"

    # Upload method (source): 'web', 'local', 'pixverse_sync', 'generated', 'video_capture'
    upload_method: Optional[str] = None
    # Upload context captured at ingestion time (validated against schema)
    upload_context: Optional[Dict[str, Any]] = None

    # Cross-provider upload mapping (provider_id -> uploaded asset URL/ID)
    # Used by frontend to get provider-specific URLs for operations like IMAGE_TO_IMAGE
    provider_uploads: Optional[Dict[str, Any]] = None

    # Upload history (Task 104 - derived from media_metadata)
    last_upload_status_by_provider: Optional[Dict[str, Literal['success', 'error']]] = None

    # Versioning (git-like iteration tracking)
    version_family_id: Optional[str] = None
    version_number: Optional[int] = None
    parent_asset_id: Optional[int] = None
    version_message: Optional[str] = None

    @field_validator("version_family_id", "prompt_version_id", "prompt_family_id", mode="before")
    @classmethod
    def _coerce_uuid_to_str(cls, v: Any) -> Optional[str]:
        if v is None:
            return None
        return str(v)

    # Generation context availability (computed)
    has_generation_context: bool = False

    # Lineage: whether any other asset lists this one as its source/parent (computed at response build time)
    has_children: bool = False

    # NOTE: sibling/cohort counts are NO LONGER carried on the asset response.
    # Computing them inline ran ~7 GROUP BY queries per asset on the hot path
    # (every asset:created/updated event + thumbnail poll), and the badge that
    # consumes them is hover-gated. They now load lazily from the dedicated
    # GET /assets/{id}/cohort-counts (single) and POST /assets/cohort-counts
    # (batch) endpoints. See plan media-card-sibling-badges and
    # services/asset/sibling_counts.py.

    # Artificial-extend lineage (computed from media_metadata.generation_context.artificial_extend)
    # When present, asset was produced via the "extend via last-frame i2v" flow.
    artificial_extend: Optional[Dict[str, Any]] = None

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
        2. thumbnail_url (smaller, prevents serving full-resolution originals
           as the gallery's visible card image when previews are disabled —
           18 MP source images cause severe scroll lag in the gallery, which
           passes preview_url as the card thumb)
        3. remote_url / original_source_url (only when no local thumbnail exists)
        """
        asset_id = getattr(self, "id", None)
        provider_id = getattr(self, "provider_id", None)
        stored_key = getattr(self, "stored_key", None)
        thumbnail_key = getattr(self, "thumbnail_key", None)
        preview_key = getattr(self, "preview_key", None)
        local_path = getattr(self, "local_path", None)
        remote_url = getattr(self, "remote_url", None)
        original_source_url = getattr(self, "original_source_url", None)

        if provider_id == "pixverse" and remote_url:
            normalized_remote = normalize_pixverse_url(remote_url)
            if normalized_remote:
                remote_url = normalized_remote
                object.__setattr__(self, "remote_url", normalized_remote)

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
        # Priority: thumbnail_key > provider_thumbnail_url > file_url > remote_url > original_source_url
        # provider_thumbnail_url is the provider's last-frame image URL (Pixverse:
        # customer_video_last_frame_url / last_frame), stashed in media_metadata
        # during asset creation by the strict status extractor. It's an image
        # (not video) so the frontend can display it immediately before local
        # ingestion generates a thumbnail.
        media_type = getattr(self, "media_type", None)
        media_type_value = getattr(media_type, "value", media_type)
        media_metadata = getattr(self, "media_metadata", None) or {}
        provider_thumb = media_metadata.get("provider_thumbnail_url") if isinstance(media_metadata, dict) else None
        # For video assets the remote/file URLs are video files, not images —
        # using them as thumbnail/preview causes 404 fetches (CDN propagation)
        # and confuses frontend thumbnail logic.  Only fall back to them for
        # non-video (image) assets.
        is_video = str(media_type_value).lower() == "video"

        if thumbnail_key:
            object.__setattr__(self, "thumbnail_url", storage_key_to_url(thumbnail_key))
        elif is_valid_url(provider_thumb):
            object.__setattr__(self, "thumbnail_url", provider_thumb)
        elif not is_video and getattr(self, "thumbnail_url", None) is None:
            file_url = getattr(self, "file_url", None)
            if file_url:
                object.__setattr__(self, "thumbnail_url", file_url)
            elif is_valid_url(remote_url):
                object.__setattr__(self, "thumbnail_url", remote_url)
            elif is_valid_url(original_source_url):
                object.__setattr__(self, "thumbnail_url", original_source_url)

        # Compute preview_url from key. When no preview derivative exists,
        # fall back to the thumbnail rather than the full-resolution file —
        # the gallery card uses preview_url as its visible image, and serving
        # an 18 MP original per card chokes the browser's image decoder.
        if preview_key:
            object.__setattr__(self, "preview_url", storage_key_to_url(preview_key))
        elif not is_video and getattr(self, "preview_url", None) is None:
            thumbnail_url = getattr(self, "thumbnail_url", None)
            if thumbnail_url:
                object.__setattr__(self, "preview_url", thumbnail_url)
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

        Also computes has_generation_context: True when asset has either a
        source_generation_id or usable media_metadata (prompt / create_mode).
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

        # Compute has_generation_context
        source_gen_id = (
            data.get("source_generation_id") if isinstance(data, dict)
            else getattr(data, "source_generation_id", None)
        )
        has_ctx = source_gen_id is not None
        if not has_ctx and media_metadata and isinstance(media_metadata, dict):
            # Fast path: stamped generation_context dict
            if media_metadata.get("generation_context"):
                has_ctx = True
            else:
                # Legacy fallback: check raw metadata heuristics
                customer_paths = media_metadata.get("customer_paths", {})
                has_prompt = bool(
                    (customer_paths.get("prompt") if isinstance(customer_paths, dict) else None)
                    or media_metadata.get("prompt")
                    or media_metadata.get("text")
                )
                has_create_mode = bool(
                    (customer_paths.get("create_mode") if isinstance(customer_paths, dict) else None)
                    or media_metadata.get("create_mode")
                )
                has_ctx = has_prompt or has_create_mode

        if isinstance(data, dict):
            data["has_generation_context"] = has_ctx
        elif hasattr(data, "__dict__"):
            data.__dict__["has_generation_context"] = has_ctx

        # Surface artificial_extend lineage from generation_context, if any.
        artificial_extend = None
        if media_metadata and isinstance(media_metadata, dict):
            gen_ctx = media_metadata.get("generation_context")
            if isinstance(gen_ctx, dict):
                ae = gen_ctx.get("artificial_extend")
                if isinstance(ae, dict):
                    artificial_extend = ae
        if isinstance(data, dict):
            data["artificial_extend"] = artificial_extend
        elif hasattr(data, "__dict__"):
            data.__dict__["artificial_extend"] = artificial_extend

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


class AssetGenerationContext(BaseModel):
    """
    Generation-equivalent context resolved from either a Generation record
    or asset media_metadata.  Read-only — no DB writes.
    """
    source: Literal["generation", "metadata"]
    operation_type: str
    provider_id: str
    final_prompt: Optional[str] = None
    canonical_params: Dict[str, Any] = Field(default_factory=dict)
    inputs: List[Dict[str, Any]] = Field(default_factory=list)
    source_asset_ids: List[int] = Field(default_factory=list)


class AssetGroupSourceMeta(BaseModel):
    kind: Literal["source"] = "source"
    asset_id: int
    media_type: str
    created_at: datetime
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None
    remote_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None


class AssetGroupGenerationMeta(BaseModel):
    kind: Literal["generation"] = "generation"
    generation_id: int
    provider_id: str
    operation_type: str
    status: Optional[str] = None
    created_at: datetime
    final_prompt: Optional[str] = None
    prompt_version_id: Optional[UUID] = None


class AssetGroupPromptMeta(BaseModel):
    kind: Literal["prompt"] = "prompt"
    prompt_version_id: UUID
    prompt_text: str
    commit_message: Optional[str] = None
    author: Optional[str] = None
    version_number: Optional[int] = None
    family_id: Optional[UUID] = None
    family_title: Optional[str] = None
    family_slug: Optional[str] = None
    created_at: datetime
    tags: List[str] = Field(default_factory=list)


class AssetGroupSiblingMeta(BaseModel):
    kind: Literal["sibling"] = "sibling"
    hash: str
    generation_id: int
    provider_id: str
    operation_type: str
    status: Optional[str] = None
    created_at: datetime
    prompt_snippet: Optional[str] = None


AssetGroupMeta = Union[AssetGroupSourceMeta, AssetGroupGenerationMeta, AssetGroupPromptMeta, AssetGroupSiblingMeta]


class AssetGroupSummary(BaseModel):
    key: str
    count: int
    latest_created_at: datetime
    preview_assets: list[AssetResponse] = Field(default_factory=list)
    meta: Optional[AssetGroupMeta] = None


class AssetGroupListResponse(BaseModel):
    groups: list[AssetGroupSummary]
    total: int
    limit: int
    offset: int
