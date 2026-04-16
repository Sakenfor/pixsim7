"""
Pixverse URL Resolver

Centralized URL handling for Pixverse API integration.

This module consolidates all URL normalization, validation, and resolution logic
that was previously scattered across multiple files in the Pixverse adapter,
asset factory, and embedded extractors.

Key concepts:
- WebAPI: Requires full https:// URLs (media.pixverse.ai)
- OpenAPI: Can accept img_id:XXX format or raw numeric IDs
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from urllib.parse import urlparse, urlunparse, unquote

from pixsim7.backend.main.shared.errors import ProviderError


class PixverseApiMode(str, Enum):
    """Pixverse API mode - determines acceptable URL formats."""
    WEBAPI = "webapi"    # Requires full https:// URLs
    OPENAPI = "openapi"  # Can accept img_id:XXX or raw IDs


# Base URL for Pixverse media
PIXVERSE_MEDIA_BASE = "https://media.pixverse.ai"
_PIXVERSE_PLACEHOLDER_PATH_SUFFIXES = (
    "/pixverse-preview/mp4/media/default.mp4",
    "/pixverse/mp4/media/default.mp4",
    "/pixverse/jpg/media/default.jpg",
    "/pixverse/jpg/media/default.jpeg",
)

# Pixverse output media lives under one of these path segments. Anything else
# (preview/default placeholders, or status URLs Pixverse exposes early before
# the file is actually published to the CDN) should not be treated as a real
# retrievable asset URL.
_PIXVERSE_OUTPUT_PATH_MARKERS = (
    "/openapi/output/",
    "/web/ori/",
)


def normalize_url(url: Optional[str], *, strip_query: bool = False) -> Optional[str]:
    """
    Normalize a Pixverse URL for consistent handling.

    This is the single source of truth for URL normalization, replacing
    legacy helpers that previously lived in the Pixverse adapter, asset
    factory, and embedded extractor code.

    Operations:
    1. Unquotes URL-encoded characters
    2. Converts relative paths to full URLs
    3. Normalizes scheme/netloc to lowercase
    4. Optionally strips query strings (for dedup)
    5. Removes trailing slashes and fragments

    Args:
        url: URL to normalize (can be relative path or full URL)
        strip_query: If True, remove query string (useful for deduplication)

    Returns:
        Normalized https:// URL, or None if input is empty/invalid
    """
    if not url:
        return None

    # Handle dict inputs (from metadata extraction)
    if isinstance(url, dict):
        url = (
            url.get("url")
            or url.get("image_url")
            or url.get("path")
            or url.get("image_path")
        )
    if not url:
        return None
    if not isinstance(url, str):
        url = str(url)

    # Unquote and strip whitespace
    url = unquote(url.strip())

    # Convert relative paths to full URLs
    if not url.startswith(("http://", "https://")):
        if url.startswith("/"):
            url = url[1:]
        # Handle various relative path formats
        if url.startswith(("pixverse/", "upload/", "pixverse\\", "upload\\")):
            normalized_path = url.replace("\\", "/")
            url = f"{PIXVERSE_MEDIA_BASE}/{normalized_path}"
        elif url.startswith(("openapi/", "openapi\\")):
            normalized_path = url.replace("\\", "/")
            url = f"{PIXVERSE_MEDIA_BASE}/{normalized_path}"
        elif url.startswith("media.pixverse.ai/"):
            url = f"https://{url}"

    # Parse and normalize
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            # Not a valid URL, return as-is (might be a path or ID)
            return url

        # Build normalized path
        path = unquote(parsed.path)
        path = path.rstrip("/") if path != "/" else path

        # Reconstruct URL
        url = urlunparse((
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            path,
            parsed.params if not strip_query else "",
            parsed.query if not strip_query else "",
            "",  # Remove fragment
        ))
    except Exception:
        pass  # Keep original if parsing fails

    return url


def is_pixverse_placeholder_url(url: Optional[str]) -> bool:
    """
    Return True when ``url`` points to a known Pixverse placeholder media path.

    Pixverse may return placeholder URLs (for example ``.../default.mp4``)
    for moderated/filtered content. These URLs should not be treated as valid
    early CDN media.
    """
    normalized = normalize_url(url, strip_query=True)
    if not normalized or not isinstance(normalized, str):
        return False
    try:
        parsed = urlparse(normalized)
        host = parsed.netloc.lower()
        path = unquote(parsed.path).lower()
    except Exception:
        return False
    if not host.endswith("pixverse.ai"):
        return False
    return any(path.endswith(suffix) for suffix in _PIXVERSE_PLACEHOLDER_PATH_SUFFIXES)


def has_retrievable_pixverse_media_url(url: Optional[str]) -> bool:
    """
    Return True when ``url`` looks like a real, CDN-published Pixverse asset.

    This excludes:
    - Empty values
    - Known Pixverse placeholder URLs (``…/default.mp4`` etc.)
    - URLs that do not live under a known output path segment
      (``/openapi/output/`` or ``/web/ori/``). Pixverse can expose status URLs
      before the file is actually published to the CDN; only the output path
      segments are guaranteed to be real published media.
    """
    normalized = normalize_url(url, strip_query=True)
    if not normalized or not isinstance(normalized, str):
        return False
    if not normalized.startswith(("http://", "https://")):
        return False
    if is_pixverse_placeholder_url(normalized):
        return False
    try:
        path = unquote(urlparse(normalized).path).lower()
    except Exception:
        return False
    return any(marker in path for marker in _PIXVERSE_OUTPUT_PATH_MARKERS)


def sanitize_pixverse_url(raw: Any) -> Optional[str]:
    """
    Normalize a Pixverse URL and drop placeholder templates.

    Returns ``None`` when the raw value is falsy or points at a known
    placeholder path (e.g. ``.../default.mp4``).  Otherwise returns the
    normalized URL.

    Single source of truth for every Pixverse URL-ingestion site.  Drift
    between the main poll path, list-fallback paths, and submit-response
    path is what let the asset-62302 filtered-template leak happen — a
    later `list_videos` poll served a placeholder URL verbatim and
    overwrote the real CDN URL captured by an earlier poll.  Route all
    URL extraction through this helper to prevent future drift.
    """
    if not raw:
        return None
    url = normalize_url(raw)
    if is_pixverse_placeholder_url(url):
        return None
    return url


def build_video_media_url_signals(
    video_url: Optional[str],
    thumbnail_url: Optional[str],
) -> dict:
    """Canonical Pixverse media-URL flag dict.

    Must be called on the *raw-normalized* URLs (before any placeholder
    null-out), so ``video_url_is_placeholder`` reflects what the provider
    returned this poll rather than the post-null value.
    """
    return {
        "video_url_is_placeholder": is_pixverse_placeholder_url(video_url),
        "thumbnail_url_is_placeholder": is_pixverse_placeholder_url(thumbnail_url),
        "has_retrievable_media_url": has_retrievable_pixverse_media_url(video_url),
    }


def extract_sanitized_video_urls(
    raw_video_url: Any,
    raw_thumbnail_url: Any,
) -> tuple[Optional[str], Optional[str], dict]:
    """
    Normalize + classify + null-out Pixverse video/thumbnail URLs in one shot.

    Returns ``(video_url, thumbnail_url, signals)``:
    - ``video_url`` / ``thumbnail_url`` — normalized and ``None`` if placeholder.
    - ``signals`` — flag dict computed BEFORE the null-out so downstream code
      can still see ``video_url_is_placeholder=True`` after the URL is
      cleared.

    Consolidates a pattern that previously lived in 3 near-identical copies
    across ``pixverse_status.py`` (main video check_status, the inner
    list-fallback helper, and the public ``check_video_status_from_list``).
    Those copies drifted — the public one was missing the null-out when
    the asset-62302 incident fired.
    """
    video_url = normalize_url(raw_video_url) if raw_video_url else None
    thumb_url = normalize_url(raw_thumbnail_url) if raw_thumbnail_url else None
    signals = build_video_media_url_signals(video_url, thumb_url)
    if is_pixverse_placeholder_url(video_url):
        video_url = None
    if is_pixverse_placeholder_url(thumb_url):
        thumb_url = None
    return video_url, thumb_url, signals


def extract_media_url(payload: Any, media_type: str) -> Optional[str]:
    """
    Extract and normalize the best Pixverse media URL from metadata payloads.

    Args:
        payload: Pixverse API payload dict
        media_type: "image" or "video"

    Returns:
        Normalized https:// URL if found, else None.
    """
    if not payload or not isinstance(payload, dict):
        return None

    if media_type == "video":
        keys = ("video_url", "media_url", "url", "customer_video_url", "download_url")
    else:
        keys = ("image_url", "media_url", "url", "customer_img_url", "download_url")

    for key in keys:
        value = payload.get(key)
        if value:
            normalized = normalize_url(value)
            if normalized and normalized.startswith(("http://", "https://")):
                return normalized

    return None


def is_valid_for_api(url: str, api_mode: PixverseApiMode = PixverseApiMode.WEBAPI) -> bool:
    """
    Check if a URL/reference is valid for the given API mode.

    Args:
        url: URL or reference to validate
        api_mode: Target API mode (WEBAPI requires https://, OPENAPI allows img_id:)

    Returns:
        True if valid for the given API mode
    """
    if not url or not isinstance(url, str):
        return False

    # Full https:// URLs are always valid (subject to API mode restrictions)
    if url.startswith(("http://", "https://")):
        try:
            parsed = urlparse(url)
            host = parsed.netloc.lower()
        except Exception:
            return False

        if api_mode == PixverseApiMode.WEBAPI:
            if not host.endswith("pixverse.ai"):
                return False
            return True

        return True

    # WebAPI requires full URLs
    if api_mode == PixverseApiMode.WEBAPI:
        return False

    # OpenAPI can accept img_id: format or raw digits
    if api_mode == PixverseApiMode.OPENAPI:
        if url.startswith("img_id:"):
            return True
        if url.isdigit():
            return True
        # upload/ paths can be converted
        if url.startswith("upload/"):
            return True

    return False


def validate_for_api(
    url: str,
    api_mode: PixverseApiMode = PixverseApiMode.WEBAPI,
    *,
    field_name: str = "image_url",
) -> None:
    """
    Validate a URL for the given API mode, raising ProviderError if invalid.

    Args:
        url: URL to validate
        api_mode: Target API mode
        field_name: Field name for error message

    Raises:
        ProviderError: If URL is not valid for the API mode
    """
    if is_valid_for_api(url, api_mode):
        return

    if api_mode == PixverseApiMode.WEBAPI and url.startswith(("http://", "https://")):
        try:
            parsed = urlparse(url)
            host = parsed.netloc.lower()
        except Exception:
            host = ""
        if host and not host.endswith("pixverse.ai"):
            raise ProviderError(
                f"Invalid {field_name} host '{host}' - "
                "Pixverse WebAPI requires pixverse.ai URLs."
            )

    if url.startswith("img_id:"):
        raise ProviderError(
            f"Invalid {field_name} format '{url[:30]}...' - "
            f"WebAPI requires https:// URLs, not img_id format. "
            f"Use composition_assets to reference assets by ID."
        )
    elif url.isdigit():
        raise ProviderError(
            f"Invalid {field_name} format '{url}' - "
            f"WebAPI requires https:// URLs, not raw numeric IDs. "
            f"Use composition_assets to reference assets by ID."
        )
    elif url.startswith("file://"):
        raise ProviderError(
            f"Invalid {field_name} format - local file paths cannot be used directly. "
            f"Use composition_assets to reference local assets."
        )
    else:
        raise ProviderError(
            f"Invalid {field_name} format '{url[:50]}...' - "
            f"Expected https:// URL."
        )


def resolve_reference(
    value: Any,
    api_mode: PixverseApiMode = PixverseApiMode.WEBAPI,
) -> Optional[str]:
    """
    Resolve a provider reference (from provider_uploads cache) to a usable format.

    This replaces _resolve_pixverse_ref in pixverse.py.

    Handles:
    - Full URLs (https://) -> return as-is
    - Relative Pixverse paths (upload/, pixverse/, openapi/, media.pixverse.ai/...) -> normalize to full URL
    - "img_id:XXX" -> return if OpenAPI mode, else None
    - Raw digits -> return as img_id:XXX if OpenAPI mode, else None

    Args:
        value: Reference value from provider_uploads or remote_url
        api_mode: Target API mode

    Returns:
        Resolved URL/reference suitable for API call, or None if invalid for mode
    """
    if not value:
        return None
    if not isinstance(value, str):
        value = str(value)

    value = unquote(value)

    # img_id: format - only valid for OpenAPI
    if value.startswith("img_id:"):
        return value if api_mode == PixverseApiMode.OPENAPI else None

    # Raw digit string - convert to img_id: for OpenAPI, reject for WebAPI
    if value.isdigit():
        return f"img_id:{value}" if api_mode == PixverseApiMode.OPENAPI else None

    normalized = normalize_url(value)
    if not normalized:
        return None

    # file:// URLs are never valid for API
    if normalized.startswith("file://"):
        return None

    if is_valid_for_api(normalized, api_mode):
        return normalized

    return None


def select_upload_reference(
    remote_url: Optional[str],
    provider_asset_id: Optional[str],
    *,
    api_mode: PixverseApiMode = PixverseApiMode.WEBAPI,
) -> Optional[str]:
    """
    Choose the best Pixverse reference for provider_uploads.

    Prefers remote_url when valid; falls back to provider_asset_id if it
    resolves to a usable reference. Returns a normalized reference or None.
    """
    for candidate in (remote_url, provider_asset_id):
        if not candidate:
            continue
        resolved = resolve_reference(candidate, api_mode)
        if resolved:
            return resolved
    return None


def sanitize_params(
    params: dict,
    api_mode: PixverseApiMode = PixverseApiMode.WEBAPI,
) -> dict:
    """
    Sanitize URL parameters for the given API mode.

    Normalizes and validates image_url, image_urls, and video_url fields.
    Raises ProviderError if any URL is invalid for the API mode.

    Args:
        params: Parameters dict to sanitize
        api_mode: Target API mode

    Returns:
        Copy of params with normalized URLs

    Raises:
        ProviderError: If any URL is invalid for the API mode
    """
    result = dict(params)

    # Normalize + validate image_url
    if "image_url" in result and result["image_url"]:
        normalized = normalize_url(result["image_url"])
        if normalized:
            result["image_url"] = normalized
        validate_for_api(result["image_url"], api_mode, field_name="image_url")

    # Normalize + validate image_urls
    if "image_urls" in result and isinstance(result["image_urls"], list):
        normalized_urls = []
        for i, url in enumerate(result["image_urls"]):
            if not url:
                normalized_urls.append(url)
                continue
            normalized = normalize_url(url)
            if normalized:
                url = normalized
            validate_for_api(url, api_mode, field_name=f"image_urls[{i}]")
            normalized_urls.append(url)
        result["image_urls"] = normalized_urls

    # Normalize + validate video_url
    if "video_url" in result and result["video_url"]:
        normalized = normalize_url(result["video_url"])
        if normalized:
            result["video_url"] = normalized
        validate_for_api(result["video_url"], api_mode, field_name="video_url")

    return result


def get_api_mode_for_account(account) -> PixverseApiMode:
    """
    Determine the API mode for a given account.

    Always returns WebAPI. An OpenAPI key is available to any Pixverse account
    (including free tiers) and is used for specific tasks like checking video
    results — it does not indicate that generation submissions should route
    through the OpenAPI endpoint. Routing to OpenAPI must be requested
    explicitly via a generation-level api_mode override.

    Args:
        account: ProviderAccount instance

    Returns:
        PixverseApiMode.WEBAPI
    """
    return PixverseApiMode.WEBAPI
