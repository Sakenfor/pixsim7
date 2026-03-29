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
    operation_type: Any = None
    has_parent: Optional[bool] = None
    has_children: Optional[bool] = None

    # ID whitelist
    asset_ids: Optional[list[int]] = None

    # Grouping
    group_by: Optional[str] = None
    group_key: Optional[str] = None

    # Similarity
    similar_to: Optional[int] = None
    similarity_threshold: Optional[float] = None
