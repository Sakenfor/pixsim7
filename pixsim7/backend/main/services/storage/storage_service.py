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
import tempfile
from pathlib import Path
from typing import Optional, BinaryIO, Union
from datetime import datetime
import aiofiles
import aiofiles.os

from pixsim_logging import get_logger
from pixsim7.backend.main.shared.path_registry import get_path_registry
from pixsim7.backend.main.services.storage.roots import (
    LOCAL_ROOT_ID,
    RootSpec,
    get_root_specs,
)

logger = get_logger()

# Hard ceiling on a single root's reachability probe so the storage-overview tab
# can't block on an unreachable archive (laptop off the archive's LAN/ZeroTier).
_PROBE_TIMEOUT_SECONDS = 5.0


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

    async def list_objects(self, prefix: str = "", *, page_size: int = 1000):
        """
        Yield stored objects under ``prefix`` as dicts:
        ``{"key", "size", "etag", "last_modified"}``.

        Object-store backends only (used by S3 source-root ingest, plan
        ``s3-source-root-ingest``). Local/derivative roots don't implement it.
        """
        raise NotImplementedError("list_objects requires an object-store backend")
        yield  # pragma: no cover — unreachable; marks this as an async generator

    def get_content_addressed_key(self, user_id: int, sha256: str, extension: str = "") -> str:
        """
        Generate content-addressed storage key (root-agnostic).

        Uses SHA256 to create a unique, deterministic key that dedups identical
        content. Two-level directory structure (first 2 hash chars) keeps any
        single directory small.

        Returns:
            Storage key in format: u/{user_id}/content/{hash[:2]}/{hash}{ext}
        """
        if not extension.startswith(".") and extension:
            extension = f".{extension}"
        hash_prefix = sha256[:2]
        return f"u/{user_id}/content/{hash_prefix}/{sha256}{extension}"


class LocalStorageService(StorageService):
    """
    Local filesystem storage implementation.

    Files are stored under a configurable root directory,
    organized by the key path structure.
    """

    def __init__(self, root_path: str | Path | None = None):
        """
        Initialize local storage.

        Args:
            root_path: Root directory for file storage (defaults to path registry media root)
        """
        if root_path is None:
            root_path = get_path_registry().media_root
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
        """Store content at the given key.

        Uses atomic write (temp file + rename) so concurrent readers never
        see a partially-written file.
        """
        path = self._key_to_path(key)

        # Ensure parent directory exists
        path.parent.mkdir(parents=True, exist_ok=True)

        # Write to temp file in the same directory, then atomic rename.
        fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
        try:
            os.close(fd)
            if isinstance(content, bytes):
                async with aiofiles.open(tmp_path, 'wb') as f:
                    await f.write(content)
            else:
                # File-like object - read and write
                async with aiofiles.open(tmp_path, 'wb') as f:
                    chunk_size = 1024 * 1024  # 1MB chunks
                    while True:
                        chunk = content.read(chunk_size)
                        if not chunk:
                            break
                        await f.write(chunk)

            # Atomic rename (same filesystem, so this is atomic on POSIX;
            # on Windows os.replace is as close as we get).
            os.replace(tmp_path, str(path))
        except BaseException:
            # Clean up temp file on any error
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

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

    async def store_with_hash(
        self,
        user_id: int,
        sha256: str,
        content: Union[bytes, BinaryIO],
        extension: str = "",
        content_type: Optional[str] = None,
    ) -> str:
        """
        Store content using content-addressed key (by SHA256 hash).

        If a file with this hash already exists, skips storage and returns
        the existing key. This provides automatic deduplication at the
        filesystem level.

        Args:
            user_id: User ID
            sha256: SHA256 hash of content (must match actual content)
            content: File content as bytes or file-like object
            extension: File extension including dot (e.g., ".mp4")
            content_type: MIME type (optional)

        Returns:
            The content-addressed storage key
        """
        key = self.get_content_addressed_key(user_id, sha256, extension)

        # Check if file already exists (deduplication)
        if await self.exists(key):
            logger.debug(
                "file_already_exists_skipping_storage",
                key=key,
                sha256=sha256[:16],
                detail="Content-addressed storage: file with this hash already exists"
            )
            return key

        # Store new file
        await self.store(key, content, content_type)

        logger.debug(
            "file_stored_content_addressed",
            key=key,
            sha256=sha256[:16]
        )

        return key

    async def store_from_path_with_hash(
        self,
        user_id: int,
        sha256: str,
        source_path: str,
        extension: str = "",
    ) -> str:
        """
        Store content from local file using content-addressed key.

        Efficient copy from existing file path. If file already exists at
        the content-addressed location, skips copy.

        Args:
            user_id: User ID
            sha256: SHA256 hash of content
            source_path: Path to source file
            extension: File extension including dot

        Returns:
            The content-addressed storage key
        """
        key = self.get_content_addressed_key(user_id, sha256, extension)

        # Check if file already exists (deduplication)
        if await self.exists(key):
            logger.debug(
                "file_already_exists_skipping_copy",
                key=key,
                sha256=sha256[:16],
                source=source_path
            )
            return key

        # Copy file to content-addressed location
        await self.store_from_path(key, source_path)

        logger.debug(
            "file_copied_content_addressed",
            key=key,
            sha256=sha256[:16],
            source=source_path
        )

        return key


def _import_s3():
    """Lazily import the optional S3 deps (aiobotocore / botocore).

    S3 is an optional, swappable backend. Importing these at module top would
    make a missing optional dependency cascade through the asset service and
    dependencies module into every plugin, even in local-only installs that
    never construct an ``S3StorageService``. Deferring the import here keeps the
    dependency optional: it's only required once an ``s3`` storage root is
    actually configured.
    """
    from aiobotocore.session import get_session as aioboto_get_session
    from botocore.exceptions import ClientError as BotoClientError

    return aioboto_get_session, BotoClientError


class S3StorageService(StorageService):
    """
    S3-compatible object storage (MinIO / AWS) backend.

    Async I/O via aiobotocore. Presigned URLs are generated by a cached sync
    botocore client (signing is local — no network). Has no local filesystem
    path: ``get_path`` raises; use ``TieredStorageService.ensure_local_copy``
    when raw bytes are needed for processing (e.g. derivative regeneration).
    """

    def __init__(
        self,
        *,
        endpoint_url: str,
        bucket: str,
        access_key: str,
        secret_key: str,
        region: str = "us-east-1",
        presigned_ttl_seconds: int = 3600,
        connect_timeout_seconds: float = 10.0,
        read_timeout_seconds: float = 300.0,
        max_attempts: int = 3,
    ):
        self._endpoint_url = endpoint_url
        self._bucket = bucket
        self._access_key = access_key
        self._secret_key = secret_key
        self._region = region
        self._presigned_ttl = int(presigned_ttl_seconds)
        aioboto_get_session, self._BotoClientError = _import_s3()
        self._session = aioboto_get_session()
        self._presign_client = None  # lazy sync botocore client
        # Bounded timeouts + retries on every client. WITHOUT these, botocore's
        # defaults are 60s connect / 60s read but retries can stretch a stalled
        # request out, and — critically — a connection that never establishes
        # (firewall / ZeroTier path / wrong event-loop context in a worker) would
        # otherwise stall the whole relocation job silently with no error and no
        # progress. A short connect_timeout turns that hang into a fast, retryable
        # ConnectTimeoutError that arq surfaces. read_timeout stays generous so a
        # single put_object of a multi-MB original isn't cut off mid-upload.
        # See plan media-storage-tiering cp-k (worker S3 hang).
        from botocore.config import Config

        self._client_config = Config(
            connect_timeout=float(connect_timeout_seconds),
            read_timeout=float(read_timeout_seconds),
            retries={"max_attempts": int(max_attempts), "mode": "standard"},
        )
        # A reachability probe (head_bucket) must fail FAST, not retry — otherwise
        # an unreachable archive (e.g. laptop off the archive's LAN/ZeroTier) makes
        # the storage-overview tab hang for connect_timeout × retries. Short connect,
        # single attempt.
        self._probe_config = Config(
            connect_timeout=3.0,
            read_timeout=3.0,
            retries={"max_attempts": 1, "mode": "standard"},
        )
        logger.info(
            "s3_storage_initialized",
            endpoint=endpoint_url,
            bucket=bucket,
            connect_timeout=connect_timeout_seconds,
            read_timeout=read_timeout_seconds,
        )

    @staticmethod
    def _safe_key(key: str) -> str:
        return key.lstrip("/").replace("..", "")

    def _client(self, config=None):
        return self._session.create_client(
            "s3",
            endpoint_url=self._endpoint_url,
            aws_access_key_id=self._access_key,
            aws_secret_access_key=self._secret_key,
            region_name=self._region,
            config=config or self._client_config,
        )

    @staticmethod
    def _is_not_found(exc: "BotoClientError") -> bool:
        err = exc.response.get("Error", {})
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        return err.get("Code", "") in ("404", "NoSuchKey", "NotFound") or status == 404

    async def store(self, key, content, content_type=None):
        body = content if isinstance(content, bytes) else content.read()
        extra = {"ContentType": content_type} if content_type else {}
        async with self._client() as client:
            await client.put_object(
                Bucket=self._bucket, Key=self._safe_key(key), Body=body, **extra
            )
        logger.debug("s3_file_stored", key=key, bucket=self._bucket)
        return key

    async def store_from_path(self, key, source_path):
        async with aiofiles.open(source_path, "rb") as f:
            body = await f.read()
        async with self._client() as client:
            await client.put_object(Bucket=self._bucket, Key=self._safe_key(key), Body=body)
        return key

    async def get(self, key):
        try:
            async with self._client() as client:
                resp = await client.get_object(Bucket=self._bucket, Key=self._safe_key(key))
                async with resp["Body"] as stream:
                    return await stream.read()
        except self._BotoClientError as exc:
            if self._is_not_found(exc):
                return None
            raise

    async def delete(self, key):
        # S3 delete is idempotent (204 whether or not the key existed).
        async with self._client() as client:
            await client.delete_object(Bucket=self._bucket, Key=self._safe_key(key))
        return True

    async def exists(self, key):
        try:
            async with self._client() as client:
                await client.head_object(Bucket=self._bucket, Key=self._safe_key(key))
            return True
        except self._BotoClientError as exc:
            if self._is_not_found(exc):
                return False
            raise

    def get_path(self, key):
        raise NotImplementedError(
            "S3 storage has no local filesystem path; use "
            "TieredStorageService.ensure_local_copy() for a temp file."
        )

    def get_url(self, key):
        client = self._get_presign_client()
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": self._safe_key(key)},
            ExpiresIn=self._presigned_ttl,
        )

    async def get_metadata(self, key):
        try:
            async with self._client() as client:
                resp = await client.head_object(Bucket=self._bucket, Key=self._safe_key(key))
        except self._BotoClientError as exc:
            if self._is_not_found(exc):
                return None
            raise
        import mimetypes
        content_type = resp.get("ContentType")
        if not content_type or content_type == "binary/octet-stream":
            guessed, _ = mimetypes.guess_type(key)
            content_type = guessed or "application/octet-stream"
        return {
            "size": resp.get("ContentLength", 0),
            "content_type": content_type,
            "modified_at": resp.get("LastModified"),
            "etag": resp.get("ETag", ""),
        }

    async def compute_hash(self, key):
        data = await self.get(key)
        if data is None:
            return None
        return hashlib.sha256(data).hexdigest()

    async def store_with_hash(self, user_id, sha256, content, extension="", content_type=None):
        key = self.get_content_addressed_key(user_id, sha256, extension)
        if await self.exists(key):  # root-scoped dedup
            return key
        await self.store(key, content, content_type)
        return key

    async def store_from_path_with_hash(self, user_id, sha256, source_path, extension=""):
        key = self.get_content_addressed_key(user_id, sha256, extension)
        if await self.exists(key):  # root-scoped dedup
            return key
        await self.store_from_path(key, source_path)
        return key

    async def health_check(self) -> None:
        """Cheap reachability probe — ``head_bucket``. Raises if unreachable.

        Used to tell "archive offline" (store down) from "object deleted" (store
        up, key gone) on the serve path and in the storage overview, instead of
        surfacing a bare 404 for both. See plan ``media-storage-tiering`` Phase H.
        Uses the fast-fail probe client so an unreachable archive errors in ~3 s
        instead of retrying for ~30 s.
        """
        async with self._client(config=self._probe_config) as client:
            await client.head_bucket(Bucket=self._bucket)

    async def open_stream(self, key, range_header: Optional[str] = None):
        """
        Open a streaming GET for proxying through the backend.

        Returns ``(status_code, headers, content_type, async_iter)`` where status
        is 206 for a satisfied Range request else 200. The returned async iterator
        OWNS the S3 client connection and closes it when fully consumed — callers
        must iterate it to completion (FastAPI's StreamingResponse does).
        """
        params = {"Bucket": self._bucket, "Key": self._safe_key(key)}
        if range_header:
            params["Range"] = range_header
        cm = self._client()
        client = await cm.__aenter__()
        try:
            resp = await client.get_object(**params)
        except BotoClientError as exc:
            await cm.__aexit__(None, None, None)
            if self._is_not_found(exc):
                raise FileNotFoundError(key) from exc
            raise

        status = 206 if resp.get("ContentRange") else 200
        headers = {"Accept-Ranges": "bytes"}
        if resp.get("ContentLength") is not None:
            headers["Content-Length"] = str(resp["ContentLength"])
        if resp.get("ContentRange"):
            headers["Content-Range"] = resp["ContentRange"]
        content_type = resp.get("ContentType") or "application/octet-stream"
        body = resp["Body"]

        async def _iter():
            try:
                async for chunk in body.iter_chunks(1024 * 1024):
                    yield chunk
            finally:
                await cm.__aexit__(None, None, None)

        return status, headers, content_type, _iter()

    async def list_objects(self, prefix: str = "", *, page_size: int = 1000):
        """
        Stream objects under ``prefix`` via paginated ``list_objects_v2``.

        Yields ``{"key", "size", "etag", "last_modified"}`` per object, following
        ContinuationToken so a large source bucket is never materialized in
        memory. Skips "directory" placeholder keys (trailing ``/``). ETag quotes
        are stripped (note: S3 ETag is NOT a sha256 for multipart objects —
        ingest hashes bytes itself). Read-only; used by S3 source-root ingest
        (plan ``s3-source-root-ingest``).
        """
        safe_prefix = prefix.lstrip("/") if prefix else ""
        token = None
        async with self._client() as client:
            while True:
                kwargs = {
                    "Bucket": self._bucket,
                    "Prefix": safe_prefix,
                    "MaxKeys": int(page_size),
                }
                if token:
                    kwargs["ContinuationToken"] = token
                resp = await client.list_objects_v2(**kwargs)
                for obj in resp.get("Contents") or []:
                    key = obj.get("Key", "")
                    if not key or key.endswith("/"):
                        continue
                    yield {
                        "key": key,
                        "size": obj.get("Size", 0),
                        "etag": (obj.get("ETag") or "").strip('"'),
                        "last_modified": obj.get("LastModified"),
                    }
                if not resp.get("IsTruncated"):
                    break
                token = resp.get("NextContinuationToken")
                if not token:
                    break

    def _get_presign_client(self):
        if self._presign_client is None:
            import botocore.session
            from botocore.config import Config

            self._presign_client = botocore.session.get_session().create_client(
                "s3",
                endpoint_url=self._endpoint_url,
                aws_access_key_id=self._access_key,
                aws_secret_access_key=self._secret_key,
                region_name=self._region,
                config=Config(
                    signature_version="s3v4",
                    connect_timeout=self._client_config.connect_timeout,
                    read_timeout=self._client_config.read_timeout,
                ),
            )
        return self._presign_client


class TieredStorageService(StorageService):
    """
    Routes storage operations to a per-root backend selected by ``root_id``.

    Built from the roots registry; always has a ``'local'`` backend, plus any
    configured extras (e.g. an ``'archive'`` S3 backend). When only ``'local'``
    exists this behaves exactly like ``LocalStorageService``.

    Every resolving method takes an optional ``root_id`` (default ``'local'``),
    so existing callers that pass nothing keep working. Content-addressed dedup
    stays root-scoped: each backend checks existence against its own storage.
    """

    def __init__(self, backends: dict):
        if LOCAL_ROOT_ID not in backends:
            raise ValueError("TieredStorageService requires a 'local' backend")
        self._backends = backends

    def _backend(self, root_id: Optional[str]) -> StorageService:
        rid = root_id or LOCAL_ROOT_ID
        backend = self._backends.get(rid)
        if backend is None:
            logger.error(
                "storage_root_not_configured",
                root_id=rid,
                falling_back=LOCAL_ROOT_ID,
            )
            return self._backends[LOCAL_ROOT_ID]
        return backend

    def has_root(self, root_id: str) -> bool:
        return root_id in self._backends

    def is_local(self, root_id: Optional[str] = None) -> bool:
        return isinstance(self._backend(root_id), LocalStorageService)

    async def probe_root(self, root_id: Optional[str] = None) -> dict:
        """
        Reachability probe for a single root. Returns ``{"online", "error"}``.

        Local roots are online when their root directory exists. Non-local
        backends are probed via their ``health_check()`` (S3 ``head_bucket``);
        a backend without one reports ``online=None`` (unknown). Never raises —
        a failed probe is reported as ``online=False`` with the error string.
        Used by the serve path (offline vs deleted) and the storage overview.
        """
        backend = self._backend(root_id)
        if isinstance(backend, LocalStorageService):
            ok = backend.root_path.exists()
            return {"online": ok, "error": None if ok else "local root path missing"}
        pinger = getattr(backend, "health_check", None)
        if pinger is None:
            return {"online": None, "error": None}
        try:
            # Hard ceiling so the storage-overview tab can never block on a slow
            # probe, regardless of the backend's own client timeouts.
            await asyncio.wait_for(pinger(), timeout=_PROBE_TIMEOUT_SECONDS)
            return {"online": True, "error": None}
        except asyncio.TimeoutError:
            return {"online": False, "error": "reachability probe timed out"}
        except Exception as exc:  # noqa: BLE001 — report, never raise
            return {"online": False, "error": str(exc)}

    def local_path_if_local(self, key, root_id=None) -> Optional[str]:
        """
        Filesystem path for a key when it lives on a local root, else None.

        Use this to populate ``Asset.local_path``: it stays a real path for
        local files and becomes None for archived (S3) files, where the path is
        derived on demand via ``ensure_local_copy`` instead of stored.
        """
        backend = self._backend(root_id)
        if isinstance(backend, LocalStorageService):
            return backend.get_path(key)
        return None

    # --- routed I/O (root_id-aware) ---

    async def store(self, key, content, content_type=None, root_id=None):
        return await self._backend(root_id).store(key, content, content_type)

    async def store_from_path(self, key, source_path, root_id=None):
        return await self._backend(root_id).store_from_path(key, source_path)

    async def get(self, key, root_id=None):
        return await self._backend(root_id).get(key)

    async def delete(self, key, root_id=None):
        return await self._backend(root_id).delete(key)

    async def exists(self, key, root_id=None):
        return await self._backend(root_id).exists(key)

    def get_path(self, key, root_id=None):
        return self._backend(root_id).get_path(key)

    def get_url(self, key, root_id=None):
        return self._backend(root_id).get_url(key)

    async def get_metadata(self, key, root_id=None):
        return await self._backend(root_id).get_metadata(key)

    async def compute_hash(self, key, root_id=None):
        return await self._backend(root_id).compute_hash(key)

    async def store_with_hash(
        self, user_id, sha256, content, extension="", content_type=None, root_id=None
    ):
        return await self._backend(root_id).store_with_hash(
            user_id, sha256, content, extension, content_type
        )

    async def store_from_path_with_hash(
        self, user_id, sha256, source_path, extension="", root_id=None
    ):
        return await self._backend(root_id).store_from_path_with_hash(
            user_id, sha256, source_path, extension
        )

    def get_content_addressed_key(self, user_id, sha256, extension=""):
        # Pure helper — identical regardless of root.
        return self._backends[LOCAL_ROOT_ID].get_content_addressed_key(
            user_id, sha256, extension
        )

    async def open_stream(self, key, root_id=None, range_header: Optional[str] = None):
        """Open a proxy stream from the backend for ``root_id`` (non-local only)."""
        backend = self._backend(root_id)
        opener = getattr(backend, "open_stream", None)
        if opener is None:
            raise NotImplementedError(
                f"backend for root '{root_id}' does not support streaming proxy"
            )
        return await opener(key, range_header=range_header)

    async def list_objects(self, prefix: str = "", *, root_id: Optional[str] = None, page_size: int = 1000):
        """Delegate object listing to the backend for ``root_id`` (S3 source/
        archive roots). Re-yields so callers ``async for`` over the tiered
        service. Used by S3 source-root ingest."""
        async for entry in self._backend(root_id).list_objects(prefix, page_size=page_size):
            yield entry

    async def ensure_local_copy(self, key, root_id=None):
        """
        Return a local filesystem path to the object's bytes for processing.

        For local roots this is the real stored path and no copy is made. For
        non-local backends (S3) the object is downloaded to a temp file.

        Returns ``(path, is_temp)`` — when ``is_temp`` is True the CALLER must
        delete ``path`` when done.
        """
        backend = self._backend(root_id)
        if isinstance(backend, LocalStorageService):
            return backend.get_path(key), False

        data = await backend.get(key)
        if data is None:
            raise FileNotFoundError(f"object not found: root={root_id!r} key={key!r}")
        suffix = Path(key).suffix
        fd, tmp_path = tempfile.mkstemp(suffix=suffix)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
        return tmp_path, True


# Global storage service instance
_storage_service: Optional[StorageService] = None


def _build_backend(spec: RootSpec) -> StorageService:
    """Construct a single storage backend from its registry spec."""
    if spec.kind == "local":
        if spec.id == LOCAL_ROOT_ID:
            return LocalStorageService()
        # A non-default local root may point at an explicit path.
        return LocalStorageService(root_path=spec.config.get("path"))
    if spec.kind == "s3":
        cfg = spec.config
        return S3StorageService(
            endpoint_url=cfg["endpoint_url"],
            bucket=cfg["bucket"],
            access_key=cfg["access_key"],
            secret_key=cfg["secret_key"],
            region=cfg.get("region", "us-east-1"),
            presigned_ttl_seconds=cfg.get("presigned_ttl_seconds", 3600),
            connect_timeout_seconds=cfg.get("connect_timeout_seconds", 10.0),
            read_timeout_seconds=cfg.get("read_timeout_seconds", 300.0),
            max_attempts=cfg.get("max_attempts", 3),
        )
    raise ValueError(f"unknown storage root kind: {spec.kind!r}")


def get_storage_service() -> StorageService:
    """
    Get the global storage service: a TieredStorageService built from the
    storage roots registry.

    With only the default ``'local'`` root configured, it behaves exactly like
    the previous single-root LocalStorageService. A broken non-local root is
    skipped (logged) so the local tier still works; a broken local root raises.
    """
    global _storage_service

    if _storage_service is None:
        specs = get_root_specs()
        backends: dict = {}
        for rid, spec in specs.items():
            try:
                backends[rid] = _build_backend(spec)
            except Exception as exc:
                logger.error(
                    "storage_backend_build_failed",
                    root_id=rid,
                    kind=spec.kind,
                    error=str(exc),
                )
                if rid == LOCAL_ROOT_ID:
                    raise
        _storage_service = TieredStorageService(backends)

    return _storage_service


def set_storage_service(service: StorageService) -> None:
    """
    Override the global storage service.

    Useful for testing or switching to cloud storage.
    """
    global _storage_service
    _storage_service = service


def apply_storage_roots(data: Optional[dict]) -> None:
    """
    Project a persisted storage-roots config onto the live registry + service.

    ``data`` shape: ``{"roots": [ {id, kind, ...backend config} ]}`` — the same
    per-entry shape as ``settings.media_storage_roots``. Sets the DB/UI override
    in the roots registry (authoritative over env) and forces the tiered storage
    service to rebuild from it on next use. Called by the ``storage_roots``
    system_config applier at startup and by the Maintenance UI on save.
    """
    import json

    from pixsim7.backend.main.services.storage.roots import set_roots_override

    roots = (data or {}).get("roots") or []
    set_roots_override(json.dumps(roots) if roots else "[]")
    set_storage_service(None)  # rebuilt from the new registry on next get_storage_service()
