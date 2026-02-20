"""
Pixverse composition asset resolution

Resolves composition_assets to Pixverse-ready URLs (most operations)
or Pixverse image_references with img_ids (fusion).

Split from pixverse.py for better separation of concerns.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, TYPE_CHECKING

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


def build_fusion_image_references(
    resolved_urls: list[str],
    composition_assets: list,
) -> List[Dict[str, Any]]:
    """
    Build Pixverse image_references from already-resolved URLs + composition metadata.

    Fusion uses the same URL resolution as i2v / i2i. This function just
    combines those URLs with role metadata (subject / background) from the
    original composition_assets.

    Simple mode: When none of the composition_assets have a ``role`` field,
    the function produces entries without ``type`` — just ``ref_name``,
    ``customer_img_url``, and ``customer_img_path``.  The SDK detects this
    and sends the simplified Pixverse payload (flat arrays, no
    fusion_*_list fields).

    Args:
        resolved_urls: URLs returned by resolve_composition_assets_for_pixverse
        composition_assets: Original composition_assets (for role / layer info)

    Returns:
        List of image_reference dicts ready for pixverse-py fusion
    """
    from pixsim7.backend.main.shared.composition import (
        map_composition_role_to_pixverse_type,
        normalize_composition_role,
    )
    from pixsim7.backend.main.shared.composition_assets import coerce_composition_assets
    from urllib.parse import urlparse, unquote

    assets = coerce_composition_assets(composition_assets)

    # Simple mode: none of the composition_assets carry a role field.
    # The downstream SDK/operations layer detects this via absence of "type".
    simple_mode = not any(
        (item.get("role") if isinstance(item, dict) else None)
        for item in assets
    )

    entries: List[Dict[str, Any]] = []

    for idx, (url, item) in enumerate(zip(resolved_urls, assets), start=1):
        if hasattr(item, "model_dump"):
            item = item.model_dump()

        layer = item.get("layer") if isinstance(item, dict) else None

        # Derive customer_img_path from URL (Pixverse convention)
        img_path = ""
        try:
            img_path = unquote(urlparse(url).path).lstrip("/")
        except Exception:
            pass

        entry: Dict[str, Any] = {
            "ref_name": str(idx),
            "customer_img_url": url,
            "customer_img_path": img_path,
            "layer": layer,
        }

        # Role-based mode: resolve Pixverse type from composition role
        if not simple_mode:
            role = item.get("role") if isinstance(item, dict) else None
            ref_name = item.get("ref_name") if isinstance(item, dict) else None
            if ref_name:
                entry["ref_name"] = ref_name

            provider_params = (item.get("provider_params") or {}) if isinstance(item, dict) else {}
            pixverse_override = (
                provider_params.get("pixverse_role") or provider_params.get("pixverse_type")
            ) if isinstance(provider_params, dict) else None

            pixverse_type = None
            if pixverse_override in {"subject", "background"}:
                pixverse_type = pixverse_override
            elif role:
                normalized = normalize_composition_role(role)
                pixverse_type = map_composition_role_to_pixverse_type(normalized, layer=layer)

            entry["type"] = pixverse_type

        entries.append(entry)

    # Role-based post-processing: ensure at least one background, fill gaps as subject
    if not simple_mode and entries:
        if not any(e["type"] == "background" for e in entries):
            def _layer_key(e: dict) -> int:
                return int(e["layer"]) if e.get("layer") is not None else 999
            min(entries, key=_layer_key)["type"] = "background"
        for e in entries:
            if not e.get("type"):
                e["type"] = "subject"

    logger.info(
        "fusion_image_references_built",
        count=len(entries),
        mode="simple" if simple_mode else "roles",
        types=[e.get("type") for e in entries] if not simple_mode else None,
    )

    return entries
