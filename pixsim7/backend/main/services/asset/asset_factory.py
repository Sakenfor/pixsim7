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
from urllib.parse import unquote, urlparse, urlunparse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.asset.content import ensure_content_blob
from pixsim7.backend.main.domain.enums import MediaType, SyncStatus, OperationType, normalize_enum
from pixsim7.backend.main.domain.relation_types import DERIVATION
from pixsim7.backend.main.infrastructure.events.bus import event_bus, ASSET_CREATED
from pixsim7.backend.main.domain.assets.upload_attribution import (
    extract_hints_from_metadata,
    normalize_upload_method,
    DEFAULT_UPLOAD_METHOD,
)


def _infer_upload_method_for_new_asset(
    *,
    source_generation_id: Optional[int],
    provider_id: str,
    remote_url: Optional[str],
    media_metadata: Optional[Dict[str, Any]],
) -> str:
    """
    Infer upload_method for a new asset using centralized rules.

    Uses the same INFERENCE_RULES from upload_attribution module but operates
    on raw fields since we don't have an Asset object yet.

    Priority (matches INFERENCE_RULES):
    1. Explicit upload_method in metadata (normalized)
    2. source_folder_id -> 'local'
    3. Pixverse sync -> 'pixverse_sync'
    4. Web import -> 'web'
    5. source_generation_id -> 'generated'
    6. Default -> 'web'
    """
    # Extract hints from metadata
    hints = extract_hints_from_metadata(media_metadata)

    # 1. Check explicit upload_method in metadata
    explicit = normalize_upload_method(hints.get("upload_method"))
    if explicit:
        return explicit

    # 2. Check source_folder_id -> local
    if hints.get("source_folder_id"):
        return "local"

    # 3. Check Pixverse sync (auto-sync or Pixverse content)
    if hints.get("source") == "extension_badge":
        return "pixverse_sync"
    # Pixverse metadata indicates badge sync
    if media_metadata:
        if media_metadata.get("pixverse_asset_uuid") or media_metadata.get("image_id"):
            return "pixverse_sync"
    # Pixverse provider with no source_site = Pixverse sync
    if provider_id == "pixverse" and not hints.get("source_site"):
        return "pixverse_sync"

    # 4. Check web import (Pinterest, Google, etc.)
    if hints.get("source_url") or hints.get("source_site"):
        return "web"

    # 5. Check if generated
    if source_generation_id:
        return "generated"

    return DEFAULT_UPLOAD_METHOD


def _normalize_remote_url(url: Optional[str]) -> Optional[str]:
    """
    Normalize a remote URL for consistent deduplication.

    - Unquotes URL-encoded characters
    - Strips whitespace
    - Normalizes relative pixverse paths to full URLs
    - Removes trailing slashes from path (but not query strings)

    This ensures that the same logical URL matches regardless of encoding
    differences between direct sync and embedded extraction.
    """
    if not url:
        return None

    # Unquote and strip
    url = unquote(url.strip())

    # Handle relative pixverse paths (same logic as _coerce_pixverse_url)
    if not url.startswith(("http://", "https://")):
        if url.startswith("/"):
            url = url[1:]
        if url.startswith(("pixverse/", "upload/")):
            url = f"https://media.pixverse.ai/{url}"
        elif url.startswith(("openapi/", "openapi\\")):
            url = f"https://media.pixverse.ai/{url.replace(chr(92), '/')}"
        elif url.startswith("media.pixverse.ai/"):
            url = f"https://{url}"

    # Parse and normalize
    try:
        parsed = urlparse(url)
        # Remove trailing slash from path (but preserve root /)
        path = parsed.path.rstrip("/") if parsed.path != "/" else parsed.path
        # Reconstruct with normalized path
        url = urlunparse((
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            path,
            parsed.params,
            parsed.query,
            "",  # Remove fragment
        ))
    except Exception:
        pass  # Keep original if parsing fails

    return url


async def add_asset(
    db: AsyncSession,
    *,
    user_id: int,
    media_type: MediaType,
    provider_id: str,
    provider_asset_id: str,
    remote_url: str,
    provider_account_id: Optional[int] = None,
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
    upload_method: Optional[str] = None,
    upload_context: Optional[Dict[str, Any]] = None,
) -> Asset:
    """
    Create or upsert an Asset record with sensible deduplication.

    Dedup order:
    1) provider_id + provider_asset_id
    2) sha256 (if provided)
    3) remote_url + provider_id + user_id (best-effort)
    """

    # Normalize remote_url for consistent deduplication
    # This ensures embedded extraction URLs (normalized) match direct sync URLs (raw)
    remote_url = _normalize_remote_url(remote_url) or remote_url

    # Track which dedup strategy matched for conflict detection
    dedup_strategy = None
    existing = None
    existing_by_provider = None
    existing_by_sha256 = None
    existing_by_url = None
    content_id = None

    if sha256:
        content = await ensure_content_blob(
            db,
            sha256=sha256,
            size_bytes=file_size_bytes,
            mime_type=mime_type,
        )
        content_id = content.id

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

    # 3) remote_url - use LIKE for case-insensitive matching with URL variants
    if not existing and remote_url:
        from pixsim_logging import get_logger
        logger = get_logger()

        # First try exact match with normalized URL
        result = await db.execute(
            select(Asset).where(
                Asset.remote_url == remote_url,
                Asset.provider_id == provider_id,
                Asset.user_id == user_id,
            )
        )
        existing_by_url = result.scalar_one_or_none()

        # Fallback: try case-insensitive match on the URL path
        # This handles old assets with different casing or URL encoding
        if not existing_by_url:
            # Extract the unique identifier from the URL (usually the filename/UUID part)
            # and do a LIKE match to find the asset regardless of encoding
            try:
                parsed = urlparse(remote_url)
                # Get the last path segment (usually the file identifier)
                path_parts = [p for p in parsed.path.split("/") if p]
                if path_parts:
                    file_identifier = path_parts[-1]
                    # Remove extension for more flexible matching
                    if "." in file_identifier:
                        file_identifier = file_identifier.rsplit(".", 1)[0]
                    if len(file_identifier) >= 8:  # Only if it looks like a real ID
                        result = await db.execute(
                            select(Asset).where(
                                Asset.remote_url.ilike(f"%{file_identifier}%"),
                                Asset.provider_id == provider_id,
                                Asset.user_id == user_id,
                            )
                        )
                        existing_by_url = result.scalar_one_or_none()
                        if existing_by_url:
                            logger.info(
                                "asset_dedup_url_fallback_match",
                                user_id=user_id,
                                provider_id=provider_id,
                                incoming_url=remote_url,
                                existing_url=existing_by_url.remote_url,
                                existing_asset_id=existing_by_url.id,
                                file_identifier=file_identifier,
                                detail="Found existing asset via URL ILIKE fallback",
                            )
            except Exception:
                pass  # Fall through if URL parsing fails

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
        _fill(existing, "width", width)
        _fill(existing, "height", height)
        _fill(existing, "duration_sec", duration_sec)
        _fill(existing, "mime_type", mime_type)
        _fill(existing, "description", description)
        _fill(existing, "local_path", local_path)
        _fill(existing, "stored_key", stored_key)
        _fill(existing, "sha256", sha256)
        _fill(existing, "file_size_bytes", file_size_bytes)
        _fill(existing, "logical_size_bytes", file_size_bytes)
        _fill(existing, "content_id", content_id)
        _fill(existing, "image_hash", image_hash)
        _fill(existing, "phash64", phash64)
        if existing.provider_id == provider_id:
            _fill(existing, "provider_account_id", provider_account_id)
            _fill(existing, "provider_asset_id", provider_asset_id)
            _fill(existing, "remote_url", remote_url)
        else:
            if provider_id and provider_asset_id:
                from pixsim_logging import get_logger
                logger = get_logger()
                uploads = dict(existing.provider_uploads or {})
                current = uploads.get(provider_id)
                if not current:
                    uploads[provider_id] = str(provider_asset_id)
                    existing.provider_uploads = uploads
                elif str(current) != str(provider_asset_id):
                    logger.warning(
                        "asset_provider_upload_conflict",
                        existing_asset_id=existing.id,
                        existing_provider_id=existing.provider_id,
                        incoming_provider_id=provider_id,
                        existing_upload_id=current,
                        incoming_upload_id=provider_asset_id,
                        detail="Provider upload mapping already exists for provider_id",
                    )

        # NOTE: Tag assignment has been moved to TagService.assign_tags_to_asset()

        # Sync status upgrade (never downgrade a terminal DOWNLOADED to REMOTE)
        if existing.sync_status != SyncStatus.DOWNLOADED and sync_status:
            existing.sync_status = sync_status

        existing.last_accessed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(existing)
        return existing

    # Auto-infer upload_method if not provided
    # Uses centralized inference rules from upload_attribution module
    if not upload_method:
        upload_method = _infer_upload_method_for_new_asset(
            source_generation_id=source_generation_id,
            provider_id=provider_id,
            remote_url=remote_url,
            media_metadata=media_metadata,
        )

    # Insert new
    asset = Asset(
        user_id=user_id,
        media_type=media_type,
        provider_id=provider_id,
        provider_asset_id=provider_asset_id,
        provider_account_id=provider_account_id,
        remote_url=remote_url,
        width=width,
        height=height,
        duration_sec=duration_sec,
        sync_status=sync_status,
        source_generation_id=source_generation_id,
        sha256=sha256,
        content_id=content_id,
        local_path=local_path,
        stored_key=stored_key,
        file_size_bytes=file_size_bytes,
        logical_size_bytes=file_size_bytes,
        mime_type=mime_type,
        description=description,
        # NOTE: tags removed - use TagService.assign_tags_to_asset() after creation
        media_metadata=media_metadata,
        image_hash=image_hash,
        phash64=phash64,
        upload_method=upload_method,
        upload_context=upload_context,
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

    operation_type = normalize_enum(operation_type, OperationType)

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
    from pixsim7.backend.main.services.generation.creation import get_relation_type_for_role

    created_count = 0
    updated_count = 0
    operation_type = normalize_enum(operation_type, OperationType)

    parsed_inputs: List[Dict[str, Any]] = []
    parent_ids: set[int] = set()

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

        parsed_inputs.append(
            {
                "parent_id": parent_id,
                "relation_type": relation_type,
                "sequence_order": sequence_order,
                "start_time": start_time,
                "end_time": end_time,
                "frame": frame,
            }
        )
        parent_ids.add(parent_id)

    if not parsed_inputs:
        return 0

    result = await db.execute(
        select(AssetLineage).where(
            AssetLineage.child_asset_id == child_asset_id,
            AssetLineage.parent_asset_id.in_(parent_ids),
        )
    )
    existing_rows = result.scalars().all()
    existing_map = {
        (row.parent_asset_id, row.relation_type, row.sequence_order): row
        for row in existing_rows
    }

    for entry in parsed_inputs:
        parent_id = entry["parent_id"]
        relation_type = entry["relation_type"]
        sequence_order = entry["sequence_order"]
        start_time = entry["start_time"]
        end_time = entry["end_time"]
        frame = entry["frame"]

        key = (parent_id, relation_type, sequence_order)
        existing = existing_map.get(key)
        if existing:
            updated = False
            if existing.parent_start_time is None and start_time is not None:
                existing.parent_start_time = start_time
                updated = True
            if existing.parent_end_time is None and end_time is not None:
                existing.parent_end_time = end_time
                updated = True
            if existing.parent_frame is None and frame is not None:
                existing.parent_frame = frame
                updated = True
            if updated:
                updated_count += 1
            continue

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

    if created_count > 0 or updated_count > 0:
        await db.commit()

    return created_count
