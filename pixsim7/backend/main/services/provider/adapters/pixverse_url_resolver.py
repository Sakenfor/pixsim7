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

    Prefers OpenAPI when an account has an OpenAPI key; otherwise WebAPI.

    Args:
        account: ProviderAccount instance

    Returns:
        PixverseApiMode indicating which API mode to use
    """
    if not account:
        return PixverseApiMode.WEBAPI

    has_openapi_key = any(
        isinstance(entry, dict)
        and entry.get("kind") == "openapi"
        and entry.get("value")
        for entry in (getattr(account, "api_keys", None) or [])
    )
    if has_openapi_key:
        return PixverseApiMode.OPENAPI

    return PixverseApiMode.WEBAPI
