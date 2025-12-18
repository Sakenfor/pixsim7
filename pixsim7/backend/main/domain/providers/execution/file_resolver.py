"""
File Resolver

Generic file resolution for provider uploads.

Handles:
- Local paths (existing files)
- file:// URLs
- http(s) URLs (download to temp)
- Asset references ("asset_123", "asset:123", {"asset_id": 123})

Used by providers that need local file paths for multipart uploads.
"""
from typing import Any, Tuple, Optional
import os
import re
import tempfile
from urllib.parse import urlparse, unquote

import httpx

from pixsim7.backend.main.shared.errors import ProviderError

# Pattern for asset references: "asset_123", "asset:123"
_ASSET_REF_RE = re.compile(r"^(?:asset[_:])(?P<id>\d+)$")


class FileResolver:
    """
    Resolves various source formats to local file paths.

    Usage:
        resolver = FileResolver(db_session)
        local_path, temp_paths = await resolver.resolve(
            source="https://example.com/image.jpg",
            user_id=123,
            default_suffix=".jpg"
        )
        # ... use local_path ...
        # Clean up temp files when done
        for path in temp_paths:
            os.remove(path)
    """

    def __init__(self, db_session=None):
        """
        Initialize file resolver.

        Args:
            db_session: Optional async database session for asset lookups
        """
        self.db = db_session

    async def resolve(
        self,
        source: Any,
        user_id: int,
        default_suffix: str = ".tmp",
    ) -> Tuple[str, list[str]]:
        """
        Resolve a source reference to a local file path.

        Supported source formats:
        - Local path (existing file)
        - file:// URL
        - http(s) URL (download to temp)
        - "asset_123" / "asset:123" (lookup Asset)
        - {"asset_id": 123} or {"id": 123}
        - int (asset id)

        Args:
            source: Source reference (path, URL, asset ref, dict, int)
            user_id: User ID for asset permission checks
            default_suffix: File extension to use if not detectable

        Returns:
            Tuple of (local_path, list_of_temp_paths_to_cleanup)

        Raises:
            ProviderError: If source cannot be resolved
        """
        return await resolve_source_to_local_file(
            source=source,
            user_id=user_id,
            default_suffix=default_suffix,
            db_session=self.db,
        )


async def resolve_source_to_local_file(
    *,
    source: Any,
    user_id: int,
    default_suffix: str,
    db_session=None,
) -> Tuple[str, list[str]]:
    """
    Resolve a source reference to a local file path.

    This is the core resolution function used by FileResolver and ProviderService.

    Args:
        source: Source reference
        user_id: User ID for asset permission checks
        default_suffix: File extension fallback
        db_session: Optional database session for asset lookups

    Returns:
        Tuple of (local_path, list_of_temp_paths_to_cleanup)
    """
    if source is None:
        raise ProviderError("Missing required file source for provider upload")

    # Handle dict form
    if isinstance(source, dict):
        if "asset_id" in source:
            source = source["asset_id"]
        elif "id" in source:
            source = source["id"]

    # Handle numeric asset id
    if isinstance(source, int):
        return await _resolve_asset_id_to_local_file(
            asset_id=source,
            user_id=user_id,
            default_suffix=default_suffix,
            db_session=db_session,
        )

    if not isinstance(source, str):
        raise ProviderError(f"Unsupported source type for provider upload: {type(source)}")

    src = source.strip()
    if not src:
        raise ProviderError("Empty source for provider upload")

    # Handle asset ref string ("asset_123", "asset:123")
    m = _ASSET_REF_RE.match(src)
    if m:
        return await _resolve_asset_id_to_local_file(
            asset_id=int(m.group("id")),
            user_id=user_id,
            default_suffix=default_suffix,
            db_session=db_session,
        )

    # Handle URLs
    parsed = urlparse(src)
    if parsed.scheme in ("http", "https"):
        return await _download_url_to_temp(src, default_suffix=default_suffix)

    if parsed.scheme == "file":
        # file:///C:/path or file://hostname/path (we only support local)
        path = unquote(parsed.path or "")
        # Handle Windows paths
        if os.name == "nt" and path.startswith("/") and len(path) > 3 and path[2] == ":":
            path = path.lstrip("/")
        return _validate_existing_path(path)

    # Plain filesystem path
    if os.path.exists(src):
        return _validate_existing_path(src)

    raise ProviderError(f"Unsupported file source '{src}' (not a path, URL, or asset reference)")


async def _resolve_asset_id_to_local_file(
    *,
    asset_id: int,
    user_id: int,
    default_suffix: str,
    db_session=None,
) -> Tuple[str, list[str]]:
    """Resolve asset ID to local file path."""
    if db_session is None:
        raise ProviderError("Database session required for asset lookup")

    from pixsim7.backend.main.domain import Asset

    asset = await db_session.get(Asset, asset_id)
    if not asset or getattr(asset, "user_id", None) != user_id:
        raise ProviderError(f"Asset {asset_id} not found for user")

    local_path = getattr(asset, "local_path", None)
    if local_path and os.path.exists(local_path):
        return (local_path, [])

    remote_url = getattr(asset, "remote_url", None)
    if remote_url:
        return await _download_url_to_temp(remote_url, default_suffix=default_suffix)

    raise ProviderError(f"Asset {asset_id} has no local_path and no remote_url")


def _validate_existing_path(path: str) -> Tuple[str, list[str]]:
    """Validate that a path exists and return it."""
    if not path or not os.path.exists(path):
        raise ProviderError(f"Local file not found: {path}")
    return (path, [])


async def _download_url_to_temp(url: str, *, default_suffix: str) -> Tuple[str, list[str]]:
    """Download URL to temporary file."""
    suffix = default_suffix
    try:
        parsed = urlparse(url)
        _, ext = os.path.splitext(parsed.path or "")
        if ext:
            suffix = ext
    except Exception:
        pass

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp_path = tmp.name
    tmp.close()

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            r = await client.get(url)
            r.raise_for_status()
            with open(tmp_path, "wb") as f:
                f.write(r.content)
        return (tmp_path, [tmp_path])
    except Exception as e:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        raise ProviderError(f"Failed to download url for provider upload: {url}") from e
