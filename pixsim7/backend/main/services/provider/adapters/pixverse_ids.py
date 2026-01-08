"""
Pixverse ID helpers

Utility helpers for reconciling numeric Pixverse IDs with UUIDs embedded
in media URLs or payload metadata.
"""
from __future__ import annotations

from typing import Any, Dict, Optional, List
import re
from urllib.parse import unquote


_PV_UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def looks_like_pixverse_uuid(value: Optional[str]) -> bool:
    return bool(value and _PV_UUID_RE.match(value))


def extract_uuid_from_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    match = _PV_UUID_RE.search(unquote(url))
    if not match:
        return None
    return match.group(0)


def uuid_in_url(uuid_value: Optional[str], url: Optional[str]) -> bool:
    if not uuid_value or not url:
        return False
    return uuid_value.lower() in unquote(url).lower()


def extract_pixverse_asset_uuid(payload: Dict[str, Any]) -> Optional[str]:
    for key in ("pixverse_asset_uuid", "asset_uuid", "media_uuid", "uuid"):
        value = payload.get(key)
        if value:
            return str(value)
    return None


def get_preferred_provider_asset_id(
    payload: Dict[str, Any],
    media_type: str,
    fallback_id: Optional[str] = None,
) -> Optional[str]:
    """
    Extract the best provider_asset_id from Pixverse metadata.

    Pixverse uses integer IDs (e.g., 380309046358503) as the primary identifier
    for API operations like delete. UUIDs (e.g., d71ca4a0-...) are embedded in
    URLs but are not accepted by most API operations.

    Preference order:
    1. Integer image_id/video_id from payload (Pixverse's primary identifier)
    2. Fallback ID (typically UUID from URL)

    This ensures we use stable, operation-friendly integer IDs when available.

    Args:
        payload: Pixverse metadata dict (from API response)
        media_type: "image" or "video"
        fallback_id: ID to use if no integer ID found (typically UUID from URL)

    Returns:
        String ID to use as provider_asset_id (integer ID preferred, UUID fallback)

    Example:
        >>> metadata = {"image_id": 380309046358503, "image_url": "..."}
        >>> get_preferred_provider_asset_id(metadata, "image", fallback_id="uuid-123")
        "380309046358503"
    """
    if media_type == "image":
        for key in ("image_id", "pixverse_image_id"):
            value = payload.get(key)
            if value:
                return str(value)
    else:  # video
        for key in ("video_id", "VideoId", "id"):
            value = payload.get(key)
            if value:
                return str(value)

    return fallback_id if fallback_id else None


def collect_candidate_ids(
    payload: Dict[str, Any],
    primary_id: Optional[str],
    url: Optional[str],
) -> List[str]:
    """
    Collect all possible ID variations for deduplication.

    Unlike get_preferred_provider_asset_id() which returns the BEST ID to use,
    this function returns ALL possible IDs for matching existing assets.

    Args:
        payload: Pixverse metadata dict
        primary_id: Primary ID (integer or UUID)
        url: Media URL (may contain UUID)

    Returns:
        List of unique candidate IDs for deduplication
    """
    candidates: List[str] = []
    if primary_id:
        candidates.append(str(primary_id))
    uuid_from_payload = extract_pixverse_asset_uuid(payload)
    if uuid_from_payload:
        candidates.append(uuid_from_payload)
    uuid_from_url = extract_uuid_from_url(url)
    if uuid_from_url:
        candidates.append(uuid_from_url)

    seen = set()
    unique: List[str] = []
    for value in candidates:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique
