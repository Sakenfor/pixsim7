"""
Pixverse metadata fetching mixin

Handles asset metadata resolution (images and videos) via direct ID lookup
and paginated list search fallback.
Split from pixverse.py for better separation of concerns.
"""
from typing import Dict, Any, Optional

from pixsim7.backend.main.domain import ProviderAccount
from pixsim7.backend.main.domain.provider_auth import PixverseSessionData
from pixsim7.backend.main.services.provider.adapters.pixverse_ids import (
    looks_like_pixverse_uuid,
    uuid_in_url,
    extract_uuid_from_url,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import (
    normalize_url as _normalize_url,
    extract_media_url as _extract_media_url,
)

from pixsim_logging import get_logger

logger = get_logger()


class PixverseMetadataMixin:
    """Mixin for Pixverse asset metadata fetching and URL resolution."""

    async def _fetch_asset_metadata(
        self,
        account: ProviderAccount,
        provider_asset_id: str,
        media_type: str,  # "image" or "video"
        *,
        asset_id: Optional[int] = None,
        remote_url: Optional[str] = None,
        media_metadata: Optional[Dict[str, Any]] = None,
        max_pages: int = 20,
        limit: int = 100,
        log_prefix: str = "pixverse",
    ) -> Optional[Dict[str, Any]]:
        """
        Generic asset metadata fetcher for both images and videos.

        Uses direct ID lookup when numeric, falls back to paginated list search
        with multiple match modes (id, url, uuid_in_url).
        """
        # Configuration based on media type
        is_video = media_type == "video"
        id_fields = ("video_id", "VideoId", "id") if is_video else ("image_id",)
        url_fields = ("video_url", "media_url", "url") if is_video else ("image_url", "media_url", "customer_img_url")
        type_label = "video" if is_video else "image"

        context: Dict[str, Any] = {
            "provider_asset_id": provider_asset_id,
            "account_id": account.id,
            "account_email": account.email,
            "media_type": media_type,
        }
        if asset_id is not None:
            context["asset_id"] = asset_id

        def log_info(suffix: str, **kwargs: Any) -> None:
            logger.info(f"{log_prefix}_{suffix}", **{**context, **kwargs})

        def log_warning(suffix: str, **kwargs: Any) -> None:
            logger.warning(f"{log_prefix}_{suffix}", **{**context, **kwargs})

        async def _operation(session: PixverseSessionData) -> Optional[Dict[str, Any]]:
            client = self._create_client_from_session(session, account)
            provider_asset_id_str = str(provider_asset_id or "")
            lookup_id = provider_asset_id_str if provider_asset_id_str.isdigit() else None

            # Try to extract numeric ID from metadata if not already numeric
            if not lookup_id and media_metadata:
                for key in id_fields:
                    metadata_id = media_metadata.get(key)
                    if metadata_id is not None and str(metadata_id).isdigit():
                        lookup_id = str(metadata_id)
                        log_info(f"using_metadata_{type_label}_id", **{f"{type_label}_id": lookup_id, "source_key": key})
                        break

            if not lookup_id:
                log_info("non_numeric_provider_id")

            # Direct lookup by numeric ID
            provider_metadata = None
            if lookup_id:
                if is_video:
                    result = await client.get_video(lookup_id)
                    # Convert Pydantic model to dict if needed
                    if result is not None:
                        if hasattr(result, 'model_dump'):
                            provider_metadata = result.model_dump()
                        elif hasattr(result, 'dict'):
                            provider_metadata = result.dict()
                        else:
                            provider_metadata = result
                else:
                    provider_metadata = await client.get_image(lookup_id)

            # Return early if we got complete metadata
            if provider_metadata and provider_metadata.get("prompt"):
                return provider_metadata

            # Prepare for list search fallback
            search_reason = "no_metadata" if not provider_metadata else "missing_prompt"
            candidate_urls: list[str] = []
            url_sources = [remote_url]
            for field in url_fields:
                url_sources.append((media_metadata or {}).get(field))
            if provider_metadata:
                url_sources.append(provider_metadata.get(f"{type_label}_url"))

            for url in url_sources:
                normalized = _normalize_url(url, strip_query=True) or url
                if normalized and normalized not in candidate_urls:
                    candidate_urls.append(normalized)

            target_uuid = provider_asset_id_str if looks_like_pixverse_uuid(provider_asset_id_str) else None
            log_info(
                f"{type_label}_minimal_data",
                **{f"searching_{type_label}_list": True},
                search_reason=search_reason,
                candidate_urls=len(candidate_urls),
                uuid_match=bool(target_uuid),
                **{f"lookup_{type_label}_id": lookup_id},
            )

            if not lookup_id and not candidate_urls and not target_uuid:
                return provider_metadata

            # Paginated list search
            found = False
            scanned = 0
            offset = 0
            match_mode = None
            matched_id = None

            for page in range(max_pages):
                items = await (client.list_videos(limit=limit, offset=offset) if is_video
                              else client.list_images(limit=limit, offset=offset))
                if page == 0:
                    log_info(f"{type_label}_list_page", page=page, offset=offset, returned=len(items))
                if not items:
                    break

                scanned += len(items)
                for item in items:
                    # Extract item ID (try multiple field names for videos)
                    if is_video:
                        item_id = item.get("video_id") or item.get("VideoId") or item.get("id")
                    else:
                        item_id = item.get("image_id")

                    # Match by ID
                    if lookup_id and str(item_id) == str(lookup_id):
                        provider_metadata = item
                        found = True
                        match_mode = f"{type_label}_id"
                        matched_id = item_id
                        break

                    # Match by URL
                    item_url = item.get(f"{type_label}_url") or item.get("url")
                    normalized_url = _normalize_url(item_url, strip_query=True) or item_url
                    if normalized_url and normalized_url in candidate_urls:
                        provider_metadata = item
                        found = True
                        match_mode = f"{type_label}_url"
                        matched_id = item_id
                        break

                    # Match by UUID in URL
                    if target_uuid and uuid_in_url(target_uuid, item_url):
                        provider_metadata = item
                        found = True
                        match_mode = "uuid_in_url"
                        matched_id = item_id
                        break

                if found:
                    if target_uuid and match_mode in {f"{type_label}_url", "uuid_in_url"}:
                        provider_metadata = dict(provider_metadata or {})
                        provider_metadata.setdefault("pixverse_asset_uuid", target_uuid)
                    log_info(
                        f"found_in_{type_label}_list",
                        page=page,
                        offset=offset,
                        match_mode=match_mode,
                        **{f"matched_{type_label}_id": matched_id},
                    )
                    # Cache the numeric ID for future direct lookups
                    # This avoids pagination on subsequent requests
                    if matched_id and asset_id is not None and match_mode != f"{type_label}_id":
                        provider_metadata = dict(provider_metadata or {})
                        provider_metadata["_resolved_numeric_id"] = str(matched_id)
                    break

                offset += limit

            if not found:
                log_warning(
                    f"not_in_{type_label}_list",
                    pages_searched=page + 1,
                    scanned=scanned,
                    limit=limit,
                    max_pages=max_pages,
                    **{f"lookup_{type_label}_id": lookup_id},
                    candidate_urls=len(candidate_urls),
                    uuid_match=bool(target_uuid),
                )

            return provider_metadata

        return await self.session_manager.run_with_session(
            account=account,
            op_name=f"fetch_{media_type}_metadata",
            operation=_operation,
            retry_on_session_error=True,
        )

    async def fetch_image_metadata(
        self,
        account: ProviderAccount,
        provider_asset_id: str,
        *,
        asset_id: Optional[int] = None,
        remote_url: Optional[str] = None,
        media_metadata: Optional[Dict[str, Any]] = None,
        max_pages: int = 20,
        limit: int = 100,
        log_prefix: str = "pixverse_image",
    ) -> Optional[Dict[str, Any]]:
        """Resolve Pixverse image metadata using ID lookup with list fallback."""
        return await self._fetch_asset_metadata(
            account=account,
            provider_asset_id=provider_asset_id,
            media_type="image",
            asset_id=asset_id,
            remote_url=remote_url,
            media_metadata=media_metadata,
            max_pages=max_pages,
            limit=limit,
            log_prefix=log_prefix,
        )

    async def fetch_video_metadata(
        self,
        account: ProviderAccount,
        provider_asset_id: str,
        *,
        asset_id: Optional[int] = None,
        remote_url: Optional[str] = None,
        media_metadata: Optional[Dict[str, Any]] = None,
        max_pages: int = 20,
        limit: int = 100,
        log_prefix: str = "pixverse_video",
    ) -> Optional[Dict[str, Any]]:
        """Resolve Pixverse video metadata using ID lookup with list fallback."""
        return await self._fetch_asset_metadata(
            account=account,
            provider_asset_id=provider_asset_id,
            media_type="video",
            asset_id=asset_id,
            remote_url=remote_url,
            media_metadata=media_metadata,
            max_pages=max_pages,
            limit=limit,
            log_prefix=log_prefix,
        )

    async def _resolve_webapi_url_from_id(
        self,
        account: ProviderAccount,
        value: Any,
        *,
        media_type: str,
        remote_url: Optional[str] = None,
        asset_id: Optional[int] = None,
    ) -> Optional[str]:
        """
        Resolve a Pixverse reference to a WebAPI URL.

        Uses Pixverse metadata lookups to convert IDs/UUIDs/URLs to media URLs
        when the WebAPI requires https:// URLs.
        """
        logger.info(
            "pixverse_resolve_webapi_url_start",
            value=str(value)[:60] if value else None,
            media_type=media_type,
            asset_id=asset_id,
            account_id=account.id if account else None,
        )

        if not value:
            return None

        candidate = value
        if isinstance(candidate, dict):
            candidate = (
                candidate.get("image_url")
                or candidate.get("video_url")
                or candidate.get("media_url")
                or candidate.get("url")
                or candidate.get("id")
                or candidate.get("image_id")
                or candidate.get("video_id")
            )

        if not candidate:
            logger.info("pixverse_resolve_webapi_url_no_candidate")
            return None

        raw = str(candidate)
        if raw.startswith("img_id:"):
            raw = raw.split(":", 1)[1]

        # Accept direct URLs by matching URL/UUID in Pixverse metadata.
        if raw.startswith(("http://", "https://")):
            remote_url = remote_url or raw
            extracted_uuid = extract_uuid_from_url(raw)
            raw = extracted_uuid or raw

        is_digit = raw.isdigit()
        is_uuid = looks_like_pixverse_uuid(raw)

        if not is_digit and not is_uuid and not remote_url:
            logger.info(
                "pixverse_resolve_webapi_url_skip",
                raw=raw[:60],
                is_digit=is_digit,
                is_uuid=is_uuid,
                has_remote_url=bool(remote_url),
            )
            return None

        logger.info(
            "pixverse_resolve_webapi_url_fetching",
            raw=raw[:60],
            media_type=media_type,
            is_digit=is_digit,
            is_uuid=is_uuid,
        )

        try:
            if media_type == "video":
                metadata = await self.fetch_video_metadata(
                    account=account,
                    provider_asset_id=raw,
                    asset_id=asset_id,
                    remote_url=remote_url,
                    log_prefix="pixverse_webapi_url",
                )
            else:
                metadata = await self.fetch_image_metadata(
                    account=account,
                    provider_asset_id=raw,
                    asset_id=asset_id,
                    remote_url=remote_url,
                    log_prefix="pixverse_webapi_url",
                )
        except Exception as exc:
            logger.warning(
                "pixverse_webapi_url_lookup_failed",
                provider_asset_id=raw,
                media_type=media_type,
                asset_id=asset_id,
                error=str(exc),
            )
            return None

        if not metadata:
            logger.info(
                "pixverse_resolve_webapi_url_no_metadata",
                raw=raw[:60],
                media_type=media_type,
            )
            return None

        result_url = _extract_media_url(metadata, media_type)
        logger.info(
            "pixverse_resolve_webapi_url_result",
            raw=raw[:60],
            media_type=media_type,
            has_metadata=bool(metadata),
            metadata_keys=list(metadata.keys()) if metadata else [],
            result_url=result_url[:80] if result_url else None,
        )
        return result_url
