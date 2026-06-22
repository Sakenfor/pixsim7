"""
Shared filter parameters for asset search, groups, and metadata queries.

All methods in the search chain accept an AssetSearchFilters instance
instead of individual kwargs — adding a new filter means updating this
dataclass alone.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Any, Optional

from pixsim7.backend.main.domain import SyncStatus


@dataclass
class AssetSearchFilters:
    """Shared filter bag for the asset search/groups/meta pipeline."""

    # Generic / dynamic filters
    filters: dict[str, Any] | None = None
    group_filter: dict[str, Any] | None = None
    group_path: list[dict[str, Any]] | None = None

    # Visibility
    sync_status: Optional[SyncStatus] = None
    provider_status: Optional[str] = None
    include_archived: bool = False
    # Restrict results to ONLY archived assets (overrides include_archived).
    archived_only: bool = False
    searchable: Optional[bool] = True
    asset_kind: Optional[str] = "content"

    # Text search
    tag: Optional[str | list[str]] = None
    q: Optional[str] = None

    # Date range
    created_from: Optional[datetime] = None
    created_to: Optional[datetime] = None

    # Dimensions
    min_width: Optional[int] = None
    max_width: Optional[int] = None
    min_height: Optional[int] = None
    max_height: Optional[int] = None

    # Content classification
    content_domain: Any = None
    content_category: Optional[str] = None
    content_rating: Optional[str] = None

    # Lineage / provenance
    source_generation_id: Optional[int] = None
    source_asset_id: Optional[int] = None
    sha256: Optional[str] = None
    prompt_version_id: Any = None
    prompt_family_id: Any = None
    input_assets_key: Optional[str] = None
    operation_type: Any = None
    # Column-based counterpart to `operation_type` (which is a lineage EXISTS
    # subquery). Filters the denormalized Asset.operation_type column directly so
    # it can ride the (user_id, operation_type, created_at) index — the fast path
    # for time-cohort neighbor walking. See AssetSearchRequest.asset_operation_type.
    asset_operation_type: Any = None
    has_parent: Optional[bool] = None
    has_children: Optional[bool] = None

    # ID whitelist
    asset_ids: Optional[list[int]] = None

    # Local-folder origin via upload_context (the user's TRACKED folder
    # identity, distinct from the backend's storage `local_path`). Used by the
    # "Source" cohort to find siblings within the same tracked folder. When
    # `upload_source_subfolder` is also set, the filter narrows to that
    # subdirectory; pass an empty string to match root-of-folder files.
    upload_source_folder_id: Optional[str] = None
    upload_source_subfolder: Optional[str] = None

    # Same as upload_source_folder_id + upload_source_subfolder, but with the
    # backend resolving them from this pivot asset's `upload_context`. Used
    # when the frontend has the pivot's id but may not have its full
    # `uploadContext` payload in memory (e.g. carousel slot stubs).
    source_siblings_of_asset_id: Optional[int] = None

    # Grouping
    group_by: Optional[str] = None
    group_key: Optional[str] = None

    # Similarity (visual — cosine distance over AssetEmbedding)
    similar_to: Optional[int] = None
    similarity_threshold: Optional[float] = None
    embedder_id: Optional[str] = None

    # Semantic prompt similarity — resolves to the cohort of prompt versions
    # semantically similar to this version, then filters assets by them.
    similar_prompt_version_id: Any = None
    prompt_similarity_threshold: Optional[float] = None
