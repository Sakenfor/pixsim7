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


def collect_candidate_ids(
    payload: Dict[str, Any],
    primary_id: Optional[str],
    url: Optional[str],
) -> List[str]:
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
