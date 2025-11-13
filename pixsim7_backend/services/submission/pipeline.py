"""
JobSubmissionPipeline - lean orchestration wrapper (Phase 1)

Purpose:
- Provide a single entrypoint for job submission logic
- Wrap existing AccountService + ProviderService behavior with structured logging
- Be trivially swappable into the worker without changing core services

Initial Scope (Phase 1):
- Select account
- Mark job started
- Execute provider submission (ProviderService)
- Return provider_job_id

Future (Phase 2+):
- Canonical option mappers
- Pre-upload cache stage
- Retry/backoff policy abstraction
- Artifact extraction/persistence
- Emission of lifecycle domain events (JobSubmitted, JobFailed, etc.)

Design Notes:
- Non-invasive: uses existing services; does not duplicate their logic
- Feature flag controlled via env PIXSIM7_USE_PIPELINE (checked in worker)
- Adds minimal structured logging fields to ease later ingestion
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict
import os
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7_backend.domain import Job, ProviderAccount, GenerationArtifact, OperationType
from pixsim7_backend.services.account import AccountService
from pixsim7_backend.services.job import JobService
from pixsim7_backend.services.provider.provider_service import ProviderService
from pixsim7_backend.shared.errors import (
    NoAccountAvailableError,
    ProviderError,
)

# Use structured logging from pixsim_logging
from pixsim_logging import get_logger, bind_job_context, bind_artifact_context

logger = get_logger()


@dataclass
class PipelineResult:
    job_id: int
    status: str
    provider_job_id: str | None = None
    error: str | None = None
    account_id: int | None = None
    submitted_at: datetime | None = None


class JobSubmissionPipeline:
    """Lean submission pipeline wrapper.

    Methods:
        run(job, db_session) -> PipelineResult
    """
    def __init__(self, db: AsyncSession):
        self.db = db
        self.account_service = AccountService(db)
        self.provider_service = ProviderService(db)
        # UserService only needed indirectly by JobService
        from pixsim7_backend.services.user import UserService
        self.user_service = UserService(db)
        self.job_service = JobService(db, self.user_service)

    async def run(self, job: Job) -> PipelineResult:
        """Execute submission pipeline for a job.

        Phase 1 implementation mirrors previous worker logic but centralizes it.
        """
        # Bind job context for structured logging
        job_logger = bind_job_context(
            logger,
            job_id=job.id,
            operation_type=job.operation_type.value,
            provider_id=job.provider_id
        )

        job_logger.info("pipeline:start", msg="job_submission_started", retry_count=job.retry_count)

        # Guard: only pending jobs
        if job.status.value != "pending":
            job_logger.warning("pipeline:skip", msg="job_not_pending", status=job.status.value)
            return PipelineResult(job_id=job.id, status="skipped")

        # Select account
        try:
            account: ProviderAccount = await self.account_service.select_account(
                provider_id=job.provider_id,
                user_id=job.user_id,
            )
            job_logger.info("account_selected", account_id=account.id)
        except NoAccountAvailableError as e:
            job_logger.warning("no_account_available", error=str(e), error_type=e.__class__.__name__)
            return PipelineResult(job_id=job.id, status="no_account", error=str(e))

        # Mark started
        await self.job_service.mark_started(job.id)

        # Canonicalize params & create artifact BEFORE provider mapping
        from pixsim7_backend.services.submission.parameter_mappers import get_mapper
        mapper = get_mapper(job.operation_type)
        canonical = mapper.canonicalize(job.params)

        # Derive inputs list (minimal heuristic Phase 1)
        inputs: list[dict] = []
        if job.operation_type == OperationType.IMAGE_TO_VIDEO:
            img_url = job.params.get("image_url")
            if img_url:
                inputs.append({"role": "seed_image", "remote_url": img_url})
        if job.operation_type == OperationType.VIDEO_EXTEND:
            vid_url = job.params.get("video_url")
            if vid_url:
                inputs.append({"role": "source_video", "remote_url": vid_url})

        artifact_hash = GenerationArtifact.compute_hash(canonical, inputs)
        artifact = GenerationArtifact(
            job_id=job.id,
            operation_type=job.operation_type,
            canonical_params=canonical,
            inputs=inputs,
            reproducible_hash=artifact_hash,
        )
        self.db.add(artifact)
        await self.db.commit()
        await self.db.refresh(artifact)

        # Bind artifact context for remaining logs
        artifact_logger = bind_artifact_context(job_logger, artifact_id=artifact.id)
        artifact_logger.info("pipeline:artifact", msg="artifact_created", reproducible_hash=artifact_hash)

        # Execute via ProviderService
        try:
            submission = await self.provider_service.execute_job(
                job=job,
                account=account,
                params=job.params,
            )
            # Track concurrency (lightweight; more robust reservation phase later)
            account.current_processing_jobs += 1
            await self.db.commit()

            # Bind submission context
            submission_logger = bind_artifact_context(
                artifact_logger,
                submission_id=submission.id
            )
            submission_logger.info(
                "provider:submit",
                msg="job_submitted_to_provider",
                provider_job_id=submission.provider_job_id,
                account_id=account.id
            )
            return PipelineResult(
                job_id=job.id,
                status="submitted",
                provider_job_id=submission.provider_job_id,
                account_id=account.id,
                submitted_at=submission.submitted_at,
            )
        except ProviderError as e:
            artifact_logger.error(
                "provider:error",
                msg="provider_submission_failed",
                error=str(e),
                error_type=e.__class__.__name__,
                attempt=job.retry_count
            )
            await self.job_service.mark_failed(job.id, str(e))
            return PipelineResult(job_id=job.id, status="error", error=str(e))


def is_enabled() -> bool:
    """Feature flag check for using pipeline in worker."""
    return os.getenv("PIXSIM7_USE_PIPELINE", "0") in {"1", "true", "TRUE"}
