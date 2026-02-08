"""
Pixverse composition asset resolution

Resolves composition_assets to Pixverse-ready URLs.
Split from pixverse.py for better separation of concerns.
"""
from __future__ import annotations

from typing import Any, Optional, TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import ProviderAccount
from pixsim7.backend.main.services.provider.base import ProviderError
from pixsim7.backend.main.shared.asset_refs import extract_asset_id
from pixsim7.backend.main.services.provider.adapters.pixverse_ids import looks_like_pixverse_uuid
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    resolve_reference as _resolve_reference,
    PixverseApiMode,
)

from pixsim_logging import get_logger

if TYPE_CHECKING:
    from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider

logger = get_logger()


async def resolve_composition_assets_for_pixverse(
    composition_assets: list,
    *,
    db_session: AsyncSession,
    api_mode: PixverseApiMode,
    media_type_filter: str | None = None,
    provider: Optional["PixverseProvider"] = None,
    account: Optional[ProviderAccount] = None,
) -> list[str]:
    """
    Resolve composition_assets to Pixverse-ready URLs.

    This is the single canonical path for converting asset refs to provider URLs.
    Uses AssetSyncService.get_asset_for_provider() which handles:
    - Looking up asset.provider_uploads["pixverse"]
    - Uploading to Pixverse if not already uploaded
    - Caching the result

    For WebAPI mode, if the provider_ref is a UUID (not a URL), we attempt to
    resolve it to a URL via the Pixverse API metadata lookup.

    Args:
        composition_assets: List of composition asset dicts
        db_session: Database session for asset lookups
        api_mode: Pixverse API mode (WebAPI requires full URLs)
        media_type_filter: Optional filter ("image" or "video")
        provider: Optional PixverseProvider instance for UUID resolution
        account: Optional ProviderAccount for UUID resolution

    Returns:
        List of resolved URLs ready for Pixverse API

    Raises:
        ProviderError: If any asset cannot be resolved
    """
    from pixsim7.backend.main.services.asset.sync import AssetSyncService
    from pixsim7.backend.main.shared.composition_assets import coerce_composition_assets

    # Normalize input
    assets = coerce_composition_assets(composition_assets)
    if not assets:
        return []

    sync_service = AssetSyncService(db_session)
    resolved_urls: list[str] = []

    for i, item in enumerate(assets):
        # Filter by media type if specified
        item_media_type = item.get("media_type")
        if media_type_filter and item_media_type and item_media_type != media_type_filter:
            logger.debug(
                "pixverse_asset_skipped_media_type",
                index=i,
                item_media_type=item_media_type,
                filter=media_type_filter,
            )
            continue

        # Get asset ref or URL
        asset_value = item.get("asset")
        url_value = item.get("url")

        # Try to extract asset ID
        asset_id = extract_asset_id(asset_value)

        logger.debug(
            "pixverse_resolve_asset_item",
            index=i,
            asset_value=str(asset_value)[:50] if asset_value else None,
            url_value=str(url_value)[:50] if url_value else None,
            extracted_asset_id=asset_id,
            item_keys=list(item.keys()),
        )

        if asset_id is not None:
            # Resolve via AssetSyncService (uploads if needed)
            try:
                provider_ref = await sync_service.get_asset_for_provider(
                    asset_id=asset_id,
                    target_provider_id="pixverse",
                )
            except Exception as e:
                raise ProviderError(
                    f"Failed to resolve composition_assets[{i}] (asset:{asset_id}): {e}"
                )

            # Also load the asset to get remote_url as fallback
            asset_remote_url = None
            try:
                from pixsim7.backend.main.domain import Asset
                from sqlalchemy import select
                result = await db_session.execute(
                    select(Asset.remote_url).where(Asset.id == asset_id)
                )
                asset_remote_url = result.scalar_one_or_none()
            except Exception:
                pass  # Non-critical, we'll try without it

            # Validate the resolved ref is valid for the API mode
            validated_ref = _resolve_reference(provider_ref, api_mode)

            logger.info(
                "pixverse_asset_resolution_step1",
                asset_id=asset_id,
                provider_ref=str(provider_ref)[:60] if provider_ref else None,
                api_mode=api_mode.value,
                validated_ref_ok=bool(validated_ref),
            )

            # If validation failed and we're in WebAPI mode, try to resolve UUID to URL
            if not validated_ref and api_mode == PixverseApiMode.WEBAPI:
                is_uuid = looks_like_pixverse_uuid(str(provider_ref)) if provider_ref else False
                logger.info(
                    "pixverse_uuid_resolution_attempt",
                    asset_id=asset_id,
                    provider_ref=str(provider_ref)[:60] if provider_ref else None,
                    is_uuid=is_uuid,
                    has_provider=bool(provider),
                    has_account=bool(account),
                    has_remote_url=bool(asset_remote_url),
                )

                if provider and account and provider_ref:
                    # Check if it looks like a UUID - need to resolve via Pixverse API
                    if is_uuid:
                        media_type = item_media_type or media_type_filter or "image"
                        try:
                            resolved_url = await provider._resolve_webapi_url_from_id(
                                account,
                                value=provider_ref,
                                media_type=media_type,
                                asset_id=asset_id,
                                remote_url=asset_remote_url,  # Pass remote_url for fallback
                            )
                            if resolved_url:
                                validated_ref = resolved_url
                                logger.info(
                                    "pixverse_uuid_resolved_to_url",
                                    asset_id=asset_id,
                                    uuid=str(provider_ref)[:36],
                                    resolved_url=resolved_url[:80],
                                )
                        except Exception as e:
                            logger.warning(
                                "pixverse_uuid_resolution_failed",
                                asset_id=asset_id,
                                uuid=str(provider_ref)[:36],
                                error=str(e),
                            )

                # Fallback: If UUID resolution failed but we have a valid remote_url, try using it directly
                if not validated_ref and asset_remote_url:
                    fallback_ref = _resolve_reference(asset_remote_url, api_mode)
                    if fallback_ref:
                        validated_ref = fallback_ref
                        logger.info(
                            "pixverse_using_remote_url_fallback",
                            asset_id=asset_id,
                            remote_url=asset_remote_url[:80],
                        )

            if not validated_ref:
                raise ProviderError(
                    f"composition_assets[{i}] resolved to '{provider_ref}' which is not valid "
                    f"for Pixverse {api_mode.value} mode. Asset may need to be re-uploaded."
                )

            resolved_urls.append(validated_ref)

        elif url_value and isinstance(url_value, str):
            # Direct URL provided - validate it
            validated_url = _resolve_reference(url_value, api_mode)
            if not validated_url:
                raise ProviderError(
                    f"composition_assets[{i}] URL '{url_value[:50]}...' is not valid "
                    f"for Pixverse {api_mode.value} mode."
                )
            resolved_urls.append(validated_url)

        else:
            # No asset ref or URL - check if entry has provider_params only
            # This is valid for VIDEO_EXTEND where only original_video_id is needed
            provider_params = item.get("provider_params") or {}
            if provider_params:
                logger.debug(
                    "pixverse_asset_item_provider_params_only",
                    index=i,
                    provider_params_keys=list(provider_params.keys()),
                )
                # Skip - doesn't need URL resolution, provider_params already extracted by map_parameters
                continue
            else:
                raise ProviderError(
                    f"composition_assets[{i}] has no resolvable asset or URL."
                )

    return resolved_urls
