"""
Asset deduplication helpers

Centralized functions for finding existing assets using multiple candidate IDs,
URLs, and hashes. Used by sync endpoints and enrichment services to ensure
consistent dedup logic across all asset creation paths.
"""
from __future__ import annotations

from typing import Optional, List, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import normalize_url
from pixsim_logging import get_logger

logger = get_logger()


async def find_existing_by_candidate_ids(
    db: AsyncSession,
    user_id: int,
    provider_id: str,
    candidate_ids: List[str],
) -> Optional[Asset]:
    """
    Find an existing asset matching ANY of the candidate provider_asset_ids.

    This handles Pixverse's mixed ID schemes where the same asset might be
    referenced by:
    - Numeric ID (e.g., "456789")
    - UUID (e.g., "abc-123-def-456")
    - UUID extracted from URL

    Args:
        db: Database session
        user_id: Owner user ID
        provider_id: Provider identifier (e.g., "pixverse")
        candidate_ids: List of possible provider_asset_ids to check

    Returns:
        First matching Asset or None if no match found
    """
    if not candidate_ids:
        return None

    # Filter out empty/None values
    valid_ids = [cid for cid in candidate_ids if cid]
    if not valid_ids:
        return None

    stmt = select(Asset).where(
        Asset.user_id == user_id,
        Asset.provider_id == provider_id,
        Asset.provider_asset_id.in_(valid_ids),
    )
    result = await db.execute(stmt)
    matches = result.scalars().all()
    if not matches:
        return None
    if len(matches) > 1:
        # Multiple Asset rows match different candidate IDs in the same set
        # (e.g. Pixverse numeric ID + UUID for the same logical asset that
        # ended up creating two rows). Prefer the lowest-ID (oldest) row and
        # log so it can be reconciled.
        logger.warning(
            "dedup_multiple_candidate_id_matches",
            provider_id=provider_id,
            user_id=user_id,
            candidate_ids=valid_ids,
            matched_asset_ids=[a.id for a in matches],
        )
        matches.sort(key=lambda a: a.id)
    return matches[0]


async def find_existing_by_url(
    db: AsyncSession,
    user_id: int,
    provider_id: str,
    remote_url: str,
) -> Optional[Asset]:
    """
    Find an existing asset by remote URL with normalization and fallback matching.

    Tries:
    1. Exact match with normalized URL
    2. ILIKE fallback on the URL path identifier (handles encoding differences)

    Args:
        db: Database session
        user_id: Owner user ID
        provider_id: Provider identifier
        remote_url: URL to match

    Returns:
        Matching Asset or None
    """
    from urllib.parse import urlparse

    if not remote_url:
        return None

    # Normalize URL for consistent matching
    normalized_url = normalize_url(remote_url) or remote_url

    # Try exact match first
    stmt = select(Asset).where(
        Asset.remote_url == normalized_url,
        Asset.provider_id == provider_id,
        Asset.user_id == user_id,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        return existing

    # Fallback: ILIKE match on URL path identifier
    try:
        parsed = urlparse(normalized_url)
        path_parts = [p for p in parsed.path.split("/") if p]
        if path_parts:
            file_identifier = path_parts[-1]
            # Remove extension for more flexible matching
            if "." in file_identifier:
                file_identifier = file_identifier.rsplit(".", 1)[0]
            if len(file_identifier) >= 8:  # Only if it looks like a real ID
                stmt = select(Asset).where(
                    Asset.remote_url.ilike(f"%{file_identifier}%"),
                    Asset.provider_id == provider_id,
                    Asset.user_id == user_id,
                )
                result = await db.execute(stmt)
                return result.scalar_one_or_none()
    except Exception:
        pass

    return None


async def find_existing_asset(
    db: AsyncSession,
    user_id: int,
    provider_id: str,
    candidate_ids: Optional[List[str]] = None,
    remote_url: Optional[str] = None,
    sha256: Optional[str] = None,
) -> Optional[Asset]:
    """
    Find an existing asset using multiple dedup strategies.

    Dedup order (returns first match):
    1. Provider candidate IDs (any match)
    2. SHA256 hash
    3. Remote URL (exact + ILIKE fallback)

    This is the primary entry point for dedup checks. Use this before
    creating new assets to ensure we don't create duplicates.

    Args:
        db: Database session
        user_id: Owner user ID
        provider_id: Provider identifier
        candidate_ids: List of possible provider_asset_ids
        remote_url: Remote URL to match
        sha256: Content hash to match

    Returns:
        Matching Asset or None
    """
    # 1) Check candidate IDs
    if candidate_ids:
        existing = await find_existing_by_candidate_ids(
            db, user_id, provider_id, candidate_ids
        )
        if existing:
            return existing

    # 2) Check SHA256
    if sha256:
        stmt = select(Asset).where(
            Asset.sha256 == sha256,
            Asset.user_id == user_id,
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            return existing

    # 3) Check URL
    if remote_url:
        existing = await find_existing_by_url(
            db, user_id, provider_id, remote_url
        )
        if existing:
            return existing

    return None


async def resolve_existing_asset_by_url_hash(
    db: AsyncSession,
    user_id: int,
    provider_id: str,
    remote_url: str,
) -> tuple[Optional[Asset], Optional[str]]:
    """
    Last-resort source resolution: download the remote bytes, hash them, and
    match against an existing asset's ``sha256``.

    Used when provider-id / URL matching fails for a source image referenced
    only by a (provider-side) URL — e.g. an i2i generated on the provider's own
    site whose source image we already hold under a different provider id. The
    same bytes ⇒ same sha256 ⇒ we can link the local asset instead of minting a
    duplicate REMOTE stub.

    Costs one byte download per call, so callers should only invoke it after the
    cheap (id/URL) strategies miss.

    Returns:
        ``(asset, sha256)`` — ``asset`` is the matched local asset or ``None``;
        ``sha256`` is the computed content hash (returned even on no-match so
        callers can stamp it on a stub they create). ``(None, None)`` if the
        download/hash failed.
    """
    if not remote_url:
        return None, None

    from pixsim7.backend.main.shared.http_utils import download_url_to_temp
    from pixsim7.backend.main.shared.storage_utils import compute_sha256

    temp_path: Optional[str] = None
    try:
        temp_path = await download_url_to_temp(
            remote_url,
            log_context={"purpose": "source_hash_resolve"},
        )
        sha256 = compute_sha256(temp_path)
    except Exception as e:
        logger.warning(
            "source_hash_resolve_download_failed",
            remote_url=remote_url[:120],
            error=str(e),
        )
        return None, None
    finally:
        if temp_path:
            import os

            try:
                os.remove(temp_path)
            except OSError:
                pass

    stmt = select(Asset).where(
        Asset.sha256 == sha256,
        Asset.user_id == user_id,
    )
    result = await db.execute(stmt)
    existing = result.scalars().first()
    return existing, sha256


async def find_existing_assets_batch(
    db: AsyncSession,
    user_id: int,
    provider_id: str,
    all_candidate_ids: Set[str],
) -> dict[str, Asset]:
    """
    Batch lookup of existing assets by candidate IDs.

    More efficient than individual lookups when processing multiple
    embedded assets. Returns a dict mapping provider_asset_id -> Asset
    for all matches found.

    Args:
        db: Database session
        user_id: Owner user ID
        provider_id: Provider identifier
        all_candidate_ids: Set of all candidate IDs to check

    Returns:
        Dict mapping matched provider_asset_id to Asset
    """
    if not all_candidate_ids:
        return {}

    valid_ids = [cid for cid in all_candidate_ids if cid]
    if not valid_ids:
        return {}

    stmt = select(Asset).where(
        Asset.user_id == user_id,
        Asset.provider_id == provider_id,
        Asset.provider_asset_id.in_(valid_ids),
    )
    result = await db.execute(stmt)
    assets = result.scalars().all()

    return {asset.provider_asset_id: asset for asset in assets}
