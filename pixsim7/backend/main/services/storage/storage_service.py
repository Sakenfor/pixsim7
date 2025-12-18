"""
Storage Service - Abstraction layer for media file storage.

Provides a unified interface for storing and retrieving media files.
Currently implements local filesystem storage, but designed to be
swapped for S3/MinIO without changing application code.

Usage:
    storage = get_storage_service()

    # Store a file
    key = await storage.store("u/1/assets/123.mp4", file_content)

    # Retrieve a file
    content = await storage.get(key)

    # Get URL for serving
    url = storage.get_url(key)
"""
import os
import asyncio
import hashlib
from pathlib import Path
from typing import Optional, BinaryIO, Union
from datetime import datetime
import aiofiles
import aiofiles.os

from pixsim_logging import get_logger

logger = get_logger()


class StorageService:
    """
    Abstract storage service interface.

    Implementations:
    - LocalStorageService: Local filesystem (default)
    - S3StorageService: AWS S3 / MinIO (future)
    """

    async def store(
        self,
        key: str,
        content: Union[bytes, BinaryIO],
        content_type: Optional[str] = None,
    ) -> str:
        """
        Store content at the given key.

        Args:
            key: Storage key (e.g., "u/1/assets/123.mp4")
            content: File content as bytes or file-like object
            content_type: MIME type (optional, for metadata)

        Returns:
            The storage key (same as input)
        """
        raise NotImplementedError

    async def get(self, key: str) -> Optional[bytes]:
        """
        Retrieve content by key.

        Args:
            key: Storage key

        Returns:
            File content as bytes, or None if not found
        """
        raise NotImplementedError

    async def delete(self, key: str) -> bool:
        """
        Delete content by key.

        Args:
            key: Storage key

        Returns:
            True if deleted, False if not found
        """
        raise NotImplementedError

    async def exists(self, key: str) -> bool:
        """Check if a key exists in storage."""
        raise NotImplementedError

    def get_path(self, key: str) -> str:
        """
        Get the local filesystem path for a key.

        Only available for local storage implementations.
        Raises NotImplementedError for cloud storage.
        """
        raise NotImplementedError

    def get_url(self, key: str) -> str:
        """
        Get the URL for serving a stored file.

        For local storage: returns /api/v1/media/{key}
        For S3: returns signed URL or CDN URL
        """
        raise NotImplementedError

    async def get_metadata(self, key: str) -> Optional[dict]:
        """
        Get metadata for a stored file.

        Returns dict with: size, content_type, modified_at, etag
        """
        raise NotImplementedError


class LocalStorageService(StorageService):
    """
    Local filesystem storage implementation.

    Files are stored under a configurable root directory,
    organized by the key path structure.
    """

    def __init__(self, root_path: str = "data/media"):
        """
        Initialize local storage.

        Args:
            root_path: Root directory for file storage
        """
        self.root_path = Path(root_path)
        self.root_path.mkdir(parents=True, exist_ok=True)
        logger.info(
            "local_storage_initialized",
            root_path=str(self.root_path.absolute())
        )

    def _key_to_path(self, key: str) -> Path:
        """Convert storage key to filesystem path."""
        # Sanitize key to prevent path traversal
        safe_key = key.lstrip("/").replace("..", "")
        return self.root_path / safe_key

    async def store(
        self,
        key: str,
        content: Union[bytes, BinaryIO],
        content_type: Optional[str] = None,
    ) -> str:
        """Store content at the given key."""
        path = self._key_to_path(key)

        # Ensure parent directory exists
        path.parent.mkdir(parents=True, exist_ok=True)

        # Write content
        if isinstance(content, bytes):
            async with aiofiles.open(path, 'wb') as f:
                await f.write(content)
        else:
            # File-like object - read and write
            async with aiofiles.open(path, 'wb') as f:
                # Read in chunks for large files
                chunk_size = 1024 * 1024  # 1MB chunks
                while True:
                    chunk = content.read(chunk_size)
                    if not chunk:
                        break
                    await f.write(chunk)

        logger.debug(
            "file_stored",
            key=key,
            path=str(path),
            size=path.stat().st_size
        )

        return key

    async def store_from_path(self, key: str, source_path: str) -> str:
        """
        Store content from a local file path (efficient copy).

        Args:
            key: Storage key
            source_path: Path to source file

        Returns:
            The storage key
        """
        import shutil

        path = self._key_to_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)

        # Use shutil.copy2 to preserve metadata
        # Run in executor to not block the event loop
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, shutil.copy2, source_path, str(path))

        logger.debug(
            "file_stored_from_path",
            key=key,
            source=source_path,
            dest=str(path)
        )

        return key

    async def get(self, key: str) -> Optional[bytes]:
        """Retrieve content by key."""
        path = self._key_to_path(key)

        if not path.exists():
            return None

        async with aiofiles.open(path, 'rb') as f:
            return await f.read()

    async def delete(self, key: str) -> bool:
        """Delete content by key."""
        path = self._key_to_path(key)

        if not path.exists():
            return False

        try:
            await aiofiles.os.remove(path)
            logger.debug("file_deleted", key=key)
            return True
        except Exception as e:
            logger.error("file_delete_failed", key=key, error=str(e))
            return False

    async def exists(self, key: str) -> bool:
        """Check if a key exists in storage."""
        path = self._key_to_path(key)
        return path.exists()

    def get_path(self, key: str) -> str:
        """Get the local filesystem path for a key."""
        return str(self._key_to_path(key))

    def get_url(self, key: str) -> str:
        """Get the URL for serving a stored file."""
        # URL-encode the key for safety
        safe_key = key.replace(" ", "%20")
        return f"/api/v1/media/{safe_key}"

    async def get_metadata(self, key: str) -> Optional[dict]:
        """Get metadata for a stored file."""
        path = self._key_to_path(key)

        if not path.exists():
            return None

        stat = path.stat()

        # Compute ETag from file hash (or use mtime+size for speed)
        etag = f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"'

        # Guess content type from extension
        import mimetypes
        content_type, _ = mimetypes.guess_type(str(path))

        return {
            "size": stat.st_size,
            "content_type": content_type or "application/octet-stream",
            "modified_at": datetime.fromtimestamp(stat.st_mtime),
            "etag": etag,
        }

    async def compute_hash(self, key: str) -> Optional[str]:
        """Compute SHA256 hash of stored file."""
        path = self._key_to_path(key)

        if not path.exists():
            return None

        # Read in chunks for memory efficiency
        sha256_hash = hashlib.sha256()
        async with aiofiles.open(path, 'rb') as f:
            while True:
                chunk = await f.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                sha256_hash.update(chunk)

        return sha256_hash.hexdigest()


# Global storage service instance
_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    """
    Get the global storage service instance.

    Creates a LocalStorageService if not already initialized.
    Can be overridden for testing or to use different backends.
    """
    global _storage_service

    if _storage_service is None:
        # Get root path from environment or use default
        root_path = os.getenv("PIXSIM_MEDIA_STORAGE_PATH", "data/media")
        _storage_service = LocalStorageService(root_path)

    return _storage_service


def set_storage_service(service: StorageService) -> None:
    """
    Override the global storage service.

    Useful for testing or switching to cloud storage.
    """
    global _storage_service
    _storage_service = service
