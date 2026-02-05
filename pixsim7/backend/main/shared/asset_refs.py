"""
Asset reference helpers.

Centralized parsing of asset references used across generation, providers,
and file resolution to avoid drift in accepted formats.
"""
from __future__ import annotations

from typing import Any, Optional
import re

try:
    from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef
except Exception:  # pragma: no cover - avoid import cycles in edge cases
    EntityRef = None  # type: ignore


# Pattern for asset references: "asset_123", "asset:123"
_ASSET_REF_RE = re.compile(r"^(?:asset[_:])(?P<id>\d+)$")
_ASSET_URL_RE = re.compile(r"/assets?/(?P<id>\d+)(?:/|$|\?)")
_ASSET_QUERY_RE = re.compile(r"[?&]asset_id=(?P<id>\d+)")


def _coerce_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if raw.isdigit():
            try:
                return int(raw)
            except (TypeError, ValueError):
                return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def extract_asset_id(value: Any, *, allow_numeric_string: bool = True) -> Optional[int]:
    """
    Extract an integer asset ID from common reference formats.

    Supports:
    - int
    - "asset:123" / "asset_123"
    - raw digit strings
    - {"type": "asset", "id": 123}
    - {"asset_id": 123} / {"assetId": 123} / {"id": 123}
    - EntityRef(type="asset", id=123)
    - objects with .id (optionally .type == "asset")
    """
    if value is None:
        return None

    if isinstance(value, int):
        return value

    if EntityRef is not None and isinstance(value, EntityRef):
        return value.id if value.type == "asset" else None

    if isinstance(value, dict):
        if value.get("type") == "asset" and value.get("id") is not None:
            return _coerce_int(value.get("id"))
        if "asset_id" in value:
            return _coerce_int(value.get("asset_id"))
        if "assetId" in value:
            return _coerce_int(value.get("assetId"))
        if "asset" in value:
            return extract_asset_id(value.get("asset"))
        if "id" in value:
            return _coerce_int(value.get("id"))

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        # Ignore URLs
        if raw.startswith(("http://", "https://")):
            return None
        match = _ASSET_REF_RE.match(raw)
        if match:
            return _coerce_int(match.group("id"))
        if raw.isdigit():
            return _coerce_int(raw) if allow_numeric_string else None
        return None

    if hasattr(value, "type") and hasattr(value, "id"):
        try:
            if getattr(value, "type") == "asset":
                return _coerce_int(getattr(value, "id"))
        except Exception:
            pass

    if hasattr(value, "id"):
        return _coerce_int(getattr(value, "id"))

    return None


def _extract_asset_id_from_url(url: str) -> Optional[int]:
    if not url:
        return None
    match = _ASSET_URL_RE.search(url)
    if match:
        return _coerce_int(match.group("id"))
    match = _ASSET_QUERY_RE.search(url)
    if match:
        return _coerce_int(match.group("id"))
    return None


def extract_asset_ref(value: Any, *, allow_url_asset_id: bool = False) -> Optional[str]:
    """
    Extract a normalized asset ref or URL.

    Returns:
    - "asset:123" for asset references
    - "asset:123" for URLs with an embedded asset_id (if allow_url_asset_id=True)
    - "https://..." for URLs (passed through)
    - None if no asset ref or URL can be extracted
    """
    if value is None:
        return None

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.startswith(("http://", "https://")):
            if allow_url_asset_id:
                asset_id = _extract_asset_id_from_url(raw)
                if asset_id is not None:
                    return f"asset:{asset_id}"
            return raw
        match = _ASSET_REF_RE.match(raw)
        if match:
            return f"asset:{match.group('id')}"
        if raw.startswith("asset:"):
            return raw
        if raw.startswith("asset_"):
            return f"asset:{raw.split('_', 1)[1]}"
        if raw.isdigit():
            return f"asset:{raw}"

    asset_id = extract_asset_id(value)
    if asset_id is not None:
        return f"asset:{asset_id}"

    return None
