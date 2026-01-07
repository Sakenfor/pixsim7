"""
Upload attribution helpers for assets.

Centralizes upload method labels and inference so API endpoints
avoid hard-coded source logic scattered across the codebase.

Inference Rules (priority order):
1. Explicit upload_method parameter
2. Metadata-based inference (source_folder_id, source_url, etc.)
3. Asset field inference (source_generation_id, provider_id, remote_url)
4. Default fallback
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.assets.models import Asset


DEFAULT_UPLOAD_METHOD = "api"

UPLOAD_METHOD_LABELS: dict[str, str] = {
    "extension": "Chrome Extension",
    "local_folders": "Local Folders",
    "api": "API Upload",
    "generated": "Generated",
    "web": "Web Upload",
    "mobile": "Mobile Upload",
}


# ===== INFERENCE RULES =====
# Each rule is a (name, check_fn) tuple. check_fn receives extracted hints and asset,
# returns upload_method string or None to continue to next rule.

InferenceRule = Callable[[Dict[str, Any], Optional[Any]], Optional[str]]

def _rule_explicit_method(hints: Dict[str, Any], asset: Optional[Any]) -> Optional[str]:
    """Rule: Explicit upload_method wins."""
    return hints.get("upload_method")


def _rule_source_folder(hints: Dict[str, Any], asset: Optional[Any]) -> Optional[str]:
    """Rule: source_folder_id indicates local folders."""
    if hints.get("source_folder_id"):
        return "local_folders"
    return None


def _rule_source_url(hints: Dict[str, Any], asset: Optional[Any]) -> Optional[str]:
    """Rule: source_url or source_site indicates extension."""
    if hints.get("source_url") or hints.get("source_site"):
        return "extension"
    return None


def _rule_extension_badge(hints: Dict[str, Any], asset: Optional[Any]) -> Optional[str]:
    """Rule: source='extension_badge' indicates extension."""
    if hints.get("source") == "extension_badge":
        return "extension"
    return None


def _rule_generated(hints: Dict[str, Any], asset: Optional[Any]) -> Optional[str]:
    """Rule: source_generation_id indicates generated."""
    if asset and getattr(asset, "source_generation_id", None):
        return "generated"
    return None


def _rule_pixverse_sync(hints: Dict[str, Any], asset: Optional[Any]) -> Optional[str]:
    """Rule: Pixverse remote URLs indicate extension sync."""
    if not asset:
        return None
    provider_id = getattr(asset, "provider_id", None)
    remote_url = getattr(asset, "remote_url", None)
    if provider_id == "pixverse" and remote_url and "media.pixverse.ai" in remote_url:
        return "extension"
    return None


# Ordered list of inference rules
INFERENCE_RULES: List[tuple[str, InferenceRule]] = [
    ("explicit_method", _rule_explicit_method),
    ("source_folder", _rule_source_folder),
    ("source_url", _rule_source_url),
    ("extension_badge", _rule_extension_badge),
    ("generated", _rule_generated),
    ("pixverse_sync", _rule_pixverse_sync),
]


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


def extract_hints_from_metadata(metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Extract upload method hints from asset metadata.

    Checks multiple paths where hints may be stored:
    - upload_attribution (newer format)
    - upload_history.context (legacy format)
    - top-level keys (very old format)
    """
    if not metadata:
        return {}

    hints: Dict[str, Any] = {}

    # Check upload_attribution (newer format)
    upload_attr = metadata.get("upload_attribution", {})
    if isinstance(upload_attr, dict):
        for key in ("source_folder_id", "source_url", "source_site", "source"):
            if upload_attr.get(key):
                hints[key] = upload_attr[key]

    # Check upload_history.context (legacy format)
    upload_history = metadata.get("upload_history", {})
    if isinstance(upload_history, dict):
        context = upload_history.get("context", {})
        if isinstance(context, dict):
            for key in ("source_folder_id", "source_url", "source_site", "source"):
                if context.get(key) and key not in hints:
                    hints[key] = context[key]
        # Also check upload_history.source directly
        if upload_history.get("source") and "source" not in hints:
            hints["source"] = upload_history["source"]

    # Check top-level metadata (very old format)
    for key in ("source_folder_id", "source_url", "source_site", "source"):
        if metadata.get(key) and key not in hints:
            hints[key] = metadata[key]

    return hints


def infer_upload_method_from_asset(
    asset: "Asset",
    *,
    default: str = DEFAULT_UPLOAD_METHOD,
) -> str:
    """
    Infer upload_method from an Asset object by examining metadata and fields.

    Uses INFERENCE_RULES to check various sources in priority order.

    Args:
        asset: Asset object to infer from
        default: Fallback if no rule matches

    Returns:
        Inferred upload method string
    """
    # Extract hints from metadata
    metadata = getattr(asset, "media_metadata", None) or {}
    hints = extract_hints_from_metadata(metadata)

    # Normalize explicit upload_method if present
    if hints.get("upload_method"):
        hints["upload_method"] = normalize_upload_method(hints["upload_method"])

    # Run through inference rules
    for rule_name, rule_fn in INFERENCE_RULES:
        result = rule_fn(hints, asset)
        if result:
            return result

    return default


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
