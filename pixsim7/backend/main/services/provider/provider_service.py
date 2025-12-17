"""
ProviderService - orchestrate provider API calls

Clean service for provider interaction and submission tracking.
"""
from __future__ import annotations

from typing import Dict, Any, Optional, Tuple
from datetime import datetime
import os
import re
import tempfile
from urllib.parse import urlparse, unquote

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain import (
    Generation,
    ProviderSubmission,
    ProviderAccount,
    ProviderStatus,
    OperationType,
    Asset,
)
from pixsim7.backend.main.domain.asset_analysis import AssetAnalysis
from pixsim7.backend.main.services.provider.registry import registry
from pixsim7.backend.main.services.provider.base import (
    GenerationResult,
    ProviderStatusResult,
    ProviderError,
)
from pixsim7.backend.main.shared.errors import ProviderNotFoundError, ResourceNotFoundError
from pixsim7.backend.main.infrastructure.events.bus import event_bus, PROVIDER_SUBMITTED, PROVIDER_COMPLETED, PROVIDER_FAILED
from pixsim7.backend.main.shared.operation_mapping import get_image_operations

logger = configure_logging("provider_service")


class ProviderService:
    """
    Provider orchestration service

    Handles:
    - Executing provider operations
    - Recording provider submissions
    - Status polling
    - Error handling and retry logic
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== PROVIDER EXECUTION =====

    async def execute_generation(
        self,
        generation: Generation,
        account: ProviderAccount,
        params: Dict[str, Any]
    ) -> ProviderSubmission:
        """
        Execute generation via provider

        Args:
            generation: Generation to execute
            account: Provider account to use
            params: Generation parameters (canonical_params)

        Returns:
            ProviderSubmission record

        Raises:
            ProviderNotFoundError: Provider not registered
            ProviderError: Provider API error
        """
        # Get provider from registry
        provider = registry.get(generation.provider_id)

        # Map parameters to provider format (this is what we persist as ProviderSubmission.payload).
        mapped_params = provider.map_parameters(
            operation_type=generation.operation_type,
            params=params
        )

        # Provider execution params may include ephemeral local file paths for multipart uploads.
        execute_params: Dict[str, Any] = mapped_params

        # Record submission start
        submission = ProviderSubmission(
            generation_id=generation.id,
            account_id=account.id,
            provider_id=generation.provider_id,
            payload=mapped_params,
            response={},
            retry_attempt=generation.retry_count,
            submitted_at=datetime.utcnow(),
            status="pending",
        )
        self.db.add(submission)
        await self.db.commit()
        await self.db.refresh(submission)

        try:
            # Some providers require uploading local files. For these, we keep the persisted
            # payload small/portable (URLs or asset references) but resolve files at runtime.
            if generation.provider_id == "remaker":
                execute_params = await self._prepare_remaker_execute_params(
                    generation=generation,
                    mapped_params=mapped_params,
                )

            # Execute provider operation
            result: GenerationResult = await provider.execute(
                operation_type=generation.operation_type,
                account=account,
                params=execute_params
            )

            # Update submission with response
            # For image operations, use image-specific field names
            # to ensure correct media type classification in asset creation.
            # The set of image operations is owned by OPERATION_REGISTRY.
            if generation.operation_type in get_image_operations():
                submission.response = {
                    "provider_job_id": result.provider_job_id,
                    "provider_image_id": result.provider_video_id,  # Re-key for images
                    "status": result.status.value,
                    "image_url": result.video_url,  # Re-key for images
                    "thumbnail_url": result.thumbnail_url,
                    "metadata": result.metadata or {},
                    "media_type": "image",  # Explicit media type
                }
            else:
                # Video operations use standard field names
                submission.response = {
                    "provider_job_id": result.provider_job_id,
                    "provider_video_id": result.provider_video_id,
                    "status": result.status.value,
                    "video_url": result.video_url,
                    "thumbnail_url": result.thumbnail_url,
                    "metadata": result.metadata or {},
                }
            # Validate provider_job_id before saving
            if not result.provider_job_id:
                logger.error(
                    "provider:submit",
                    msg="missing_provider_job_id",
                    generation_id=generation.id,
                    operation_type=generation.operation_type.value,
                    result=str(result),
                )
                raise ProviderError(
                    f"Provider did not return a job ID for {generation.operation_type.value}"
                )

            submission.provider_job_id = result.provider_job_id
            submission.responded_at = datetime.utcnow()
            submission.status = "success"

            # Calculate duration
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)

            # Emit success event
            await event_bus.publish(PROVIDER_SUBMITTED, {
                "job_id": generation.id,
                "submission_id": submission.id,
                "provider_job_id": result.provider_job_id,
            })

            return submission

        except ProviderError as e:
            # Update submission with error
            submission.response = {
                "error": str(e),
                "error_type": e.__class__.__name__,
            }
            submission.responded_at = datetime.utcnow()
            submission.status = "error"
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)

            # Emit failure event
            await event_bus.publish(PROVIDER_FAILED, {
                "job_id": generation.id,
                "submission_id": submission.id,
                "error": str(e),
            })

            # Re-raise for caller to handle
            raise

    _ASSET_REF_RE = re.compile(r"^(?:asset[_:])(?P<id>\\d+)$")

    async def _prepare_remaker_execute_params(
        self,
        *,
        generation: Generation,
        mapped_params: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Resolve Remaker inpaint inputs to local filesystem paths.

        Remaker's create-job endpoint is multipart and requires two files:
        - original image (jpeg)
        - mask image (png)

        The mapped payload stores sources as strings (URL/path/asset ref).
        This method resolves those sources to local paths, downloading remote
        URLs to temp files when needed, and returns an execute-only params dict.
        """
        original_source = mapped_params.get("original_image_source")
        mask_source = mapped_params.get("mask_source")
        file_extension = mapped_params.get("file_extension")

        original_path, original_temps = await self._resolve_source_to_local_file(
            source=original_source,
            user_id=generation.user_id,
            default_suffix=".jpg",
        )
        mask_path, mask_temps = await self._resolve_source_to_local_file(
            source=mask_source,
            user_id=generation.user_id,
            default_suffix=".png",
        )

        temps = [*original_temps, *mask_temps]

        resolved: Dict[str, Any] = dict(mapped_params)
        resolved["original_image_path"] = original_path
        resolved["mask_path"] = mask_path
        resolved["_temp_paths"] = temps

        if file_extension and isinstance(file_extension, str) and not file_extension.startswith("."):
            resolved["file_extension"] = f".{file_extension}"

        return resolved

    async def _resolve_source_to_local_file(
        self,
        *,
        source: Any,
        user_id: int,
        default_suffix: str,
    ) -> Tuple[str, list[str]]:
        """
        Resolve a source reference to a local file path.

        Supported source formats:
        - local path (existing file)
        - file:// URL
        - http(s) URL (download to temp)
        - "asset_123" / "asset:123" (lookup Asset; prefer local_path; else download remote_url)
        - {"asset_id": 123} or {"id": 123}
        - int (asset id)
        """
        if source is None:
            raise ProviderError("Missing required file source for provider upload")

        # dict form
        if isinstance(source, dict):
            if "asset_id" in source:
                source = source["asset_id"]
            elif "id" in source:
                source = source["id"]

        # numeric asset id
        if isinstance(source, int):
            return await self._resolve_asset_id_to_local_file(
                asset_id=source,
                user_id=user_id,
                default_suffix=default_suffix,
            )

        if not isinstance(source, str):
            raise ProviderError(f"Unsupported source type for provider upload: {type(source)}")

        src = source.strip()
        if not src:
            raise ProviderError("Empty source for provider upload")

        # asset ref string
        m = self._ASSET_REF_RE.match(src)
        if m:
            return await self._resolve_asset_id_to_local_file(
                asset_id=int(m.group("id")),
                user_id=user_id,
                default_suffix=default_suffix,
            )

        parsed = urlparse(src)
        if parsed.scheme in ("http", "https"):
            return await self._download_url_to_temp(src, default_suffix=default_suffix)

        if parsed.scheme == "file":
            # file:///C:/path or file://hostname/path (we only support local)
            path = unquote(parsed.path or "")
            if os.name == "nt" and path.startswith("/") and len(path) > 3 and path[2] == ":":
                path = path.lstrip("/")
            return self._validate_existing_path(path)

        # plain filesystem path
        if os.path.exists(src):
            return self._validate_existing_path(src)

        # If it's not a known scheme/path, assume it's a remote URL missing scheme
        raise ProviderError(f"Unsupported file source '{src}' (not a path, URL, or asset reference)")

    async def _resolve_asset_id_to_local_file(
        self,
        *,
        asset_id: int,
        user_id: int,
        default_suffix: str,
    ) -> Tuple[str, list[str]]:
        asset = await self.db.get(Asset, asset_id)
        if not asset or getattr(asset, "user_id", None) != user_id:
            raise ProviderError(f"Asset {asset_id} not found for user")

        local_path = getattr(asset, "local_path", None)
        if local_path and os.path.exists(local_path):
            return (local_path, [])

        remote_url = getattr(asset, "remote_url", None)
        if remote_url:
            return await self._download_url_to_temp(remote_url, default_suffix=default_suffix)

        raise ProviderError(f"Asset {asset_id} has no local_path and no remote_url")

    def _validate_existing_path(self, path: str) -> Tuple[str, list[str]]:
        if not path or not os.path.exists(path):
            raise ProviderError(f"Local file not found: {path}")
        return (path, [])

    async def _download_url_to_temp(self, url: str, *, default_suffix: str) -> Tuple[str, list[str]]:
        suffix = default_suffix
        try:
            parsed = urlparse(url)
            _, ext = os.path.splitext(parsed.path or "")
            if ext:
                suffix = ext
        except Exception:
            pass

        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp_path = tmp.name
        tmp.close()

        try:
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                r = await client.get(url)
                r.raise_for_status()
                with open(tmp_path, "wb") as f:
                    f.write(r.content)
            return (tmp_path, [tmp_path])
        except Exception as e:
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass
            raise ProviderError(f"Failed to download url for provider upload: {url}") from e

    async def execute_analysis(
        self,
        analysis: AssetAnalysis,
        account: ProviderAccount,
    ) -> ProviderSubmission:
        """
        Execute asset analysis via provider

        Args:
            analysis: Analysis to execute
            account: Provider account to use

        Returns:
            ProviderSubmission record

        Raises:
            ProviderNotFoundError: Provider not registered
            ProviderError: Provider API error
        """
        # Get provider from registry
        provider = registry.get(analysis.provider_id)

        # Build analysis params
        analysis_params = {
            "analyzer_type": analysis.analyzer_type.value,
            "prompt": analysis.prompt,
            **(analysis.params or {}),
        }

        # Record submission start
        submission = ProviderSubmission(
            analysis_id=analysis.id,
            generation_id=None,  # Analysis, not generation
            account_id=account.id,
            provider_id=analysis.provider_id,
            payload=analysis_params,
            response={},
            retry_attempt=analysis.retry_count,
            submitted_at=datetime.utcnow(),
            status="pending",
        )
        self.db.add(submission)
        await self.db.commit()
        await self.db.refresh(submission)

        try:
            # Execute analysis via provider
            # For now, we use a generic analyze method if available,
            # or fall back to execute with a special operation type
            if hasattr(provider, 'analyze'):
                result = await provider.analyze(
                    account=account,
                    asset_url=analysis_params.get("asset_url"),
                    analyzer_type=analysis.analyzer_type.value,
                    prompt=analysis.prompt,
                    params=analysis.params or {},
                )
            else:
                # Generic fallback - many vision APIs can be called directly
                result = GenerationResult(
                    provider_job_id=f"analysis-{analysis.id}",
                    provider_video_id=None,
                    status=ProviderStatus.COMPLETED,
                    video_url=None,
                    thumbnail_url=None,
                    metadata={"pending_implementation": True},
                )

            # Update submission with response
            submission.response = {
                "provider_job_id": result.provider_job_id,
                "status": result.status.value,
                "result": result.metadata or {},
            }
            submission.provider_job_id = result.provider_job_id
            submission.responded_at = datetime.utcnow()
            submission.status = "success"

            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)

            logger.info(
                "analysis:submitted",
                analysis_id=analysis.id,
                provider_id=analysis.provider_id,
                submission_id=submission.id,
            )

            return submission

        except ProviderError as e:
            # Update submission with error
            submission.response = {
                "error": str(e),
                "error_type": e.__class__.__name__,
            }
            submission.responded_at = datetime.utcnow()
            submission.status = "error"
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)

            raise

    async def check_analysis_status(
        self,
        submission: ProviderSubmission,
        account: ProviderAccount,
    ) -> ProviderStatusResult:
        """
        Check analysis job status on provider

        Args:
            submission: Provider submission to check
            account: Provider account to use

        Returns:
            ProviderStatusResult with current status
        """
        # Get provider from registry
        provider = registry.get(submission.provider_id)

        # Check status via provider
        if hasattr(provider, 'check_analysis_status'):
            status_result = await provider.check_analysis_status(
                account=account,
                provider_job_id=submission.provider_job_id,
            )
        else:
            # Default: check using standard check_status
            status_result = await provider.check_status(
                account=account,
                provider_job_id=submission.provider_job_id,
            )

        # Update submission response with latest status
        if submission.response is None:
            submission.response = {}

        updated_response = {
            **submission.response,
            "status": status_result.status.value,
            "progress": status_result.progress,
        }

        # Include result if completed
        if status_result.status == ProviderStatus.COMPLETED and status_result.metadata:
            updated_response["result"] = status_result.metadata

        submission.response = updated_response

        await self.db.commit()
        await self.db.refresh(submission)

        return status_result

    async def check_status(
        self,
        submission: ProviderSubmission,
        account: ProviderAccount,
        operation_type: Optional[OperationType] = None,
    ) -> ProviderStatusResult:
        """
        Check job status on provider

        Args:
            submission: Provider submission to check
            account: Provider account to use
            operation_type: Optional operation type (needed for IMAGE_TO_IMAGE)

        Returns:
            ProviderStatusResult with current status

        Raises:
            ProviderNotFoundError: Provider not registered
            ProviderError: Provider API error
        """
        # Get provider from registry
        provider = registry.get(submission.provider_id)

        # Check status via provider
        status_result = await provider.check_status(
            account=account,
            provider_job_id=submission.provider_job_id,
            operation_type=operation_type,
        )

        # Update submission response with latest status
        if submission.response is None:
            submission.response = {}

        existing_video_url = submission.response.get("video_url") or submission.response.get("asset_url")
        existing_thumbnail = submission.response.get("thumbnail_url")
        existing_provider_id = submission.response.get("provider_video_id") or submission.response.get("provider_asset_id")

        video_url = status_result.video_url or existing_video_url
        thumbnail_url = status_result.thumbnail_url or existing_thumbnail
        provider_video_id = status_result.provider_video_id or existing_provider_id or submission.provider_job_id

        # Update response - use assignment to ensure SQLAlchemy detects the change
        updated_response = {
            **submission.response,
            "status": status_result.status.value,
            "video_url": video_url,
            "thumbnail_url": thumbnail_url,
            "progress": status_result.progress,
            "width": status_result.width,
            "height": status_result.height,
            "duration_sec": status_result.duration_sec,
            "provider_video_id": provider_video_id,
            "provider_asset_id": provider_video_id,
        }
        if video_url:
            updated_response["asset_url"] = video_url

        # Assign new dict to trigger SQLAlchemy change detection for JSON column
        submission.response = updated_response

        await self.db.commit()
        await self.db.refresh(submission)

        # Emit event if completed
        if status_result.status == ProviderStatus.COMPLETED:
            # Update account's EMA with actual generation time
            if submission.duration_ms:
                actual_time_sec = submission.duration_ms / 1000.0
                account.update_ema_generation_time(actual_time_sec)
                await self.db.commit()
            
            await event_bus.publish(PROVIDER_COMPLETED, {
                "submission_id": submission.id,
                "job_id": submission.generation_id,  # Keep key for backward compat
                "video_url": status_result.video_url,
            })
        elif status_result.status == ProviderStatus.FAILED:
            await event_bus.publish(PROVIDER_FAILED, {
                "submission_id": submission.id,
                "job_id": submission.generation_id,  # Keep key for backward compat
                "error": status_result.error_message or "Unknown error",
            })

        return status_result

    async def cancel_job(
        self,
        submission: ProviderSubmission,
        account: ProviderAccount
    ) -> bool:
        """
        Cancel job on provider (if supported)

        Args:
            submission: Provider submission
            account: Provider account

        Returns:
            True if cancelled, False if not supported
        """
        # Get provider from registry
        provider = registry.get(submission.provider_id)

        # Attempt to cancel
        try:
            cancelled = await provider.cancel(
                account=account,
                provider_job_id=submission.provider_job_id
            )

            if cancelled:
                submission.response["status"] = "cancelled"
                await self.db.commit()

            return cancelled
        except Exception as e:
            # Cancellation not supported or failed
            return False

    # ===== SUBMISSION RETRIEVAL =====

    async def get_submission(self, submission_id: int) -> ProviderSubmission:
        """Get submission by ID"""
        submission = await self.db.get(ProviderSubmission, submission_id)
        if not submission:
            raise ResourceNotFoundError("ProviderSubmission", submission_id)
        return submission

    async def get_generation_submissions(self, generation_id: int) -> list[ProviderSubmission]:
        """
        Get all submissions for a generation (including retries)

        Args:
            generation_id: Generation ID

        Returns:
            List of submissions ordered by attempt
        """
        from sqlalchemy import select

        result = await self.db.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.generation_id == generation_id)
            .order_by(ProviderSubmission.retry_attempt.asc())
        )
        return list(result.scalars().all())

    # Backward compatibility alias
    get_job_submissions = get_generation_submissions

    async def get_latest_submission(self, generation_id: int) -> ProviderSubmission | None:
        """
        Get latest submission for a generation

        Args:
            generation_id: Generation ID

        Returns:
            Latest submission or None
        """
        from sqlalchemy import select

        result = await self.db.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.generation_id == generation_id)
            .order_by(ProviderSubmission.retry_attempt.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()
