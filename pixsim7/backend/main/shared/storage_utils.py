"""
Storage utility functions for URL generation, key handling, and file hashing.
"""
import hashlib
from typing import Optional


def compute_sha256(file_path: str, chunk_size: int = 65536) -> str:
    """
    Compute SHA256 hash of a file.

    Uses streaming reads to handle large files efficiently.

    Args:
        file_path: Path to file to hash
        chunk_size: Bytes to read at a time (default 64KB)

    Returns:
        Lowercase hex SHA256 hash string (64 characters)

    Example:
        >>> compute_sha256("/path/to/video.mp4")
        'a1b2c3d4...'
    """
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()


def storage_key_to_url(key: Optional[str]) -> Optional[str]:
    """
    Convert a storage key to a URL.

    This helper makes it easy to maintain consistent URL generation across the codebase.
    For local storage: returns /api/v1/media/{key}
    For cloud storage: can be extended to generate signed URLs (S3, GCS, etc.)

    Args:
        key: Storage key (e.g., "u/1/thumbnails/123.jpg")

    Returns:
        URL for accessing the stored file, or None if key is None

    Examples:
        >>> storage_key_to_url("u/1/assets/video.mp4")
        '/api/v1/media/u/1/assets/video.mp4'
        >>> storage_key_to_url("u/1/with space.jpg")
        '/api/v1/media/u/1/with%20space.jpg'
        >>> storage_key_to_url(None)
        None
    """
    if not key:
        return None
    # URL-encode the key for safety (matching storage service)
    safe_key = key.replace(" ", "%20")
    return f"/api/v1/media/{safe_key}"
