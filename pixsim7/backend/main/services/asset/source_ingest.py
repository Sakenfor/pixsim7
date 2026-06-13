"""
S3 source-root ingest (plan ``s3-source-root-ingest``, cp-c).

Server-side ingestion of objects from a read-only S3 ``role='source'`` root into
the archive CAS, registering each as an Asset — the headless replacement for the
browser File System Access local-folders flow. No client, no per-session folder
grant, no client-side tree walk.

Per-object flow (``ingest_source_object``):
  1. Cheap incremental skip — a deterministic ``provider_asset_id`` derived from
     ``(source_root, object_key)`` lets us detect an already-ingested object via
     the existing provider-tuple dedup WITHOUT downloading it. (Key-based: a
     replaced object reusing the same key isn't re-ingested — ETag-based change
     detection is a cp-e refinement.)
  2. Otherwise pull the object to a temp file (``ensure_local_copy``), sha256 it.
  3. Content dedup — if an asset with that sha already exists for the user,
     skip (the bytes are already in the library under some other origin).
  4. Store the bytes into the ARCHIVE root CAS and register the Asset with
     ``storage_root_id='archive'`` + local-folder-style attribution, then queue
     derivatives. Served via the existing presigned-redirect + remote_url
     fallback path.

``ingest_source_root`` enumerates a source root's configured prefix and runs the
per-object flow, returning aggregate stats. Consumed by cp-d's trigger.
"""
from __future__ import annotations

import hashlib
import mimetypes
import os
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus
from pixsim7.backend.main.services.asset.asset_factory import add_asset
from pixsim7.backend.main.services.asset.asset_hasher import compute_image_phash
from pixsim7.backend.main.services.asset.quota import AssetQuotaService
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim7.backend.main.services.storage.placement import ARCHIVE_ROOT_ID
from pixsim7.backend.main.services.storage.roots import get_source_roots
from pixsim_logging import get_logger

logger = get_logger()

# Provider id for library-only assets (no external provider). Matches the
# local-folders upload convention so source-ingested assets share cohorts.
_SOURCE_PROVIDER_ID = "local"


def _source_provider_asset_id(source_root_id: str, object_key: str, etag: Optional[str] = None) -> str:
    """Stable provider_asset_id per ``(source_root, object_key, etag)`` — enables
    the incremental skip via provider-tuple dedup. Folding the ETag in means an
    *unchanged* object skips (same id), while a *replaced* object (new ETag) gets
    a new id and is re-ingested as a new asset (the prior one is kept). ≤128 chars."""
    digest = hashlib.sha256(
        f"{source_root_id}/{object_key}/{etag or ''}".encode("utf-8")
    ).hexdigest()
    return f"src_{digest[:40]}"


def _media_type_for_key(object_key: str) -> tuple[Optional[MediaType], Optional[str]]:
    """Infer (MediaType, mime) from the object key's extension. Returns
    ``(None, mime)`` for unsupported types (the caller skips them)."""
    mime, _ = mimetypes.guess_type(object_key)
    if mime:
        if mime.startswith("image/"):
            return MediaType.IMAGE, mime
        if mime.startswith("video/"):
            return MediaType.VIDEO, mime
    return None, mime


def _build_source_context(
    source_root_id: str, object_key: str, prefix: str, etag: Optional[str] = None
) -> dict[str, Any]:
    """Local-folder-style attribution so source-bucket assets behave like local
    folders in cohorts/siblings (the 'Source' cohort groups by source folder)."""
    rel = object_key[len(prefix):] if prefix and object_key.startswith(prefix) else object_key
    rel = rel.lstrip("/")
    parts = rel.replace("\\", "/").split("/")
    ctx: dict[str, Any] = {
        "client": "backend",
        "feature": "s3_source",
        "source_folder_id": source_root_id,
        "source_folder": source_root_id,
        "source_relative_path": rel,
        "source_object_key": object_key,
    }
    if etag:
        ctx["source_etag"] = etag
    if len(parts) > 1:
        ctx["source_subfolder"] = parts[0]
    return ctx


async def ingest_source_object(
    db: AsyncSession,
    *,
    user_id: int,
    source_root_id: str,
    object_key: str,
    prefix: str = "",
    etag: Optional[str] = None,
) -> dict[str, Any]:
    """Ingest one object from a source root. Idempotent.

    ``etag`` (from the listing) is folded into the dedup identity: an unchanged
    object skips without download; a replaced object (new ETag) is re-ingested
    as a new asset. Returns ``{"status", "asset_id", "sha256"?, "key", "reason"?}``
    where status is ``created`` | ``deduped`` | ``skipped`` | ``unsupported``.
    """
    storage = get_storage_service()
    pid = _source_provider_asset_id(source_root_id, object_key, etag)

    # 1. Incremental skip — already ingested this (root, key)? No download.
    already = (
        await db.execute(
            select(Asset.id)
            .where(
                Asset.user_id == user_id,
                Asset.provider_id == _SOURCE_PROVIDER_ID,
                Asset.provider_asset_id == pid,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if already is not None:
        return {"status": "skipped", "asset_id": already, "key": object_key}

    media_type, mime = _media_type_for_key(object_key)
    if media_type is None:
        return {"status": "unsupported", "asset_id": None, "key": object_key, "reason": mime}

    # 2. Pull to a temp copy and hash.
    path, is_temp = await storage.ensure_local_copy(object_key, root_id=source_root_id)
    try:
        quota = AssetQuotaService(db)
        sha256 = quota._compute_sha256(path)

        # 3. Content dedup — bytes already in the library?
        dup = await quota.find_asset_by_hash(sha256, user_id)
        if dup is not None:
            return {"status": "deduped", "asset_id": dup.id, "sha256": sha256, "key": object_key}

        # 4. Store into the archive CAS and register the Asset.
        ext = Path(object_key).suffix
        stored_key = await storage.store_from_path_with_hash(
            user_id, sha256, path, extension=ext, root_id=ARCHIVE_ROOT_ID
        )
        size = os.path.getsize(path)

        width = height = None
        image_hash = None
        phash64 = None
        if media_type == MediaType.IMAGE:
            try:
                from PIL import Image

                with Image.open(path) as img:
                    width, height = img.size
                image_hash, phash64 = compute_image_phash(path)
            except Exception as e:  # noqa: BLE001 — phash is best-effort
                logger.warning("source_ingest_phash_failed", key=object_key, error=str(e))

        asset = await add_asset(
            db,
            user_id=user_id,
            media_type=media_type,
            provider_id=_SOURCE_PROVIDER_ID,
            provider_asset_id=pid,
            remote_url=None,
            width=width,
            height=height,
            mime_type=mime,
            file_size_bytes=size,
            sha256=sha256,
            stored_key=stored_key,
            local_path=None,
            sync_status=SyncStatus.DOWNLOADED,
            image_hash=image_hash,
            phash64=phash64,
            upload_method="local",
            upload_context=_build_source_context(source_root_id, object_key, prefix, etag),
            commit=False,
        )
        # The bytes live on the archive root — record it so serving resolves there
        # (otherwise serve_media looks on the local root and 404s).
        asset.storage_root_id = ARCHIVE_ROOT_ID
        db.add(asset)
        await db.commit()
        await db.refresh(asset)

        # Derivatives (thumbnails/previews) — best-effort, async.
        try:
            from pixsim7.backend.main.services.asset.ingestion import AssetIngestionService

            await AssetIngestionService(db).queue_ingestion(asset.id)
        except Exception as e:  # noqa: BLE001
            logger.warning("source_ingest_queue_derivatives_failed", asset_id=asset.id, error=str(e))

        return {"status": "created", "asset_id": asset.id, "sha256": sha256, "key": object_key}
    finally:
        if is_temp:
            try:
                os.unlink(path)
            except OSError:
                pass


async def ingest_source_root(
    db: AsyncSession,
    *,
    user_id: int,
    source_root_id: str,
    limit: Optional[int] = None,
) -> dict[str, int]:
    """Enumerate a source root's prefix and ingest each object.

    Returns aggregate stats: ``{scanned, created, deduped, skipped, errors}``.
    ``limit`` caps how many objects are scanned (logged when hit — no silent cap).

    Delete policy: objects removed from the source bucket are NOT reconciled —
    their assets are kept (the bytes live independently in the archive CAS).
    A failure enumerating the bucket (source root unreachable) propagates so the
    caller can classify it (the endpoint maps it to a 503).
    """
    spec = get_source_roots().get(source_root_id)
    if spec is None:
        raise ValueError(f"'{source_root_id}' is not a configured source root")

    prefix = str(spec.config.get("prefix") or "")
    storage = get_storage_service()
    stats = {"scanned": 0, "created": 0, "deduped": 0, "skipped": 0, "errors": 0}

    async for entry in storage.list_objects(prefix, root_id=source_root_id):
        stats["scanned"] += 1
        try:
            res = await ingest_source_object(
                db,
                user_id=user_id,
                source_root_id=source_root_id,
                object_key=entry["key"],
                prefix=prefix,
                etag=entry.get("etag"),
            )
            status = res.get("status")
            if status == "created":
                stats["created"] += 1
            elif status == "deduped":
                stats["deduped"] += 1
            else:  # skipped | unsupported
                stats["skipped"] += 1
        except Exception as e:  # noqa: BLE001 — one bad object must not abort the run
            stats["errors"] += 1
            logger.warning(
                "source_ingest_object_failed",
                root=source_root_id,
                key=entry.get("key"),
                error=str(e),
            )
        if limit and stats["scanned"] >= limit:
            logger.info("source_ingest_limit_reached", root=source_root_id, limit=limit)
            break

    logger.info("source_ingest_complete", root=source_root_id, **stats)
    return stats
