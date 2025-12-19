"""
DEPRECATED: Legacy asset_analysis module shim.

Moved to pixsim7.backend.main.domain.assets.analysis.
This module re-exports from there for backward compatibility.
"""
from pixsim7.backend.main.domain.assets.analysis import (
    AssetAnalysis,
    AnalysisStatus,
    AnalyzerType,
)

__all__ = ["AssetAnalysis", "AnalysisStatus", "AnalyzerType"]
