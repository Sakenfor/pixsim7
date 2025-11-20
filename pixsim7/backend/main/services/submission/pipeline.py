"""
GenerationSubmissionPipeline - unified generation orchestration wrapper

Purpose:
- Single entrypoint for generation submission logic
- Uses unified Generation model (replaces Job + GenerationArtifact)
- Wraps AccountService + ProviderService with structured logging

Scope:
- Select account
- Mark generation started
- Execute provider submission (ProviderService)
- Return provider_job_id and result

Design Notes:
- Uses unified Generation model (no separate artifact creation needed)
- Feature flag controlled via env PIXSIM7_USE_PIPELINE (checked in worker)
- Structured logging for observability
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict
import os
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import Generation, ProviderAccount, OperationType
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.generation import GenerationService
from pixsim7.backend.main.services.provider.provider_service import ProviderService
from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    ProviderError,
)

# Use structured logging from pixsim_logging
from pixsim_logging import get_logger, bind_job_context, bind_artifact_context

logger = get_logger()


@dataclass
class PipelineResult:
    generation_id: int
    status: str
    provider_job_id: str | None = None
    error: str | None = None
    account_id: int | None = None
    submitted_at: datetime | None = None


class GenerationSubmissionPipeline:
    """Unified generation submission pipeline.

    Methods:
        run(generation, db_session) -> PipelineResult
    """
    def __init__(self, db: AsyncSession):
        self.db = db
        self.account_service = AccountService(db)
        self.provider_service = ProviderService(db)
        # UserService only needed indirectly by GenerationService
        from pixsim7.backend.main.services.user import UserService
        self.user_service = UserService(db)
        self.generation_service = GenerationService(db, self.user_service)

    async def run(self, generation: Generation) -> PipelineResult:
        """Execute submission pipeline for a generation.

        Uses unified Generation model (no separate artifact needed).
        """
        # Bind generation context for structured logging
        gen_logger = bind_job_context(
            logger,
            job_id=generation.id,  # Keep "job_id" key for backward compatibility with logging
            generation_id=generation.id,
            operation_type=generation.operation_type.value,
            provider_id=generation.provider_id
        )

        gen_logger.info("pipeline:start", msg="generation_submission_started", retry_count=generation.retry_count)

        # Guard: only pending generations
        if generation.status.value != "pending":
            gen_logger.warning("pipeline:skip", msg="generation_not_pending", status=generation.status.value)
            return PipelineResult(generation_id=generation.id, status="skipped")

        # Select account
        try:
            account: ProviderAccount = await self.account_service.select_account(
                provider_id=generation.provider_id,
                user_id=generation.user_id,
            )
            gen_logger.info("account_selected", account_id=account.id)
        except NoAccountAvailableError as e:
            gen_logger.warning("no_account_available", error=str(e), error_type=e.__class__.__name__)
            return PipelineResult(generation_id=generation.id, status="no_account", error=str(e))

        # Mark started
        await self.generation_service.mark_started(generation.id)

        # Generation already has canonical_params, inputs, and reproducible_hash
        # from creation time (GenerationService.create_generation)
        gen_logger.info(
            "pipeline:generation",
            msg="using_unified_generation",
            reproducible_hash=generation.reproducible_hash,
            has_prompt_version=generation.prompt_version_id is not None
        )

        # Execute via ProviderService
        # Map canonical_params to provider-specific params
        from pixsim7.backend.main.services.submission.parameter_mappers import get_mapper
        mapper = get_mapper(generation.operation_type)
        provider_params = mapper.map_to_provider(generation.canonical_params)

        try:
            # Note: ProviderService.execute_job still expects 'job' parameter
            # We'll pass generation with the same interface for now
            # TODO: Update ProviderService to accept generation directly
            submission = await self.provider_service.execute_job(
                job=generation,  # Pass generation (compatible interface)
                account=account,
                params=provider_params,  # Use provider-mapped params
            )
            # Track concurrency (lightweight; more robust reservation phase later)
            account.current_processing_jobs += 1
            await self.db.commit()

            # Bind submission context
            submission_logger = gen_logger
            submission_logger.info(
                "provider:submit",
                msg="generation_submitted_to_provider",
                provider_job_id=submission.provider_job_id,
                account_id=account.id,
                submission_id=submission.id
            )
            return PipelineResult(
                generation_id=generation.id,
                status="submitted",
                provider_job_id=submission.provider_job_id,
                account_id=account.id,
                submitted_at=submission.submitted_at,
            )
        except ProviderError as e:
            gen_logger.error(
                "provider:error",
                msg="provider_submission_failed",
                error=str(e),
                error_type=e.__class__.__name__,
                attempt=generation.retry_count
            )
            await self.generation_service.mark_failed(generation.id, str(e))
            return PipelineResult(generation_id=generation.id, status="error", error=str(e))


def is_enabled() -> bool:
    """Feature flag check for using pipeline in worker."""
    return os.getenv("PIXSIM7_USE_PIPELINE", "0") in {"1", "true", "TRUE"}


# Backward compatibility alias
JobSubmissionPipeline = GenerationSubmissionPipeline
