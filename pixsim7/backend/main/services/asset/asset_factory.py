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

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus, OperationType
from pixsim7.backend.main.domain.relation_types import DERIVATION
from pixsim7.backend.main.infrastructure.events.bus import event_bus, ASSET_CREATED


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
    stored_key: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
    mime_type: Optional[str] = None,
    description: Optional[str] = None,
    # NOTE: tags parameter removed - use TagService.assign_tags_to_asset() after creation
    media_metadata: Optional[Dict[str, Any]] = None,
    parent_asset_ids: Optional[List[int]] = None,
    relation_type: Optional[str] = None,
    image_hash: Optional[str] = None,
    phash64: Optional[int] = None,
    operation_type: Optional[OperationType] = None,
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
    existing = None
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
        _fill(existing, "stored_key", stored_key)
        _fill(existing, "sha256", sha256)
        _fill(existing, "file_size_bytes", file_size_bytes)
        _fill(existing, "image_hash", image_hash)
        _fill(existing, "phash64", phash64)

        # NOTE: Tag assignment has been moved to TagService.assign_tags_to_asset()

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
        stored_key=stored_key,
        file_size_bytes=file_size_bytes,
        mime_type=mime_type,
        description=description,
        # NOTE: tags removed - use TagService.assign_tags_to_asset() after creation
        media_metadata=media_metadata,
        image_hash=image_hash,
        phash64=phash64,
        created_at=datetime.utcnow(),
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)

    # Emit asset:created event
    await event_bus.publish(ASSET_CREATED, {
        "asset_id": asset.id,
        "user_id": asset.user_id,
        "media_type": asset.media_type.value,
        "provider_id": asset.provider_id,
        "source": "upload" if not source_generation_id else "generation",
    })

    # Create lineage links if provided
    if parent_asset_ids:
        # Default operation type if not provided: treat video children as IMAGE_TO_VIDEO,
        # and image children as TEXT_TO_IMAGE. Callers can override via operation_type.
        op_type = operation_type
        if op_type is None:
            if media_type == MediaType.VIDEO:
                op_type = OperationType.IMAGE_TO_VIDEO
            else:
                op_type = OperationType.TEXT_TO_IMAGE

        await create_lineage_links(
            db,
            child_asset_id=asset.id,
            parent_asset_ids=parent_asset_ids,
            relation_type=relation_type or DERIVATION,
            operation_type=op_type,
        )
    return asset


def _fill_missing(obj: Asset, field: str, value):
    if value is not None and getattr(obj, field) in (None, [], ""):
        setattr(obj, field, value)


async def create_lineage_links(
    db: AsyncSession,
    *,
    child_asset_id: int,
    parent_asset_ids: List[int],
    relation_type: str,
    operation_type: OperationType,
) -> None:
    """
    Create AssetLineage rows linking parent assets to a child asset.

    This centralizes lineage writing so callers don't duplicate
    AssetLineage construction logic.

    For simple cases with uniform relation_type. For per-parent metadata,
    use create_lineage_links_with_metadata instead.
    """
    from pixsim7.backend.main.domain.assets.lineage import AssetLineage

    for order, parent_id in enumerate(parent_asset_ids):
        if parent_id == child_asset_id:
            continue
        db.add(
            AssetLineage(
                child_asset_id=child_asset_id,
                parent_asset_id=parent_id,
                relation_type=relation_type,
                operation_type=operation_type,
                sequence_order=order,
            )
        )
    await db.commit()


async def create_lineage_links_with_metadata(
    db: AsyncSession,
    *,
    child_asset_id: int,
    parent_inputs: List[Dict[str, Any]],
    operation_type: OperationType,
    default_relation_type: str = DERIVATION,
) -> int:
    """
    Create AssetLineage rows with per-parent metadata.

    This extended version supports:
    - Per-parent relation_type (via role mapping)
    - Time ranges (parent_start_time, parent_end_time)
    - Frame numbers (parent_frame)
    - Sequence ordering

    Args:
        db: Database session
        child_asset_id: ID of the created child asset
        parent_inputs: List of input dicts from Generation.inputs, each containing:
            - asset: "asset:123" (required for lineage)
            - role: Input role for relation_type mapping
            - sequence_order: Order in multi-input ops
            - time: {"start": float, "end": float} (optional)
            - frame: int (optional)
        operation_type: The operation that created the child
        default_relation_type: Fallback if role not mapped

    Returns:
        Number of lineage edges created
    """
    from pixsim7.backend.main.domain.assets.lineage import AssetLineage
    from pixsim7.backend.main.services.generation.creation_service import get_relation_type_for_role

    created_count = 0

    for input_entry in parent_inputs:
        # Extract asset ID from "asset:123" format
        asset_ref = input_entry.get("asset")
        if not asset_ref or not isinstance(asset_ref, str):
            continue

        if not asset_ref.startswith("asset:"):
            continue

        try:
            parent_id = int(asset_ref.split(":", 1)[1])
        except (ValueError, IndexError):
            continue

        # Skip self-reference
        if parent_id == child_asset_id:
            continue

        # Get relation_type from role
        role = input_entry.get("role", "")
        relation_type = get_relation_type_for_role(role) if role else default_relation_type

        # Get sequence order
        sequence_order = input_entry.get("sequence_order", 0)

        # Get time metadata
        time_info = input_entry.get("time", {})
        start_time = time_info.get("start") if isinstance(time_info, dict) else None
        end_time = time_info.get("end") if isinstance(time_info, dict) else None

        # Get frame metadata
        frame = input_entry.get("frame")

        db.add(
            AssetLineage(
                child_asset_id=child_asset_id,
                parent_asset_id=parent_id,
                relation_type=relation_type,
                operation_type=operation_type,
                sequence_order=sequence_order,
                parent_start_time=start_time,
                parent_end_time=end_time,
                parent_frame=frame,
            )
        )
        created_count += 1

    if created_count > 0:
        await db.commit()

    return created_count
