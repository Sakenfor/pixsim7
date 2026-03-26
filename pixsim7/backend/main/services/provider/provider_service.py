"""
ProviderService - orchestrate provider API calls

Clean service for provider interaction and submission tracking.
"""
from __future__ import annotations

from typing import Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain import (
    Generation,
    ProviderStatus,
    OperationType,
)
from pixsim7.backend.main.domain.providers import ProviderSubmission, ProviderAccount
from pixsim7.backend.main.domain.providers.registry import registry
from pixsim7.backend.main.domain.assets.analysis import AssetAnalysis
from pixsim7.backend.main.domain.providers.execution.file_resolver import resolve_source_to_local_file
from pixsim7.backend.main.services.provider.base import (
    GenerationResult,
    ProviderStatusResult,
    ProviderError,
)
from pixsim7.backend.main.shared.errors import ProviderNotFoundError, ResourceNotFoundError
from pixsim7.backend.main.infrastructure.events.bus import event_bus
from pixsim7.backend.main.services.provider.events import PROVIDER_SUBMITTED, PROVIDER_COMPLETED, PROVIDER_FAILED
from pixsim7.backend.main.shared.operation_mapping import (
    get_image_operations,
    get_video_operations,
    OPERATION_REGISTRY,
)
from pixsim7.backend.main.shared.composition_assets import coerce_composition_assets
from pixsim7.backend.main.services.provider.provider_logging import (
    summarize_provider_params_for_log,
)

logger = configure_logging("provider_service").bind(channel="pipeline")


def _extract_provider_error_code(error: ProviderError) -> str | None:
    """Extract structured error_code from ProviderError when available."""
    value = getattr(error, "error_code", None)
    if isinstance(value, str):
        value = value.strip()
        if value:
            return value
    return None


def _analysis_support_snapshot(provider: Any) -> Dict[str, bool]:
    """Capture whether a provider exposes analysis execution/status hooks."""
    return {
        "has_analyze": callable(getattr(provider, "analyze", None)),
        "has_check_analysis_status": callable(getattr(provider, "check_analysis_status", None)),
        "has_check_status": callable(getattr(provider, "check_status", None)),
    }


def _analysis_manifest_snapshot(provider: Any) -> Dict[str, Any]:
    """Capture manifest context relevant for analysis/accountless diagnostics."""
    manifest = None
    try:
        if hasattr(provider, "get_manifest"):
            manifest = provider.get_manifest()
    except Exception:
        manifest = None

    requires_credentials = True
    kind = None
    credit_types: list[str] = []

    if manifest is not None:
        requires_credentials = bool(getattr(manifest, "requires_credentials", True))
        raw_kind = getattr(manifest, "kind", None)
        if raw_kind is not None:
            kind = getattr(raw_kind, "value", str(raw_kind))
        raw_credit_types = getattr(manifest, "credit_types", None) or []
        for item in raw_credit_types:
            value = str(item).strip()
            if value:
                credit_types.append(value)

    return {
        "requires_credentials": requires_credentials,
        "supports_accountless": not requires_credentials,
        "kind": kind,
        "credit_types": credit_types,
    }


def _generation_attempt_started_marker(generation: Generation) -> str | None:
    """Serialize current generation attempt start timestamp for submission ownership."""
    started_at = getattr(generation, "started_at", None)
    if started_at is None:
        return None
    try:
        return started_at.isoformat()
    except Exception:
        return None


def _generation_attempt_id(generation: Generation) -> int | None:
    """Return current generation attempt_id when it is a positive integer."""
    value = getattr(generation, "attempt_id", None)
    try:
        attempt_id = int(value)
    except Exception:
        return None
    if attempt_id > 0:
        return attempt_id
    return None


def _build_submission_response(
    base: Dict[str, Any],
    *,
    attempt_started_at: str | None,
) -> Dict[str, Any]:
    """Attach internal submission ownership metadata to provider response payload."""
    out = dict(base)
    if attempt_started_at:
        out["generation_attempt_started_at"] = attempt_started_at
    return out


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
        attempt_started_at = _generation_attempt_started_marker(generation)

        # === Use cached resolved_params if available (for retries) ===
        # This avoids re-resolving assets which can fail intermittently.
        if generation.resolved_params:
            logger.info(
                "using_cached_resolved_params",
                generation_id=generation.id,
                retry_count=generation.retry_count,
            )
            # Create submission and execute directly with cached params
            submission = ProviderSubmission(
                generation_id=generation.id,
                generation_attempt_id=_generation_attempt_id(generation),
                account_id=account.id,
                provider_id=generation.provider_id,
                payload=generation.resolved_params,
                response=_build_submission_response({}, attempt_started_at=attempt_started_at),
                retry_attempt=generation.retry_count,
                submitted_at=datetime.now(timezone.utc),
                status="pending",
            )
            self.db.add(submission)
            await self.db.commit()
            await self.db.refresh(submission)

            return await self._execute_with_payload(
                provider=provider,
                generation=generation,
                account=account,
                submission=submission,
                execute_params=generation.resolved_params,
            )

        # Normalize params and ensure composition_assets for asset-based operations.
        params = dict(params)
        operation_type = generation.operation_type
        spec = OPERATION_REGISTRY.get(operation_type)
        if spec and "composition_assets" in (spec.required_inputs or []):
            raw_params = getattr(generation, "raw_params", None) or {}
            if not isinstance(raw_params, dict):
                raw_params = {}
            raw_gen_config = raw_params.get("generation_config")
            if not isinstance(raw_gen_config, dict):
                raw_gen_config = {}

            composition_assets = (
                params.get("composition_assets")
                or raw_gen_config.get("composition_assets")
                or raw_params.get("composition_assets")
            )

            def _legacy_value(*keys: str):
                for key in keys:
                    if key in params and params.get(key) is not None:
                        return params.get(key)
                    if raw_gen_config.get(key) is not None:
                        return raw_gen_config.get(key)
                    if raw_params.get(key) is not None:
                        return raw_params.get(key)
                return None

            default_media_type = "image"
            default_role = "composition_reference"
            legacy_keys: tuple[str, ...] = ("source_asset_ids", "image_urls", "image_url")
            if operation_type == OperationType.IMAGE_TO_VIDEO:
                default_role = "source_image"
                legacy_keys = ("source_asset_id", "image_url", "image_urls")
            elif operation_type == OperationType.IMAGE_TO_IMAGE:
                legacy_keys = ("source_asset_ids", "source_asset_id", "image_urls", "image_url")
            elif operation_type == OperationType.VIDEO_EXTEND:
                default_media_type = "video"
                default_role = "source_video"
                legacy_keys = ("source_asset_id", "video_url")
            elif operation_type == OperationType.VIDEO_TRANSITION:
                default_role = "transition_input"

            if not composition_assets and legacy_keys:
                composition_assets = _legacy_value(*legacy_keys)

            if composition_assets:
                params["composition_assets"] = coerce_composition_assets(
                    composition_assets,
                    default_media_type=default_media_type,
                    default_role=default_role,
                )

        # Map parameters to provider format (this is what we persist as ProviderSubmission.payload).
        mapped_params = provider.map_parameters(
            operation_type=operation_type,
            params=params,
        )

        # Debug: Log mapped params to trace parameter filtering
        logger.info(
            "provider_mapped_params",
            extra={
                "generation_id": generation.id,
                "provider_id": generation.provider_id,
                "operation_type": generation.operation_type.value,
                "input_keys": list(params.keys()),
                "mapped_keys": list(mapped_params.keys()),
                "has_aspect_ratio": "aspect_ratio" in mapped_params,
                "has_camera_movement": "camera_movement" in mapped_params,
                "mapped_params": {
                    k: (v[:80] + "…" if isinstance(v, str) and len(v) > 80 else v)
                    for k, v in mapped_params.items()
                },
            }
        )

        # Provider execution params may include ephemeral local file paths for multipart uploads.
        execute_params: Dict[str, Any] = mapped_params

        # Record submission start
        submission = ProviderSubmission(
            generation_id=generation.id,
            generation_attempt_id=_generation_attempt_id(generation),
            account_id=account.id,
            provider_id=generation.provider_id,
            payload=mapped_params,
            response=_build_submission_response({}, attempt_started_at=attempt_started_at),
            retry_attempt=generation.retry_count,
            submitted_at=datetime.now(timezone.utc),
            status="pending",
        )
        self.db.add(submission)
        await self.db.commit()
        await self.db.refresh(submission)
        logger.info(
            "provider_submission_created",
            generation_id=generation.id,
            submission_id=submission.id,
            account_id=account.id,
            provider_id=generation.provider_id,
            retry_attempt=generation.retry_count,
            submitted_at=submission.submitted_at.isoformat() if submission.submitted_at else None,
            has_provider_job_id=bool(submission.provider_job_id),
        )

        try:
            # Some providers require uploading local files. For these, we keep the persisted
            # payload small/portable (URLs or asset references) but resolve files at runtime.
            # Instead of provider-specific checks, we use the generic prepare_execution_params() hook.
            if provider.requires_file_preparation():
                # Create a bound resolver function for the provider to use
                async def resolve_source_fn(source, user_id: int, default_suffix: str):
                    return await resolve_source_to_local_file(
                        source=source,
                        user_id=user_id,
                        default_suffix=default_suffix,
                        db_session=self.db,
                    )

                execute_params = await provider.prepare_execution_params(
                    generation=generation,
                    mapped_params=mapped_params,
                    resolve_source_fn=resolve_source_fn,
                    account=account,
                )

                # Cache resolved params on Generation for retry reuse
                generation.resolved_params = execute_params
                submission.payload = execute_params
                await self.db.commit()
                await self.db.refresh(generation)

            logger.info(
                "provider_execute_params",
                generation_id=generation.id,
                provider_id=generation.provider_id,
                operation_type=generation.operation_type.value,
                execute_params_summary=summarize_provider_params_for_log(execute_params),
            )
            logger.info(
                "provider_execute_started",
                generation_id=generation.id,
                submission_id=submission.id,
                provider_id=generation.provider_id,
                operation_type=generation.operation_type.value,
            )

            # Execute provider operation
            result: GenerationResult = await provider.execute(
                operation_type=generation.operation_type,
                account=account,
                params=execute_params
            )
            logger.info(
                "provider_execute_returned",
                generation_id=generation.id,
                submission_id=submission.id,
                provider_id=generation.provider_id,
                operation_type=generation.operation_type.value,
                has_provider_job_id=bool(getattr(result, "provider_job_id", None)),
                provider_job_id=getattr(result, "provider_job_id", None),
                status=str(getattr(result, "status", None)),
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
            submission.response = _build_submission_response(
                submission.response,
                attempt_started_at=attempt_started_at,
            )
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
            submission.responded_at = datetime.now(timezone.utc)
            submission.status = "success"

            # Calculate duration
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)
            logger.info(
                "provider_submission_updated",
                generation_id=generation.id,
                submission_id=submission.id,
                provider_id=generation.provider_id,
                provider_job_id=submission.provider_job_id,
                submission_status=submission.status,
                responded_at=submission.responded_at.isoformat() if submission.responded_at else None,
            )

            # Emit success event
            await event_bus.publish(PROVIDER_SUBMITTED, {
                "job_id": generation.id,
                "submission_id": submission.id,
                "provider_job_id": result.provider_job_id,
            })

            return submission

        except ProviderError as e:
            error_code = _extract_provider_error_code(e)
            # Expected operational errors → WARNING; unexpected → ERROR
            from pixsim7.backend.main.shared.errors import (
                ProviderQuotaExceededError as _Quota,
                ProviderContentFilteredError as _Filtered,
                ProviderConcurrentLimitError as _Concurrent,
            )
            _log = logger.warning if isinstance(e, (_Quota, _Filtered, _Concurrent)) else logger.error
            _log(
                "provider_execute_failed",
                generation_id=generation.id,
                provider_id=generation.provider_id,
                operation_type=generation.operation_type.value,
                error=str(e),
                error_type=e.__class__.__name__,
                execute_params_summary=summarize_provider_params_for_log(execute_params),
            )
            # Update submission with error
            submission.response = {
                "error": str(e),
                "error_type": e.__class__.__name__,
            }
            if error_code:
                submission.response["error_code"] = error_code
            submission.response = _build_submission_response(
                submission.response,
                attempt_started_at=attempt_started_at,
            )
            submission.responded_at = datetime.now(timezone.utc)
            submission.status = "error"
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)
            logger.info(
                "provider_submission_updated",
                generation_id=generation.id,
                submission_id=submission.id,
                provider_id=generation.provider_id,
                provider_job_id=submission.provider_job_id,
                submission_status=submission.status,
                responded_at=submission.responded_at.isoformat() if submission.responded_at else None,
            )

            # Emit failure event
            await event_bus.publish(PROVIDER_FAILED, {
                "job_id": generation.id,
                "submission_id": submission.id,
                "error": str(e),
                "error_type": e.__class__.__name__,
                "error_code": error_code,
                "execute_params_summary": summarize_provider_params_for_log(execute_params),
                "provider_id": generation.provider_id,
                "operation_type": generation.operation_type.value,
            })

            # Re-raise for caller to handle
            raise

    # Note: _prepare_remaker_execute_params has been removed.
    # Providers now implement prepare_execution_params() directly.

    async def _execute_with_payload(
        self,
        provider,
        generation: Generation,
        account: ProviderAccount,
        submission: ProviderSubmission,
        execute_params: Dict[str, Any],
    ) -> ProviderSubmission:
        """
        Execute provider operation with pre-resolved params.

        Used for retries where we reuse the previous submission's payload
        instead of re-resolving assets.
        """
        try:
            logger.info(
                "provider_execute_with_cached_payload",
                generation_id=generation.id,
                submission_id=submission.id,
                execute_params_summary=summarize_provider_params_for_log(execute_params),
            )
            logger.info(
                "provider_execute_started",
                generation_id=generation.id,
                submission_id=submission.id,
                provider_id=generation.provider_id,
                operation_type=generation.operation_type.value,
                cached_payload=True,
            )

            # Execute provider operation
            result: GenerationResult = await provider.execute(
                operation_type=generation.operation_type,
                account=account,
                params=execute_params
            )
            logger.info(
                "provider_execute_returned",
                generation_id=generation.id,
                submission_id=submission.id,
                provider_id=generation.provider_id,
                operation_type=generation.operation_type.value,
                cached_payload=True,
                has_provider_job_id=bool(getattr(result, "provider_job_id", None)),
                provider_job_id=getattr(result, "provider_job_id", None),
                status=str(getattr(result, "status", None)),
            )

            # Update submission with response
            if generation.operation_type in get_image_operations():
                submission.response = {
                    "provider_job_id": result.provider_job_id,
                    "provider_image_id": result.provider_video_id,
                    "status": result.status.value,
                    "image_url": result.video_url,
                    "thumbnail_url": result.thumbnail_url,
                    "metadata": result.metadata or {},
                    "media_type": "image",
                }
            else:
                submission.response = {
                    "provider_job_id": result.provider_job_id,
                    "provider_video_id": result.provider_video_id,
                    "status": result.status.value,
                    "video_url": result.video_url,
                    "thumbnail_url": result.thumbnail_url,
                    "metadata": result.metadata or {},
                }
            submission.response = _build_submission_response(
                submission.response,
                attempt_started_at=_generation_attempt_started_marker(generation),
            )

            if not result.provider_job_id:
                raise ProviderError(
                    f"Provider did not return a job ID for {generation.operation_type.value}"
                )

            submission.provider_job_id = result.provider_job_id
            submission.responded_at = datetime.now(timezone.utc)
            submission.status = "success"
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)
            logger.info(
                "provider_submission_updated",
                generation_id=generation.id,
                submission_id=submission.id,
                provider_id=generation.provider_id,
                provider_job_id=submission.provider_job_id,
                submission_status=submission.status,
                responded_at=submission.responded_at.isoformat() if submission.responded_at else None,
            )

            await event_bus.publish(PROVIDER_SUBMITTED, {
                "job_id": generation.id,
                "submission_id": submission.id,
                "provider_job_id": result.provider_job_id,
            })

            return submission

        except ProviderError as e:
            error_code = _extract_provider_error_code(e)
            # Expected operational errors (quota, content filter, concurrent
            # limit) → WARNING; unexpected errors → ERROR.
            from pixsim7.backend.main.shared.errors import (
                ProviderQuotaExceededError,
                ProviderContentFilteredError,
                ProviderConcurrentLimitError,
            )
            _EXPECTED = (ProviderQuotaExceededError, ProviderContentFilteredError, ProviderConcurrentLimitError)
            _log = logger.warning if isinstance(e, _EXPECTED) else logger.error
            _log(
                "provider_execute_failed",
                generation_id=generation.id,
                error=str(e),
                error_type=e.__class__.__name__,
            )
            submission.response = {
                "error": str(e),
                "error_type": e.__class__.__name__,
            }
            if error_code:
                submission.response["error_code"] = error_code
            submission.response = _build_submission_response(
                submission.response,
                attempt_started_at=_generation_attempt_started_marker(generation),
            )
            submission.responded_at = datetime.now(timezone.utc)
            submission.status = "error"
            submission.calculate_duration()

            await self.db.commit()
            await self.db.refresh(submission)
            logger.info(
                "provider_submission_updated",
                generation_id=generation.id,
                submission_id=submission.id,
                provider_id=generation.provider_id,
                provider_job_id=submission.provider_job_id,
                submission_status=submission.status,
                responded_at=submission.responded_at.isoformat() if submission.responded_at else None,
            )

            await event_bus.publish(PROVIDER_FAILED, {
                "job_id": generation.id,
                "submission_id": submission.id,
                "error": str(e),
                "error_type": e.__class__.__name__,
                "error_code": error_code,
                "provider_id": generation.provider_id,
                "operation_type": generation.operation_type.value,
            })

            raise

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
            "analyzer_id": analysis.analyzer_id,
            "model_id": analysis.model_id,
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
            submitted_at=datetime.now(timezone.utc),
            status="pending",
        )
        self.db.add(submission)
        await self.db.commit()
        await self.db.refresh(submission)

        try:
            # Execute analysis via provider
            # For now, we use a generic analyze method if available,
            # or fall back to execute with a special operation type
            if callable(getattr(provider, "analyze", None)):
                result = await provider.analyze(
                    account=account,
                    asset_url=analysis_params.get("asset_url"),
                    analyzer_id=analysis.analyzer_id,
                    model_id=analysis.model_id,
                    prompt=analysis.prompt,
                    params=analysis.params or {},
                )
            else:
                support = _analysis_support_snapshot(provider)
                manifest_support = _analysis_manifest_snapshot(provider)
                status_hook_available = bool(
                    support.get("has_check_analysis_status")
                    or support.get("has_check_status")
                )
                pending_metadata = {
                    "pending_implementation": True,
                    "reason": "provider_missing_analyze_hook",
                    "provider_id": analysis.provider_id,
                    "analyzer_id": analysis.analyzer_id,
                    "model_id": analysis.model_id,
                    "analysis_support": support,
                    "provider_manifest": manifest_support,
                    "analysis_pipeline_ready": bool(
                        support.get("has_analyze") and status_hook_available
                    ),
                    "status_hook_available": status_hook_available,
                    "missing_hooks": [
                        key for key, present in support.items()
                        if key == "has_analyze" and not present
                    ],
                    "suggested_next_step": (
                        "Implement provider.analyze() and optionally "
                        "provider.check_analysis_status() for async analysis providers."
                    ),
                }
                logger.warning(
                    "analysis_provider_pending_implementation provider_id=%s analyzer_id=%s support=%s",
                    analysis.provider_id,
                    analysis.analyzer_id,
                    support,
                )
                # Generic fallback - many vision APIs can be called directly
                result = GenerationResult(
                    provider_job_id=f"analysis-{analysis.id}",
                    provider_video_id=None,
                    status=ProviderStatus.COMPLETED,
                    video_url=None,
                    thumbnail_url=None,
                    metadata=pending_metadata,
                )

            # Update submission with response
            submission.response = {
                "provider_job_id": result.provider_job_id,
                "status": result.status.value,
                "result": result.metadata or {},
            }
            submission.provider_job_id = result.provider_job_id
            submission.responded_at = datetime.now(timezone.utc)
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
            submission.responded_at = datetime.now(timezone.utc)
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

        # Local pending-implementation shortcut: avoid calling provider status
        # APIs when execution was intentionally marked as placeholder.
        response_payload = submission.response if isinstance(submission.response, dict) else {}
        pending_result = response_payload.get("result", {})
        if isinstance(pending_result, dict) and pending_result.get("pending_implementation"):
            return ProviderStatusResult(
                status=ProviderStatus.COMPLETED,
                progress=1.0,
                metadata=pending_result,
            )

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
        poll_cache: Optional[Dict[str, Any]] = None,
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

        status_result: ProviderStatusResult | None = None

        # Pixverse image status batch fast-path (per-poll cache): one image list
        # call can satisfy many IMAGE_TO_IMAGE checks on the same account.
        _BATCH_FAILED_SENTINEL = "batch_failed"
        if (
            poll_cache is not None
            and submission.provider_id == "pixverse"
            and operation_type in get_image_operations()
            and submission.provider_job_id
            and hasattr(provider, "check_image_statuses_from_list")
        ):
            cache_key = f"pixverse:image_status_batch:{account.id}"
            status_map = poll_cache.get(cache_key)
            if status_map is None:
                try:
                    status_map = await provider.check_image_statuses_from_list(
                        account=account,
                        limit=200,
                        offset=0,
                    )
                    poll_cache[cache_key] = status_map
                except Exception as batch_err:
                    logger.debug(
                        "pixverse_image_status_batch_failed",
                        submission_id=submission.id,
                        account_id=account.id,
                        error=str(batch_err),
                    )
                    # Mark as failed so we don't retry the batch for every
                    # image in this poll cycle, but don't cache an empty dict
                    # that would look like "batch succeeded, image not found".
                    poll_cache[cache_key] = _BATCH_FAILED_SENTINEL

            if isinstance(status_map, dict):
                cached_result = status_map.get(str(submission.provider_job_id))
                if cached_result is not None:
                    status_result = cached_result

        # Default provider status check (or batch-cache miss)
        if status_result is None:
            status_result = await provider.check_status(
                account=account,
                provider_job_id=submission.provider_job_id,
                operation_type=operation_type,
            )

        # Pixverse image fallback: use the direct image list to bypass the
        # message endpoint which acts as a notification consumer — completed
        # IDs can be acked by the Pixverse website tab and never appear in
        # the message list our SDK polls.  Trigger early (45-90s) so we
        # don't wait minutes for the progressive search to find the image.
        if (
            submission.provider_id == "pixverse"
            and operation_type in get_image_operations()
            and status_result.status == ProviderStatus.PROCESSING
            and submission.submitted_at
            and submission.provider_job_id
            and hasattr(provider, "check_image_status_from_list")
        ):
            model = None
            if submission.payload and isinstance(submission.payload, dict):
                model = submission.payload.get("model")
            model_name = str(model or "").lower()
            threshold_seconds = 45 if ("qwen" in model_name or "seedream" in model_name) else 90
            elapsed_seconds = (datetime.now(timezone.utc) - submission.submitted_at).total_seconds()

            if elapsed_seconds >= threshold_seconds:
                try:
                    fallback_result = await provider.check_image_status_from_list(
                        account=account,
                        image_id=submission.provider_job_id,
                    )
                    if fallback_result.status != ProviderStatus.PROCESSING:
                        status_result = fallback_result
                except Exception as fallback_err:
                    logger.warning(
                        "pixverse_image_fallback_failed",
                        submission_id=submission.id,
                        provider_job_id=submission.provider_job_id,
                        error=str(fallback_err),
                    )

        # Pixverse video fallback: for extend/video jobs that keep returning
        # "processing" from direct status APIs, check the personal video list.
        if (
            submission.provider_id == "pixverse"
            and operation_type in get_video_operations()
            and status_result.status == ProviderStatus.PROCESSING
            and submission.submitted_at
            and submission.provider_job_id
            and hasattr(provider, "check_video_status_from_list")
        ):
            threshold_seconds = 90 if operation_type == OperationType.VIDEO_EXTEND else 240
            elapsed_seconds = (datetime.now(timezone.utc) - submission.submitted_at).total_seconds()

            if elapsed_seconds >= threshold_seconds:
                try:
                    fallback_result = await provider.check_video_status_from_list(
                        account=account,
                        video_id=submission.provider_job_id,
                    )
                    if (
                        fallback_result.status != ProviderStatus.PROCESSING
                        or (fallback_result.metadata or {}).get("matched")
                    ):
                        status_result = fallback_result
                except Exception as fallback_err:
                    logger.warning(
                        "pixverse_video_fallback_failed",
                        submission_id=submission.id,
                        provider_job_id=submission.provider_job_id,
                        error=str(fallback_err),
                    )

        # Update submission response with latest status
        if submission.response is None:
            submission.response = {}

        existing_video_url = submission.response.get("video_url") or submission.response.get("asset_url")
        existing_thumbnail = submission.response.get("thumbnail_url")
        existing_provider_id = submission.response.get("provider_video_id") or submission.response.get("provider_asset_id")

        video_url = status_result.video_url or existing_video_url
        is_pixverse_video_submission = (
            submission.provider_id == "pixverse"
            and operation_type in get_video_operations()
        )
        # PixVerse video first-frame thumbnails can be temporary grey placeholders
        # with incorrect aspect ratios. Prefer no provider thumbnail over persisting
        # a fragile placeholder into submission/asset state.
        if is_pixverse_video_submission:
            thumbnail_url = None
        else:
            thumbnail_url = status_result.thumbnail_url or existing_thumbnail
        provider_video_id = status_result.provider_video_id or existing_provider_id or submission.provider_job_id

        # Stamp media_type from OPERATION_REGISTRY so asset creation never
        # has to guess from ambiguous video_url / image_url keys.
        if operation_type:
            op_spec = OPERATION_REGISTRY.get(operation_type)
            if op_spec:
                submission.response.setdefault("media_type", op_spec.output_media)

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
        if status_result.error_message:
            updated_response["error"] = status_result.error_message
            updated_response["error_message"] = status_result.error_message

        # Preserve existing metadata while applying provider status updates from polling.
        existing_metadata = submission.response.get("metadata")
        merged_metadata = dict(existing_metadata) if isinstance(existing_metadata, dict) else {}
        if status_result.metadata:
            merged_metadata.update(status_result.metadata)
        if merged_metadata:
            updated_response["metadata"] = merged_metadata
            provider_status = merged_metadata.get("provider_status")
            if provider_status is not None:
                updated_response["provider_status"] = provider_status

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
            def _summarize_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
                image_urls = raw.get("image_urls")
                summary: Dict[str, Any] = {
                    "keys": list(raw.keys()),
                    "model": raw.get("model"),
                    "quality": raw.get("quality"),
                    "aspect_ratio": raw.get("aspect_ratio"),
                    "seed": raw.get("seed"),
                    "duration": raw.get("duration"),
                    "image_url": str(raw.get("image_url"))[:120] if raw.get("image_url") else None,
                    "video_url": str(raw.get("video_url"))[:120] if raw.get("video_url") else None,
                }
                if isinstance(image_urls, list):
                    summary["image_urls_count"] = len(image_urls)
                    summary["image_urls_sample"] = [
                        str(value)[:80] if value is not None else None
                        for value in image_urls[:3]
                    ]
                return summary

            await event_bus.publish(PROVIDER_FAILED, {
                "submission_id": submission.id,
                "job_id": submission.generation_id,  # Keep key for backward compat
                "error": status_result.error_message or "Unknown error",
                "error_type": "provider_status_failed",
                "payload_summary": _summarize_payload(submission.payload or {}),
                "provider_id": submission.provider_id,
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
