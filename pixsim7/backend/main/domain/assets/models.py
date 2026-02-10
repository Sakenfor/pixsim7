"""
Asset domain model - unified videos and images

CLEAN VERSION: Only identity, location, and file metadata.
NO generation parameters (those in ProviderSubmission)
NO lineage (separate Lineage table)
NO complex business logic (in AssetService)
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import BigInteger, JSON
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from pgvector.sqlalchemy import Vector

from pixsim7.backend.main.domain.enums import MediaType, SyncStatus, ContentDomain
from pixsim7.backend.main.shared.datetime_utils import utcnow


class Asset(SQLModel, table=True):
    """
    Core asset model - ONLY identity and location

    Design principles:
    - Single Responsibility: Asset IS a media file (not HOW it was made)
    - Source of Truth: File identity, location, basic metadata
    - No Duplication: Generation params in ProviderSubmission, not here
    """
    __tablename__ = "assets"

    # Primary key
    id: Optional[int] = Field(default=None, primary_key=True)

    # Owner
    user_id: int = Field(foreign_key="users.id", index=True)

    # ===== IDENTITY =====
    sha256: Optional[str] = Field(
        default=None,
        max_length=64,
        index=False,  # Indexed via composite index below
        description="File content hash (for per-user deduplication)"
    )
    content_id: Optional[int] = Field(
        default=None,
        foreign_key="content_blobs.id",
        index=True,
        description="Global content reference (for future cross-user deduplication)"
    )
    media_type: MediaType = Field(description="Asset type: video or image")

    # ===== PROVIDER TRACKING =====
    # Original provider (where asset was created)
    provider_id: str = Field(
        max_length=64,
        index=True,
        description="Original provider: 'pixverse', 'runway', 'pika'"
    )
    provider_asset_id: str = Field(
        max_length=128,
        index=True,
        description="Original provider's internal ID"
    )
    model: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Provider model used for generation (e.g. 'v3.5', 'qwen')"
    )
    provider_account_id: Optional[int] = Field(
        default=None,
        foreign_key="provider_accounts.id",
        index=True
    )

    # ===== CROSS-PROVIDER UPLOAD CACHE =====
    # Maps provider_id → provider-specific asset ID for cross-provider usage
    # Example: {"pixverse": "video_abc123", "sora": "media_xyz789"}
    # This allows using a Pixverse video on Sora without re-downloading
    provider_uploads: Dict[str, str] = Field(
        default_factory=dict,
        sa_column=Column(JSON),
        description="Map of provider_id to uploaded asset ID (for cross-provider ops)"
    )

    # ===== LOCATION =====
    remote_url: Optional[str] = Field(
        default=None,
        description="Provider URL (original). Optional - assets can be stored locally only."
    )
    local_path: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Local file path (if downloaded)"
    )

    # ===== FILE METADATA =====
    mime_type: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Content-Type: 'video/mp4', 'audio/mpeg', 'model/gltf-binary'"
    )
    width: Optional[int] = None
    height: Optional[int] = None
    duration_sec: Optional[float] = None
    file_size_bytes: Optional[int] = None
    logical_size_bytes: Optional[int] = Field(
        default=None,
        description="Logical size for quota accounting (independent of physical storage)"
    )
    fps: Optional[float] = None

    # ===== IMAGE TRACKING =====
    # Perceptual hash for image similarity
    image_hash: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Perceptual hash (phash)"
    )
    phash64: Optional[int] = Field(
        default=None,
        sa_column=Column(BigInteger, index=True),
        description="Numeric phash for fast similarity"
    )

    # ===== SEMANTIC UNDERSTANDING =====
    description: Optional[str] = Field(
        default=None,
        description="What's happening in this asset (AI-generated or user-provided)"
    )
    # NOTE: tags and style_tags have been migrated to structured hierarchical tags
    # See Tag and AssetTag models for the new tag system
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column(Vector(768)),
        description="Vector embedding for visual similarity (CLIP)"
    )

    # ===== CONTENT DOMAIN & SAFETY =====
    content_domain: ContentDomain = Field(
        default=ContentDomain.GENERAL,
        index=True,
        description="Content domain for specialized metadata"
    )
    content_category: Optional[str] = Field(
        default=None,
        max_length=64,
        index=True,
        description="Domain subcategory: 'football', 'artistic_nude', 'xray', etc."
    )
    content_taxonomy: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Hierarchical content classification (overflow for complex taxonomies)"
    )
    content_rating: str = Field(
        default="general",
        max_length=32,
        index=True,
        description="general, mature, adult, explicit"
    )
    age_restricted: bool = Field(
        default=False,
        index=True,
        description="Age verification required"
    )
    searchable: bool = Field(
        default=True,
        index=True,
        description="If false, requires direct link/ID"
    )

    # ===== UPLOAD ATTRIBUTION =====
    original_source_url: Optional[str] = Field(
        default=None,
        description="Original URL (if captured from web)"
    )
    upload_method: Optional[str] = Field(
        default=None,
        max_length=32,
        description="How uploaded: 'web', 'local', 'pixverse_sync', 'generated', 'video_capture'"
    )
    upload_context: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSONB),
        description="Optional upload context for filtering and attribution"
    )

    # ===== GENERIC OVERFLOW METADATA =====
    media_metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Media-specific metadata (3D, audio, etc.)"
    )

    # ===== PROMPT ANALYSIS =====
    # Structured analysis of the generation prompt (blocks, tags, etc.)
    # Populated from analyze_prompt() during asset creation
    prompt_analysis: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Parsed prompt structure: {prompt, blocks: [{role, text}], tags: [...]}"
    )

    # ===== STATE =====
    sync_status: SyncStatus = Field(
        default=SyncStatus.REMOTE,
        index=True
    )
    is_archived: bool = Field(
        default=False,
        index=True,
        description="Soft-hide from default gallery view"
    )

    # ===== INGESTION STATE =====
    # Tracks media ingestion pipeline progress (download, store, generate derivatives)
    ingest_status: Optional[str] = Field(
        default=None,
        max_length=16,
        index=True,
        description="Ingestion status: pending/processing/completed/failed"
    )
    ingest_error: Optional[str] = Field(
        default=None,
        description="Error message if ingestion failed"
    )
    ingested_at: Optional[datetime] = Field(
        default=None,
        description="When ingestion completed successfully"
    )

    # Storage keys (stable identifiers for serving, independent of local_path)
    stored_key: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Storage key for main file (e.g., 'u/1/assets/123.mp4')"
    )
    thumbnail_key: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Storage key for generated thumbnail"
    )
    preview_key: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Storage key for preview/proxy image"
    )

    # Independent step completion timestamps (allow re-running one without the other)
    metadata_extracted_at: Optional[datetime] = Field(
        default=None,
        description="When metadata extraction (dimensions, duration, etc.) completed"
    )
    thumbnail_generated_at: Optional[datetime] = Field(
        default=None,
        description="When thumbnail generation completed"
    )
    preview_generated_at: Optional[datetime] = Field(
        default=None,
        description="When preview derivative generation completed"
    )

    # ===== PROVENANCE =====
    # Link back to creation generation (for audit trail)
    source_generation_id: Optional[int] = Field(
        default=None,
        index=True,
        description="ID of source generation (no DB FK to allow cross-domain separation)"
    )

    # ===== VERSIONING =====
    # Git-like versioning for asset iterations (fix anatomy, improve lighting, etc.)
    # See AssetVersionFamily for the family grouping model.
    version_family_id: Optional[UUID] = Field(
        default=None,
        sa_column=Column(PG_UUID(as_uuid=True), index=True, nullable=True),
        description="UUID of version family (NULL = standalone asset, not versioned)"
    )
    version_number: Optional[int] = Field(
        default=None,
        description="Sequential version within family (1, 2, 3...). NOT NULL when family_id set."
    )
    parent_asset_id: Optional[int] = Field(
        default=None,
        index=True,
        description="Direct parent version for chain navigation (ON DELETE SET NULL)"
    )
    version_message: Optional[str] = Field(
        default=None,
        max_length=500,
        description="What changed: 'Fixed hand anatomy', 'Improved lighting'"
    )

    # ===== TIMESTAMPS =====
    created_at: datetime = Field(
        default_factory=utcnow,
        index=True
    )
    downloaded_at: Optional[datetime] = None

    # For LRU cache eviction strategy
    last_accessed_at: datetime = Field(
        default_factory=utcnow,
        index=True,
        description="Last time asset was used (for cache management)"
    )

    # ===== INDEXES =====
    __table_args__ = (
        Index("idx_asset_user_created", "user_id", "created_at"),
        Index("idx_asset_provider_lookup", "provider_id", "provider_asset_id"),
        Index("idx_asset_sync_media", "sync_status", "media_type"),
        # Composite unique constraint for per-user SHA256 deduplication
        Index("idx_asset_user_sha256", "user_id", "sha256", unique=True, postgresql_where="sha256 IS NOT NULL"),
    )

    def model_post_init(self, __context: Any) -> None:
        """Infer upload_method from other fields when not explicitly set.

        Runs the centralized inference rules from upload_attribution so that
        ALL creation paths get correct upload_method automatically.  Only fires
        on explicit ``Asset(...)`` construction — SQLAlchemy ORM loads bypass
        ``__init__`` so existing DB rows are never dirtied.
        """
        if self.upload_method is None:
            from pixsim7.backend.main.domain.assets.upload_attribution import (
                infer_upload_method_from_asset,
            )
            self.upload_method = infer_upload_method_from_asset(self, default=None)

    def __repr__(self):
        return (
            f"<Asset(id={self.id}, "
            f"type={self.media_type.value}, "
            f"provider={self.provider_id}, "
            f"status={self.sync_status.value})>"
        )


class AssetVariant(SQLModel, table=True):
    """
    Quality variants for different platforms (Phase 2)

    Use case: Same video at different resolutions/formats for:
    - Desktop (1080p MP4)
    - Mobile (720p MP4 optimized)
    - Web (720p WebM for browser)
    """
    __tablename__ = "asset_variants"

    id: Optional[int] = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="assets.id", index=True)

    # Variant type
    device_target: str = Field(
        max_length=20,
        description="Target: 'desktop', 'mobile', 'web'"
    )
    quality: str = Field(
        max_length=20,
        description="Quality: 'high', 'medium', 'low'"
    )
    format: str = Field(
        max_length=10,
        description="Format: 'mp4', 'webm'"
    )
    resolution: str = Field(
        max_length=10,
        description="Resolution: '1080p', '720p', '480p'"
    )

    # Location
    local_path: str = Field(max_length=512)
    cdn_url: Optional[str] = None
    file_size_bytes: int

    created_at: datetime = Field(default_factory=utcnow)

    def __repr__(self):
        return (
            f"<AssetVariant(id={self.id}, "
            f"asset_id={self.asset_id}, "
            f"target={self.device_target}, "
            f"resolution={self.resolution})>"
        )
