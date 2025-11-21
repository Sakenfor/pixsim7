"""
Centralized asset creation/upsert helpers to avoid duplicating inline Asset() construction.

Contract:
- Input: minimal identity + location fields (user_id, media_type, provider identifiers, remote_url)
- Dedup: prefer provider_id+provider_asset_id; optionally sha256; fallback by remote_url for same provider/user
- Behavior: if an Asset exists, update missing fields only (non-destructive) and return it; else insert new
"""
from __future__ import annotations

from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.asset import Asset
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus


async def add_asset(
    db: AsyncSession,
    *,
    user_id: int,
    media_type: MediaType,
    provider_id: str,
    provider_asset_id: str,
    remote_url: str,
    provider_account_id: Optional[int] = None,
    thumbnail_url: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    duration_sec: Optional[float] = None,
    sync_status: SyncStatus = SyncStatus.REMOTE,
    source_generation_id: Optional[int] = None,
    sha256: Optional[str] = None,
    local_path: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
    mime_type: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[List[str]] = None,
    style_tags: Optional[List[str]] = None,
    media_metadata: Optional[Dict[str, Any]] = None,
    parent_asset_ids: Optional[List[int]] = None,
    relation_type: Optional[str] = None,
) -> Asset:
    """
    Create or upsert an Asset record with sensible deduplication.

    Dedup order:
    1) provider_id + provider_asset_id
    2) sha256 (if provided)
    3) remote_url + provider_id + user_id (best-effort)
    """

    # Track which dedup strategy matched for conflict detection
    dedup_strategy = None
    existing_by_provider = None
    existing_by_sha256 = None
    existing_by_url = None

    # 1) Provider tuple
    result = await db.execute(
        select(Asset).where(
            Asset.provider_id == provider_id,
            Asset.provider_asset_id == provider_asset_id,
            Asset.user_id == user_id,
        )
    )
    existing_by_provider = result.scalar_one_or_none()
    if existing_by_provider:
        existing = existing_by_provider
        dedup_strategy = "provider_tuple"

    # 2) sha256
    if not existing and sha256:
        result = await db.execute(
            select(Asset).where(
                Asset.sha256 == sha256,
                Asset.user_id == user_id,
            )
        )
        existing_by_sha256 = result.scalar_one_or_none()
        if existing_by_sha256:
            existing = existing_by_sha256
            dedup_strategy = "sha256"

    # 3) remote_url
    if not existing and remote_url:
        result = await db.execute(
            select(Asset).where(
                Asset.remote_url == remote_url,
                Asset.provider_id == provider_id,
                Asset.user_id == user_id,
            )
        )
        existing_by_url = result.scalar_one_or_none()
        if existing_by_url:
            existing = existing_by_url
            dedup_strategy = "remote_url"

    # Conflict detection: warn if multiple strategies match different assets
    if existing:
        from pixsim_logging import get_logger
        logger = get_logger()

        conflicts = []
        if existing_by_provider and existing_by_sha256 and existing_by_provider.id != existing_by_sha256.id:
            conflicts.append(("provider_tuple", existing_by_provider.id, "sha256", existing_by_sha256.id))
        if existing_by_provider and existing_by_url and existing_by_provider.id != existing_by_url.id:
            conflicts.append(("provider_tuple", existing_by_provider.id, "remote_url", existing_by_url.id))
        if existing_by_sha256 and existing_by_url and existing_by_sha256.id != existing_by_url.id:
            conflicts.append(("sha256", existing_by_sha256.id, "remote_url", existing_by_url.id))

        if conflicts:
            logger.warning(
                "asset_deduplication_conflict",
                user_id=user_id,
                provider_id=provider_id,
                provider_asset_id=provider_asset_id,
                sha256=sha256,
                remote_url=remote_url,
                conflicts=conflicts,
                used_strategy=dedup_strategy,
                matched_asset_id=existing.id,
                detail="Multiple deduplication strategies matched different assets, using first match"
            )

    if existing:
        # Non-destructive updates: only fill in missing fields
        _fill = _fill_missing
        _fill(existing, "thumbnail_url", thumbnail_url)
        _fill(existing, "width", width)
        _fill(existing, "height", height)
        _fill(existing, "duration_sec", duration_sec)
        _fill(existing, "mime_type", mime_type)
        _fill(existing, "description", description)
        _fill(existing, "local_path", local_path)
        _fill(existing, "sha256", sha256)
        _fill(existing, "file_size_bytes", file_size_bytes)

        if tags:
            existing.tags = existing.tags or []
            # simple merge unique
            existing.tags = list({*existing.tags, *tags})
        if style_tags:
            existing.style_tags = existing.style_tags or []
            existing.style_tags = list({*existing.style_tags, *style_tags})

        # Sync status upgrade (never downgrade a terminal DOWNLOADED to REMOTE)
        if existing.sync_status != SyncStatus.DOWNLOADED and sync_status:
            existing.sync_status = sync_status

        existing.last_accessed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing)
        return existing

    # Insert new
    asset = Asset(
        user_id=user_id,
        media_type=media_type,
        provider_id=provider_id,
        provider_asset_id=provider_asset_id,
        provider_account_id=provider_account_id,
        remote_url=remote_url,
        thumbnail_url=thumbnail_url,
        width=width,
        height=height,
        duration_sec=duration_sec,
        sync_status=sync_status,
        source_generation_id=source_generation_id,
        sha256=sha256,
        local_path=local_path,
        file_size_bytes=file_size_bytes,
        mime_type=mime_type,
        description=description,
        tags=tags or [],
        style_tags=style_tags or [],
        media_metadata=media_metadata,
        created_at=datetime.utcnow(),
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    # Create lineage links if provided
    if parent_asset_ids:
        from pixsim7.backend.main.domain.asset_lineage import AssetLineage
        from pixsim7.backend.main.domain.enums import OperationType
        op_type = OperationType.IMAGE_TO_VIDEO if media_type == MediaType.VIDEO else OperationType.IMAGE_TO_VIDEO
        for order, pid in enumerate(parent_asset_ids):
            if pid == asset.id:
                continue
            db.add(AssetLineage(
                child_asset_id=asset.id,
                parent_asset_id=pid,
                relation_type=relation_type or "DERIVATION",
                operation_type=op_type,
                sequence_order=order,
            ))
        await db.commit()
        # no refresh needed for lineage
    return asset


def _fill_missing(obj: Asset, field: str, value):
    if value is not None and getattr(obj, field) in (None, [], ""):
        setattr(obj, field, value)
