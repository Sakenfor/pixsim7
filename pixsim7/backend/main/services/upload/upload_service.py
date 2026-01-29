"""
UploadService - centralize provider media uploads

Responsibilities:
- Select appropriate provider account for uploads
- For Pixverse: prefer OpenAPI (api_key/api_key_paid) when available; otherwise use Web API path
- Perform basic acceptance checks (MIME/sanity) and surface clear errors
"""
from __future__ import annotations
from typing import Optional
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from pixsim7.backend.main.domain import AccountStatus
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.domain.providers.registry import registry
from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.account.account_service import AccountService
from pixsim7.backend.main.shared.errors import InvalidOperationError
from pixsim7.backend.main.shared.image_utils import get_image_info, downscale_image_max_dim
from pixsim7.backend.main.shared.video_utils import validate_video_for_provider, get_provider_video_constraints
from pixsim_logging import get_logger

logger = get_logger()


@dataclass
class UploadResult:
    provider_id: str
    media_type: MediaType
    external_url: Optional[str] = None
    provider_asset_id: Optional[str] = None
    note: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    mime_type: Optional[str] = None
    file_size_bytes: Optional[int] = None


class UploadService:
    def __init__(self, db: AsyncSession, account_service: AccountService):
        self.db = db
        self.accounts = account_service

    async def upload(
        self,
        *,
        provider_id: str,
        media_type: MediaType,
        tmp_path: str,
    ) -> UploadResult:
        """
        Upload file to specified provider. No cross-provider auto-selection.

        Pixverse-specific behavior: prefer OpenAPI if account has an 'openapi'
        key in api_keys; else use web-api.
        """
        # Prepare file for provider (may downscale/compress)
        prepared_path, meta, prep_note = await self._prepare_file_for_provider(provider_id, media_type, tmp_path)

        # Select account for this provider (shared accounts)
        # Pixverse: prefer any account with an OpenAPI key (api_keys.kind=='openapi')
        account: ProviderAccount
        if provider_id == "pixverse":
            # Coarse filter: any account with non-null api_keys JSON;
            # finer filtering by key kind is done in Python below. For uploads,
            # we intentionally do not gate on AccountStatus/credits so that
            # exhausted accounts with valid OpenAPI keys can still be used
            # for media uploads.
            result = await self.db.execute(
                select(ProviderAccount).where(
                    ProviderAccount.provider_id == "pixverse",
                    ProviderAccount.api_keys.is_not(None)
                )
            )
            candidates = list(result.scalars().all())
            preferred = None
            for acc in candidates:
                api_keys = getattr(acc, "api_keys", None) or []
                if any(
                    isinstance(entry, dict)
                    and entry.get("kind") == "openapi"
                    and entry.get("value")
                    for entry in api_keys
                ):
                    preferred = acc
                    break

            if preferred is not None:
                account = preferred
                selection_source = "preferred_openapi"
            else:
                account = await self.accounts.select_account(provider_id)
                selection_source = "account_service"

            # Debug which Pixverse account is used (avoid logging secrets)
            logger.info(
                "pixverse_upload_account_selected",
                account_id=account.id,
                email=account.email,
                selection_source=selection_source,
                has_api_key=bool(account.api_key),
                has_openapi_key=any(
                    isinstance(entry, dict)
                    and entry.get("kind") == "openapi"
                    and entry.get("value")
                    for entry in (getattr(account, "api_keys", None) or [])
                ),
            )
        else:
            account = await self.accounts.select_account(provider_id)

        # Delegate to provider adapter
        provider = registry.get(provider_id)
        uploaded = await provider.upload_asset(account, prepared_path)  # type: ignore

        # Heuristic: URL vs ID
        if isinstance(uploaded, str) and (uploaded.startswith("http://") or uploaded.startswith("https://")):
            # Extract UUID from URL for provider_asset_id (helps with dedup during enrichment)
            extracted_id = None
            if provider_id == "pixverse":
                from pixsim7.backend.main.services.provider.adapters.pixverse_ids import extract_uuid_from_url
                extracted_id = extract_uuid_from_url(uploaded)

            return UploadResult(
                provider_id=provider_id,
                media_type=media_type,
                external_url=uploaded,
                provider_asset_id=extracted_id,  # UUID from URL for dedup matching
                note=(prep_note or None) or (
                    "Uploaded via OpenAPI"
                    if provider_id == "pixverse"
                    and any(
                        isinstance(entry, dict)
                        and entry.get("kind") == "openapi"
                        and entry.get("value")
                        for entry in (getattr(account, "api_keys", None) or [])
                    )
                    else None
                ),
                width=meta.get('width'),
                height=meta.get('height'),
                mime_type=meta.get('mime_type'),
                file_size_bytes=meta.get('file_size_bytes'),
            )

        return UploadResult(
            provider_id=provider_id,
            media_type=media_type,
            provider_asset_id=str(uploaded),
            note=(prep_note or None) or ("Provider returned an ID; use provider API to resolve URL" if provider_id == "pixverse" else None),
            width=meta.get('width'),
            height=meta.get('height'),
            mime_type=meta.get('mime_type'),
            file_size_bytes=meta.get('file_size_bytes'),
        )

    async def _prepare_file_for_provider(self, provider_id: str, media_type: MediaType, tmp_path: str):
        """Validate and prepare temp file; may return a new path and metadata.

        Returns (prepared_path, meta, note)
        meta: {width,height,mime_type,file_size_bytes}
        note: optional string (e.g., 'Downscaled to <=4096')
        """
        note = None
        width = height = None
        mime = None
        size = None

        if provider_id == "pixverse" and media_type == MediaType.IMAGE:
            MAX_DIM = 4096
            MAX_BYTES = 20 * 1024 * 1024
            w, h, m, s = get_image_info(tmp_path)
            width, height, mime, size = w, h, m, s

            prepared = tmp_path
            # Dimension check
            if width and height and max(width, height) > MAX_DIM:
                prepared = downscale_image_max_dim(tmp_path, MAX_DIM)
                note = (note + '; ' if note else '') + f"Downscaled to <= {MAX_DIM}"
                w, h, m, s = get_image_info(prepared)
                width, height, mime, size = w, h, m, s

            # Size check: try light recompress for JPEG/WEBP
            if size and size > MAX_BYTES:
                # attempt recompress at lower quality when possible
                try:
                    from PIL import Image
                    with Image.open(prepared) as im:
                        fmt = (im.format or 'PNG').upper()
                        if fmt in ('JPEG', 'WEBP'):
                            alt = downscale_image_max_dim(prepared, max(width or MAX_DIM, height or MAX_DIM), quality=85)
                            w2, h2, m2, s2 = get_image_info(alt)
                            if s2 and s2 <= MAX_BYTES:
                                prepared = alt
                                width, height, mime, size = w2, h2, m2, s2
                                note = (note + '; ' if note else '') + "Recompressed"
                        # If still too big or non-recompressible, raise
                except Exception:
                    pass
                # Final guard
                if size and size > MAX_BYTES:
                    raise InvalidOperationError("Pixverse upload rejected: image exceeds 20MB after resizing. Try JPEG/WebP or smaller dimensions.")

            return prepared, {
                'width': width,
                'height': height,
                'mime_type': mime,
                'file_size_bytes': size,
            }, note

        if provider_id == "pixverse" and media_type == MediaType.VIDEO:
            # Validate video using ffprobe-based checks
            constraints = get_provider_video_constraints(provider_id)

            if constraints:
                # Perform validation with provider-specific constraints
                metadata, error = validate_video_for_provider(
                    tmp_path,
                    provider_id,
                    **constraints
                )

                if error:
                    # Video doesn't meet provider requirements
                    raise InvalidOperationError(f"Video validation failed: {error}")

                # Extract metadata for return
                width = metadata.get('width')
                height = metadata.get('height')
                size = metadata.get('size_bytes')

                # Add note about validation
                duration = metadata.get('duration', 0)
                codec = metadata.get('codec', 'unknown')
                note = f"Validated: {width}x{height}, {duration:.1f}s, {codec} codec"

                logger.info(
                    "video_validated",
                    provider_id=provider_id,
                    width=width,
                    height=height,
                    duration=duration,
                    codec=codec,
                    size_mb=round(size / (1024 * 1024), 2) if size else None,
                )
            else:
                # No constraints defined, fall back to basic size check
                try:
                    import os
                    size = os.path.getsize(tmp_path)
                    width = height = None
                except Exception:
                    size = width = height = None

            return tmp_path, {
                'width': width,
                'height': height,
                'mime_type': 'video/mp4',  # Assume mp4 for now
                'file_size_bytes': size,
            }, note

        # Default: no special prep
        return tmp_path, {
            'width': width,
            'height': height,
            'mime_type': mime,
            'file_size_bytes': size,
        }, note
