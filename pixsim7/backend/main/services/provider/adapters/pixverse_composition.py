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


async def _backfill_openapi_img_id(
    asset_id: int,
    *,
    db_session: AsyncSession,
) -> Optional[str]:
    """Re-upload an asset to Pixverse OpenAPI to recover its numeric img_id.

    Used when ``provider_uploads["pixverse"]`` is URL-only but the caller
    needs an OpenAPI id (Pixverse rejects URL input on ``/openapi/v2/video/
    img/generate`` with ErrCode=400017).  Delegates to AssetSyncService —
    invalidates the cached entry and lets the existing upload path run,
    which now persists the dict shape ``{"id", "url"}``.

    Returns the img_id string, or None if backfill couldn't produce one.
    """
    from pixsim7.backend.main.domain import Asset
    from pixsim7.backend.main.services.asset.sync import AssetSyncService
    from sqlalchemy import select

    asset = (
        await db_session.execute(select(Asset).where(Asset.id == asset_id))
    ).scalar_one_or_none()
    if not asset:
        return None

    # Invalidate the cached pixverse entry so get_asset_for_provider re-uploads.
    previous = dict(asset.provider_uploads or {})
    if "pixverse" in previous:
        new_map = {k: v for k, v in previous.items() if k != "pixverse"}
        asset.provider_uploads = new_map
        await db_session.commit()

    sync_service = AssetSyncService(db_session)
    try:
        await sync_service.get_asset_for_provider(
            asset_id=asset_id,
            target_provider_id="pixverse",
        )
    except Exception as e:
        # Restore whatever was there so a failed re-upload doesn't lose the URL.
        asset.provider_uploads = previous
        await db_session.commit()
        logger.warning(
            "pixverse_openapi_backfill_failed",
            asset_id=asset_id,
            error=str(e),
        )
        return None

    await db_session.refresh(asset)
    new_entry = (asset.provider_uploads or {}).get("pixverse")
    if isinstance(new_entry, dict):
        raw = new_entry.get("id")
        if raw is not None:
            new_id = str(raw)
            logger.info(
                "pixverse_openapi_backfill_complete",
                asset_id=asset_id,
                new_img_id=new_id,
                has_url=bool(new_entry.get("url")),
            )
            return new_id
    if isinstance(new_entry, str) and new_entry.isdigit():
        logger.info(
            "pixverse_openapi_backfill_complete",
            asset_id=asset_id,
            new_img_id=new_entry,
            has_url=False,
        )
        return new_entry

    logger.warning(
        "pixverse_openapi_backfill_no_id_after_reupload",
        asset_id=asset_id,
        shape=type(new_entry).__name__ if new_entry is not None else "none",
    )
    return None


async def resolve_pixverse_last_frame_url(
    asset_id: int,
    *,
    db_session: AsyncSession,
    account: Optional[ProviderAccount] = None,
    provider: Optional["PixverseProvider"] = None,
) -> Optional[str]:
    """Three-level lookup for a Pixverse video asset's last-frame URL.

    Pixverse labels this ``customer_video_last_frame_url`` server-side and
    ``Video.thumbnail`` in the SDK — it IS the last rendered frame, reusable
    as both an extend seed AND as an i2v/i2i input image without re-upload.

    Chain:
      1. ``asset.media_metadata['provider_thumbnail_url']`` — free DB read.
      2. latest successful ``ProviderSubmission.response['thumbnail_url']``
         — free DB read, stamped by the status poller on terminal.
      3. live ``client.get_video(provider_job_id).thumbnail`` — one Pixverse
         API call, self-heals by stamping both L1 and L2 on success so
         subsequent lookups are zero-cost.

    Returns the URL or None.  Never raises — caller just falls through.
    """
    from pixsim7.backend.main.domain import Asset, Generation
    from pixsim7.backend.main.domain.providers import ProviderSubmission as _ProviderSubmission, ProviderAccount as _ProviderAccount
    from sqlalchemy import select as _select
    from sqlalchemy.orm.attributes import flag_modified as _flag_modified

    asset = await db_session.get(Asset, asset_id)
    if asset is None:
        return None

    # Level 1: asset.media_metadata
    meta = asset.media_metadata if isinstance(asset.media_metadata, dict) else None
    if isinstance(meta, dict):
        ptu = meta.get("provider_thumbnail_url")
        if isinstance(ptu, str) and ptu.startswith(("http://", "https://")):
            return ptu

    # Levels 2 + 3 need the asset's latest successful submission.
    sub_gen = await db_session.execute(
        _select(Generation.id)
        .where(Generation.asset_id == asset_id)
        .order_by(Generation.id.desc()).limit(1)
    )
    sub_gen_id = sub_gen.scalar_one_or_none()
    if sub_gen_id is None:
        return None
    sub_q = await db_session.execute(
        _select(
            _ProviderSubmission.id,
            _ProviderSubmission.provider_job_id,
            _ProviderSubmission.response,
            _ProviderSubmission.account_id,
        )
        .where(_ProviderSubmission.generation_id == sub_gen_id)
        .where(_ProviderSubmission.status == "success")
        .order_by(_ProviderSubmission.id.desc()).limit(1)
    )
    latest_sub = sub_q.first()
    if latest_sub is None:
        return None

    # Level 2: submission.response
    resp = latest_sub.response
    if isinstance(resp, dict):
        thumb = resp.get("thumbnail_url")
        if isinstance(thumb, str) and thumb.startswith(("http://", "https://")):
            return thumb

    # Level 3: live fetch with self-heal.
    if provider is None or not latest_sub.provider_job_id:
        return None

    try:
        active_account = None
        if account is not None and account.id == latest_sub.account_id:
            active_account = account
        else:
            active_account = await db_session.get(_ProviderAccount, latest_sub.account_id)
        if active_account is None:
            return None

        live_client = provider._create_client(active_account)
        video = await live_client.get_video(video_id=str(latest_sub.provider_job_id))
        thumb = getattr(video, "thumbnail", None)
        # Reject placeholder URLs (e.g. .../default.jpg) — Pixverse returns
        # those for FILTERED videos.  Not a real last frame.
        from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
            is_pixverse_placeholder_url as _is_placeholder,
        )
        thumb_is_placeholder = isinstance(thumb, str) and _is_placeholder(thumb)
        thumb_valid = (
            isinstance(thumb, str)
            and thumb.startswith(("http://", "https://"))
            and not thumb_is_placeholder
        )
        if not thumb_valid:
            logger.info(
                "pixverse_last_frame_live_fetch_no_thumb",
                asset_id=asset_id,
                video_id=str(latest_sub.provider_job_id),
                video_status=getattr(video, "status", None),
                raw_thumb=repr(thumb)[:80],
                is_placeholder=thumb_is_placeholder,
                likely_cause=(
                    "filtered_placeholder" if thumb_is_placeholder
                    else "early_cdn_termination"
                    if isinstance(resp, dict) and resp.get("metadata", {}).get("video_early_cdn_terminal")
                    else "pixverse_never_wrote_last_frame"
                ),
            )
            return None

        # Self-heal L1 and L2 so the next call hits the free path.
        sub_obj = await db_session.get(_ProviderSubmission, latest_sub.id)
        if sub_obj is not None:
            new_response = dict(sub_obj.response or {})
            new_response["thumbnail_url"] = thumb
            sub_obj.response = new_response
            _flag_modified(sub_obj, "response")
        new_meta = dict(asset.media_metadata or {})
        if not new_meta.get("provider_thumbnail_url"):
            new_meta["provider_thumbnail_url"] = thumb
            asset.media_metadata = new_meta
            _flag_modified(asset, "media_metadata")
        await db_session.commit()

        logger.info(
            "pixverse_last_frame_live_fetch_ok",
            asset_id=asset_id,
            video_id=str(latest_sub.provider_job_id),
            last_frame_url=thumb[:80],
        )
        return thumb
    except Exception as e:
        logger.warning(
            "pixverse_last_frame_live_fetch_failed",
            asset_id=asset_id,
            video_id=str(latest_sub.provider_job_id) if latest_sub else None,
            error=str(e),
        )
        return None


async def try_reuse_pixverse_cdn_url_for_upload(
    asset: Any,
    *,
    db_session: AsyncSession,
) -> Optional[str]:
    """Return a Pixverse CDN URL that can replace uploading ``asset``, or None.

    Covers the two reuse cases:
      a) ``asset`` IS a Pixverse video — use its own last-frame URL.
      b) ``asset`` is an IMAGE extracted from a Pixverse video via
         PAUSED_FRAME lineage — walk to parent, use parent's last-frame URL.

    Why this is the right choke point: Pixverse's ``customer_video_last_frame_url``
    is already hosted + moderation-approved from when the source video was
    created.  Uploading the mp4 (or a locally-extracted frame) re-triggers
    Pixverse's image moderation, which is stricter than its video moderation
    and commonly rejects NSFW frames that the source video passed.

    Used by ``AssetSyncService._upload_to_provider`` so every path that routes
    through ``get_asset_for_provider`` benefits transparently — no per-caller
    pre-check needed (composition resolver, extract-frame endpoint, etc.).
    """
    from pixsim7.backend.main.domain import Asset as _Asset
    from pixsim7.backend.main.domain.assets.lineage import AssetLineage as _AssetLineage
    from pixsim7.backend.main.domain.enums import MediaType as _MediaType
    from sqlalchemy import select as _select

    video_source_id: Optional[int] = None
    skip_reason: Optional[str] = None
    if asset.media_type == _MediaType.VIDEO and getattr(asset, "provider_id", None) == "pixverse":
        video_source_id = asset.id
    elif asset.media_type == _MediaType.IMAGE:
        lineage_row = await db_session.execute(
            _select(_AssetLineage.parent_asset_id)
            .where(_AssetLineage.child_asset_id == asset.id)
            .where(_AssetLineage.relation_type == "PAUSED_FRAME")
            .limit(1)
        )
        parent_id = lineage_row.scalar_one_or_none()
        if not parent_id:
            skip_reason = "image_no_paused_frame_lineage"
        else:
            parent = await db_session.get(_Asset, parent_id)
            if parent is None:
                skip_reason = f"image_lineage_parent_{parent_id}_not_found"
            elif parent.provider_id != "pixverse":
                skip_reason = f"image_lineage_parent_provider_{parent.provider_id}"
            elif parent.media_type != _MediaType.VIDEO:
                skip_reason = f"image_lineage_parent_media_type_{parent.media_type}"
            else:
                video_source_id = parent_id
    else:
        skip_reason = f"unhandled_media_type_{asset.media_type}_provider_{getattr(asset, 'provider_id', None)}"

    if video_source_id is None:
        logger.info(
            "pixverse_cdn_reuse_skipped",
            asset_id=asset.id,
            media_type=str(asset.media_type),
            provider_id=getattr(asset, "provider_id", None),
            reason=skip_reason,
        )
        return None

    # Import lazily to avoid cycle (PixverseProvider imports composition).
    from pixsim7.backend.main.services.provider.adapters.pixverse import PixverseProvider
    url = await resolve_pixverse_last_frame_url(
        video_source_id,
        db_session=db_session,
        provider=PixverseProvider(),
    )
    if url is None:
        logger.info(
            "pixverse_cdn_reuse_no_url",
            asset_id=asset.id,
            video_source_id=video_source_id,
            via_lineage=(video_source_id != asset.id),
        )
    return url


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
            # Resolve via AssetSyncService (uploads if needed).  Pixverse-reuse
            # for video-as-image-input (synthetic extend, PAUSED_FRAME lineage)
            # is handled inside ``AssetSyncService._upload_to_provider`` — it
            # short-circuits the upload and returns the video's CDN URL, which
            # gets stamped as ``provider_uploads["pixverse"]`` for free reads
            # on subsequent submits.
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

            # OpenAPI backfill: Pixverse /openapi/v2/video/img/generate rejects
            # URL input (ErrCode=400017).  When provider_uploads is URL-only
            # (stale entries from before we stored both id and url), re-upload
            # via AssetSyncService to recover the numeric img_id.
            if (
                validated_ref
                and api_mode == PixverseApiMode.OPENAPI
                and not validated_ref.startswith("img_id:")
                and not validated_ref.isdigit()
            ):
                backfilled_id = await _backfill_openapi_img_id(
                    asset_id,
                    db_session=db_session,
                )
                if backfilled_id:
                    validated_ref = f"img_id:{backfilled_id}"
                    logger.info(
                        "pixverse_openapi_backfilled_ref",
                        asset_id=asset_id,
                        new_ref=validated_ref,
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
