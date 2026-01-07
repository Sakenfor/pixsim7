"""
Assets domain package - Asset models and related entities.

Contains:
- Asset and AssetVariant models
- Asset analysis models (AnalysisStatus, AnalyzerType, AssetAnalysis)
- Asset lineage and branching models
- Asset metadata tables for 3D, audio, temporal, adult content
- Tag models
- Upload attribution helpers

Usage:
    from pixsim7.backend.main.domain.assets import Asset, AssetVariant
    from pixsim7.backend.main.domain.assets import AssetLineage
    from pixsim7.backend.main.domain.assets import Tag
    from pixsim7.backend.main.domain.assets import infer_upload_method_from_asset
"""
from .models import Asset, AssetVariant
from .content import ContentBlob
from .analysis import AssetAnalysis, AnalysisStatus, AnalyzerType
from .lineage import AssetLineage
from .branching import AssetBranch, AssetBranchVariant, AssetClip
from .metadata import (
    Asset3DMetadata,
    AssetAudioMetadata,
    AssetTemporalSegment,
    AssetAdultMetadata,
)
from .tag import Tag
from .upload_attribution import (
    UPLOAD_METHOD_LABELS,
    INFERENCE_RULES,
    infer_upload_method,
    infer_upload_method_from_asset,
    extract_hints_from_metadata,
    build_upload_attribution_context,
)

__all__ = [
    # Core models
    "Asset",
    "AssetVariant",
    "ContentBlob",
    # Analysis
    "AssetAnalysis",
    "AnalysisStatus",
    "AnalyzerType",
    # Lineage and branching
    "AssetLineage",
    "AssetBranch",
    "AssetBranchVariant",
    "AssetClip",
    # Metadata
    "Asset3DMetadata",
    "AssetAudioMetadata",
    "AssetTemporalSegment",
    "AssetAdultMetadata",
    # Tags
    "Tag",
    # Upload attribution
    "UPLOAD_METHOD_LABELS",
    "INFERENCE_RULES",
    "infer_upload_method",
    "infer_upload_method_from_asset",
    "extract_hints_from_metadata",
    "build_upload_attribution_context",
]
