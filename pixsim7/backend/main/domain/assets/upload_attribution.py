"""
Upload attribution helpers for assets.

Centralizes upload method labels and inference so API endpoints
avoid hard-coded source logic scattered across the codebase.
"""
from __future__ import annotations

from typing import Any, Dict, Optional


DEFAULT_UPLOAD_METHOD = "api"

UPLOAD_METHOD_LABELS: dict[str, str] = {
    "extension": "Chrome Extension",
    "local_folders": "Local Folders",
    "api": "API Upload",
    "generated": "Generated",
    "web": "Web Upload",
    "mobile": "Mobile Upload",
}


def normalize_upload_method(value: Optional[str]) -> Optional[str]:
    """Normalize upload method values to lowercase strings."""
    if not value:
        return None
    normalized = value.strip().lower()
    return normalized or None


def infer_upload_method(
    *,
    upload_method: Optional[str],
    source_folder_id: Optional[str] = None,
    source_url: Optional[str] = None,
    source_site: Optional[str] = None,
) -> str:
    """
    Infer upload method from provided hints, falling back to DEFAULT_UPLOAD_METHOD.

    Explicit upload_method always wins. Other hints remain optional to keep
    this extensible for future sources.
    """
    normalized = normalize_upload_method(upload_method)
    if normalized:
        return normalized
    if source_folder_id:
        return "local_folders"
    if source_url or source_site:
        return "extension"
    return DEFAULT_UPLOAD_METHOD


def build_upload_attribution_context(
    *,
    upload_context: Optional[Dict[str, Any]] = None,
    source_folder_id: Optional[str] = None,
    source_relative_path: Optional[str] = None,
    source_url: Optional[str] = None,
    source_site: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Merge optional upload context with legacy source hints.

    Returns None if no context is available.
    """
    context: Dict[str, Any] = dict(upload_context or {})

    if source_folder_id and "source_folder_id" not in context:
        context["source_folder_id"] = source_folder_id
    if source_relative_path and "source_relative_path" not in context:
        context["source_relative_path"] = source_relative_path
    if source_url and "source_url" not in context:
        context["source_url"] = source_url
    if source_site and "source_site" not in context:
        context["source_site"] = source_site

    return context or None
