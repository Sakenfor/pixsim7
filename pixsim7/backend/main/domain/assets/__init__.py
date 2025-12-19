"""
Assets domain package - Asset models and related entities.

Contains:
- Asset and AssetVariant models
- Asset analysis models (AnalysisStatus, AnalyzerType, AssetAnalysis)
- Asset lineage and branching models
- Asset metadata tables for 3D, audio, temporal, adult content
- Tag models

Usage:
    from pixsim7.backend.main.domain.assets import Asset, AssetVariant
    from pixsim7.backend.main.domain.assets import AssetLineage
    from pixsim7.backend.main.domain.assets import Tag
"""
from .models import Asset, AssetVariant
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

__all__ = [
    # Core models
    "Asset",
    "AssetVariant",
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
]
