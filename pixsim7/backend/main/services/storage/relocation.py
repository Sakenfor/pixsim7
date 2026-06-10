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

from sqlalchemy import exists, func, or_, select

from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.storage.roots import LOCAL_ROOT_ID

# Tag slug that pins an asset to local storage by excluding it from relocation.
# Mirrors the frontend FAVORITE_TAG_SLUG (apps/main/.../lib/favoriteTag.ts) and
# the seeded default tag (seeds/default_tags.py). Favorites are backend-native
# (a real tag on the asset), so excluding them needs no new schema — just a
# NOT EXISTS guard on the asset_tag join. See plan media-storage-tiering cp-i.
FAVORITE_TAG_SLUG = "user:favorite"


# --------------------------------------------------------------------------- #
# Candidate selection
# --------------------------------------------------------------------------- #

def _normalize_media_types(media_types) -> list:
    """Coerce an iterable of MediaType/str into MediaType members.

    None/empty defaults to ``[VIDEO]`` so the legacy callers (the CLI, the
    /relocate-videos endpoint) keep their video-only behavior. Unknown strings
    are skipped; an all-invalid input still falls back to video.
    """
    if not media_types:
        return [MediaType.VIDEO]
    out: list = []
    for t in media_types:
        if isinstance(t, MediaType):
            out.append(t)
            continue
        try:
            out.append(MediaType(str(t).lower()))
        except ValueError:
            continue
    return out or [MediaType.VIDEO]


def candidate_query(
    min_size_bytes: int,
    user_id: Optional[int],
    *,
    media_types=None,
    older_than_days: Optional[int] = None,
    content_ratings=None,
    exclude_tag_slugs=None,
    exclude_set_ids=None,
    include_set_ids=None,
):
    """Build the select for archive-relocation candidates currently on local.

    Filters (all optional, AND-ed):
    - ``media_types``: iterable of MediaType/str; None => videos only (back-compat).
    - ``min_size_bytes``: file_size_bytes >= this.
    - ``older_than_days``: created_at older than N days ago.
    - ``content_ratings``: iterable of content_rating strings to include.
    - ``exclude_tag_slugs``: iterable of tag slugs; assets carrying ANY of these
      tags are excluded (NOT EXISTS on the asset_tag join). This is how curated
      assets are pinned to local — e.g. pass ``[FAVORITE_TAG_SLUG]`` so favorites
      are never archived.
    - ``exclude_set_ids``: iterable of manual asset-set ids; assets that are a
      member of ANY of these sets are excluded (NOT EXISTS on asset_set_member) —
      pin curated sets to local. Plan cp-i (i3).
    - ``include_set_ids``: iterable of manual asset-set ids; restrict candidates
      to assets that are a member of ANY of these sets (EXISTS) — "archive only
      this set". Membership-based, so this targets manual sets only; smart sets
      (filter-derived, no member rows) are not resolved here.
    """
    from datetime import datetime, timedelta, timezone

    from pixsim7.backend.main.domain.assets.asset_set import AssetSetMember
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.domain.assets.tag import AssetTag, Tag

    stmt = select(Asset).where(
        Asset.media_type.in_(_normalize_media_types(media_types)),
        Asset.stored_key.is_not(None),
        or_(Asset.storage_root_id.is_(None), Asset.storage_root_id == LOCAL_ROOT_ID),
        # Always-on base guards (not user-configurable):
        # 1. Only genuine gallery assets — never masks/guidance/reference/probe
        #    (throwaway test gens), which must not be shipped to the archive.
        Asset.asset_kind == "content",
        # 2. Skip in-flight/failed ingests; only move settled assets. Allow NULL
        #    (legacy rows predating ingest tracking) — note NOT IN would drop
        #    NULLs in SQL, so this is an explicit OR.
        or_(Asset.ingest_status.is_(None), Asset.ingest_status == "completed"),
    )
    if min_size_bytes > 0:
        stmt = stmt.where(Asset.file_size_bytes >= min_size_bytes)
    if user_id is not None:
        stmt = stmt.where(Asset.user_id == user_id)
    if older_than_days and older_than_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        stmt = stmt.where(Asset.created_at <= cutoff)
    if content_ratings:
        stmt = stmt.where(Asset.content_rating.in_(list(content_ratings)))
    slugs = [s for s in (exclude_tag_slugs or []) if s]
    if slugs:
        # Exclude assets carrying any pinned tag (e.g. user:favorite). Correlated
        # NOT EXISTS keeps it a single statement with no row fan-out from the join.
        pinned = (
            select(AssetTag.asset_id)
            .join(Tag, Tag.id == AssetTag.tag_id)
            .where(AssetTag.asset_id == Asset.id, Tag.slug.in_(slugs))
        )
        stmt = stmt.where(~exists(pinned))
    incl_sets = [int(s) for s in (include_set_ids or [])]
    if incl_sets:
        # Restrict to members of any included set ("archive only this set").
        in_set = select(AssetSetMember.asset_id).where(
            AssetSetMember.asset_id == Asset.id, AssetSetMember.set_id.in_(incl_sets)
        )
        stmt = stmt.where(exists(in_set))
    excl_sets = [int(s) for s in (exclude_set_ids or [])]
    if excl_sets:
        # Pin members of any excluded set to local (mirror of the tag guard).
        in_excl_set = select(AssetSetMember.asset_id).where(
            AssetSetMember.asset_id == Asset.id, AssetSetMember.set_id.in_(excl_sets)
        )
        stmt = stmt.where(~exists(in_excl_set))
    return stmt.order_by(Asset.id)


def restore_candidate_query(
    user_id: Optional[int],
    *,
    archive_root: str,
    asset_ids=None,
    set_ids=None,
    media_types=None,
):
    """Build the select for archived assets eligible to restore back to local.

    The reverse selector of ``candidate_query``: it targets the archive root
    rather than local. Filters (all optional, AND-ed):
    - ``asset_ids``: explicit ids to restore.
    - ``set_ids``: members of any of these manual sets (EXISTS on asset_set_member).
    - ``media_types``: limit by media type (NO video-only default here — restore
      should not silently assume video the way relocation does).
    Always scoped to ``storage_root_id == archive_root`` with a non-null key.
    """
    from pixsim7.backend.main.domain.assets.asset_set import AssetSetMember
    from pixsim7.backend.main.domain.assets.models import Asset

    stmt = select(Asset).where(
        Asset.storage_root_id == archive_root,
        Asset.stored_key.is_not(None),
    )
    if user_id is not None:
        stmt = stmt.where(Asset.user_id == user_id)
    if media_types:
        stmt = stmt.where(Asset.media_type.in_(_normalize_media_types(media_types)))
    ids = [int(i) for i in (asset_ids or [])]
    if ids:
        stmt = stmt.where(Asset.id.in_(ids))
    sids = [int(s) for s in (set_ids or [])]
    if sids:
        in_set = select(AssetSetMember.asset_id).where(
            AssetSetMember.asset_id == Asset.id, AssetSetMember.set_id.in_(sids)
        )
        stmt = stmt.where(exists(in_set))
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


async def restore_one(
    session,
    storage,
    asset,
    *,
    archive_root: str,
    apply: bool,
    verify_hash: bool,
    delete_archive: bool = False,
) -> dict:
    """Restore a single archived asset's original back to local. Reverse of
    ``relocate_one``: pull archive -> local, verify it landed intact BEFORE
    flipping ``storage_root_id`` back, then (optionally) drop the archive copy.

    ``delete_archive`` defaults False — keep the archive object as a backup so
    un-archiving never destroys the only verified copy. ``restored_bytes`` is the
    local disk this consumes (the inverse of relocation's ``freed_bytes``).
    """
    from pixsim7.backend.main.domain.assets.models import Asset

    key = asset.stored_key
    if not key:
        return {"status": "skipped", "reason": "no_stored_key", "restored_bytes": 0}

    # Only assets actually on the archive root are restorable.
    if asset.storage_root_id != archive_root:
        return {"status": "skipped", "reason": "not_archived", "restored_bytes": 0}

    meta = await storage.get_metadata(key, root_id=archive_root)
    if meta is None:
        return {"status": "skipped", "reason": "archive_missing", "restored_bytes": 0}
    archive_size = meta.get("size")

    if not apply:
        local_present = await storage.exists(key, root_id=LOCAL_ROOT_ID)
        return {
            "status": "would_restore",
            "already_local": local_present,
            "bytes": archive_size or 0,
            "restored_bytes": 0,
        }

    # 1. Pull archive bytes to a temp file, then place at the canonical local key.
    tmp_path, is_temp = await storage.ensure_local_copy(key, root_id=archive_root)
    try:
        await storage.store_from_path(key, tmp_path, root_id=LOCAL_ROOT_ID)
    finally:
        if is_temp:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # 2. Verify the local copy landed intact BEFORE flipping placement / deleting
    #    the archive — same verify-before-mutate discipline as relocation.
    local_meta = await storage.get_metadata(key, root_id=LOCAL_ROOT_ID)
    if local_meta is None:
        raise RuntimeError(f"verify failed: no local object after restore (key={key})")
    if archive_size is not None and local_meta.get("size") != archive_size:
        raise RuntimeError(
            f"verify failed: local size {local_meta.get('size')} != archive {archive_size} (key={key})"
        )
    if verify_hash and asset.sha256:
        local_sha = await storage.compute_hash(key, root_id=LOCAL_ROOT_ID)
        if local_sha != asset.sha256:
            raise RuntimeError(
                f"verify failed: local hash {local_sha} != expected {asset.sha256} (key={key})"
            )

    # 3. Flip placement back to local; local_path becomes a real path again.
    asset.storage_root_id = LOCAL_ROOT_ID
    asset.local_path = storage.local_path_if_local(key, LOCAL_ROOT_ID)
    await session.commit()

    restored = local_meta.get("size") or 0

    # 4. Post-commit: optionally delete the archive blob, but only if no sibling
    #    still references this key on the archive root (this asset is now local).
    archive_deleted = False
    if delete_archive:
        remaining_archive = (
            await session.execute(
                select(func.count()).select_from(Asset).where(
                    Asset.stored_key == key,
                    Asset.storage_root_id == archive_root,
                )
            )
        ).scalar() or 0
        if remaining_archive == 0:
            archive_deleted = await storage.delete(key, root_id=archive_root)
    return {"status": "restored", "restored_bytes": restored, "archive_deleted": archive_deleted}
