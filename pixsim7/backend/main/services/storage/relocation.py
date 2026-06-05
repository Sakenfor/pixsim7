"""Core relocation logic for moving media originals between storage roots.

Shared by the ``tools/relocate_media.py`` CLI and the ``/assets/relocate-videos``
maintenance endpoint, so both select the same candidates and move blobs the same
way. See plan ``media-storage-tiering`` (Phase F mover, Phase H UI action).

Under creation Model B every asset is born on the local (hot) root; this module
is how video originals actually move to the configured ``archive`` root (e.g. an
S3/MinIO store reached over ZeroTier).

Per asset, with ``apply=True``:
  1. Upload the local file to the archive under the SAME ``stored_key`` (the key
     is tier-agnostic; only the root changes). Idempotent — skips the upload if
     the object already exists on the archive (safe resume).
  2. Verify integrity: the archive object must exist and its size must match the
     local file. ``verify_hash`` additionally re-hashes the archive copy and
     compares to ``asset.sha256`` (slower — downloads the object).
  3. Flip ``storage_root_id`` to the archive id and clear ``local_path`` (it's a
     derived cache; for archived files the path is resolved on demand). Commit
     per-asset so a mid-batch failure keeps prior successes.
  4. Post-commit, delete the local blob ONLY when no other asset row still
     references that ``stored_key`` on the local root (content-addressed dedup
     means siblings can share a blob).

NOTE: ``S3StorageService.store_from_path`` currently reads the file into memory
before PUT — fine for typical AI-gen clips (tens of MB), but a streaming/
multipart upload is a follow-up before relocating very large files.
"""
from __future__ import annotations

import os
from typing import Optional

from sqlalchemy import func, or_, select

from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.storage.roots import LOCAL_ROOT_ID


# --------------------------------------------------------------------------- #
# Candidate selection
# --------------------------------------------------------------------------- #

def candidate_query(min_size_bytes: int, user_id: Optional[int]):
    """Build the select for video assets currently on the local root."""
    from pixsim7.backend.main.domain.assets.models import Asset

    stmt = select(Asset).where(
        Asset.media_type == MediaType.VIDEO,
        Asset.stored_key.is_not(None),
        or_(Asset.storage_root_id.is_(None), Asset.storage_root_id == LOCAL_ROOT_ID),
    )
    if min_size_bytes > 0:
        stmt = stmt.where(Asset.file_size_bytes >= min_size_bytes)
    if user_id is not None:
        stmt = stmt.where(Asset.user_id == user_id)
    return stmt.order_by(Asset.id)


# --------------------------------------------------------------------------- #
# Core blob relocation (DB-free — unit-testable with any TieredStorageService)
# --------------------------------------------------------------------------- #

async def relocate_blob(
    storage,
    key: str,
    src_path: str,
    archive_root: str,
    *,
    verify_hash: bool = False,
    expected_sha: Optional[str] = None,
) -> int:
    """
    Upload ``key``'s local file to ``archive_root`` and verify it landed intact.

    Idempotent: skips the upload when the object already exists on the archive
    (safe resume). Raises RuntimeError on any verification failure. Returns the
    local file size in bytes.
    """
    if not await storage.exists(key, root_id=archive_root):
        await storage.store_from_path(key, src_path, root_id=archive_root)

    meta = await storage.get_metadata(key, root_id=archive_root)
    if meta is None:
        raise RuntimeError(f"verify failed: no archive object after upload (key={key})")

    local_size = os.path.getsize(src_path)
    if meta.get("size") != local_size:
        raise RuntimeError(
            f"verify failed: archive size {meta.get('size')} != local {local_size} (key={key})"
        )

    if verify_hash and expected_sha:
        archive_sha = await storage.compute_hash(key, root_id=archive_root)
        if archive_sha != expected_sha:
            raise RuntimeError(
                f"verify failed: archive hash {archive_sha} != expected {expected_sha} (key={key})"
            )

    return local_size


# --------------------------------------------------------------------------- #
# Per-asset relocation (DB)
# --------------------------------------------------------------------------- #

async def relocate_one(
    session,
    storage,
    asset,
    *,
    archive_root: str,
    apply: bool,
    verify_hash: bool,
) -> dict:
    """Relocate a single asset's original to the archive. Returns a result dict."""
    from pixsim7.backend.main.domain.assets.models import Asset

    key = asset.stored_key
    if not key:
        return {"status": "skipped", "reason": "no_stored_key", "freed_bytes": 0}

    src = storage.local_path_if_local(key, LOCAL_ROOT_ID)
    if not src or not os.path.exists(src):
        return {"status": "skipped", "reason": "local_missing", "freed_bytes": 0}

    local_size = os.path.getsize(src)

    if not apply:
        # Only probe the archive when it's actually configured — otherwise the
        # tiered router would fall back to local and falsely report "already there".
        already = bool(getattr(storage, "has_root", lambda _r: False)(archive_root)) and \
            await storage.exists(key, root_id=archive_root)
        return {
            "status": "would_move",
            "already_uploaded": already,
            "bytes": local_size,
            "freed_bytes": 0,
        }

    # 1-2. Upload + verify (idempotent).
    await relocate_blob(
        storage, key, src, archive_root,
        verify_hash=verify_hash, expected_sha=asset.sha256,
    )

    # 3. Flip placement; local_path is derived, so clear it for archived files.
    asset.storage_root_id = archive_root
    asset.local_path = None
    await session.commit()

    # 4. Post-commit: delete the local blob only if no sibling still references
    #    this key on the local root (this asset is now 'archive', so excluded).
    remaining_local = (
        await session.execute(
            select(func.count()).select_from(Asset).where(
                Asset.stored_key == key,
                or_(Asset.storage_root_id.is_(None), Asset.storage_root_id == LOCAL_ROOT_ID),
            )
        )
    ).scalar() or 0

    freed = 0
    if remaining_local == 0:
        if await storage.delete(key, root_id=LOCAL_ROOT_ID):
            freed = local_size
    return {"status": "moved", "freed_bytes": freed, "shared_local": remaining_local > 0}
