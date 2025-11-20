"""
Generation processor worker - executes pending generations

Processes generations created via GenerationService:
1. Select provider account
2. Submit generation to provider
3. Update generation status
"""
import os
from sqlalchemy.ext.asyncio import AsyncSession
from pixsim7.backend.main.domain import Generation, ProviderAccount
from pixsim7.backend.main.services.generation import GenerationService
from pixsim7.backend.main.services.account import AccountService
from pixsim7.backend.main.services.provider import ProviderService
from pixsim7.backend.main.services.user import UserService
from pixsim7.backend.main.infrastructure.database.session import get_db
from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    AccountCooldownError,
    ProviderError,
)
from pixsim7.backend.main.services.submission.pipeline import GenerationSubmissionPipeline, is_enabled as pipeline_enabled
from pixsim7.backend.main.workers.health import get_health_tracker

# Configure structured logging using pixsim_logging
from pixsim_logging import configure_logging, get_logger, bind_job_context

# Initialize logger at module level
_base_logger = None

def _get_worker_logger():
    """Get or initialize worker logger."""
    global _base_logger
    if _base_logger is None:
        _base_logger = configure_logging("worker")
    return _base_logger

logger = _get_worker_logger()


async def process_generation(generation_id: int) -> dict:
    """
    Process a single generation

    This is the main ARQ task that gets queued when a generation is created.

    Args:
        generation_id: ID of the generation to process

    Returns:
        dict with status and message
    """
    # Bind generation context for all logs in this function
    # Keep job_id in logs for backward compatibility with log analysis tools
    gen_logger = bind_job_context(logger, job_id=generation_id, generation_id=generation_id)
    gen_logger.info("pipeline:start", msg="generation_processing_started")

    async for db in get_db():
        # If feature flag enabled, delegate to pipeline
        if pipeline_enabled():
            try:
                pipeline = GenerationSubmissionPipeline(db)
                generation_service = pipeline.generation_service
                generation = await generation_service.get_generation(generation_id)
                result = await pipeline.run(generation)

                # Track successful generation
                if result.status in ("submitted", "processing"):
                    get_health_tracker().increment_processed()

                return {
                    "status": result.status,
                    "provider_job_id": result.provider_job_id,
                    "account_id": result.account_id,
                    "error": result.error,
                    "generation_id": result.generation_id,
                }
            except Exception as e:
                gen_logger.error("pipeline_error", error=str(e), error_type=e.__class__.__name__, exc_info=True)

                # Track failed generation
                get_health_tracker().increment_failed()

                # Attempt to mark failed
                try:
                    await GenerationService(db, UserService(db)).mark_failed(generation_id, str(e))
                except Exception:
                    pass
                raise
            finally:
                await db.close()
            return

        # Legacy path (pre-pipeline) - updated to use GenerationService
        try:
            # Initialize services
            user_service = UserService(db)
            generation_service = GenerationService(db, user_service)
            account_service = AccountService(db)
            provider_service = ProviderService(db)

            # Get generation
            generation = await generation_service.get_generation(generation_id)

            if generation.status != "pending":
                gen_logger.warning("generation_not_pending", status=generation.status)
                return {"status": "skipped", "reason": f"Generation status is {generation.status}"}

            # Check if scheduled for later
            from datetime import datetime
            if generation.scheduled_at and generation.scheduled_at > datetime.utcnow():
                gen_logger.info("generation_scheduled", scheduled_at=str(generation.scheduled_at))
                return {"status": "scheduled", "scheduled_for": str(generation.scheduled_at)}

            # Select account
            try:
                account = await account_service.select_account(
                    provider_id=generation.provider_id,
                    user_id=generation.user_id
                )
                gen_logger.info("account_selected", account_id=account.id, provider_id=generation.provider_id)
            except (NoAccountAvailableError, AccountCooldownError) as e:
                gen_logger.warning("no_account_available", error=str(e), error_type=e.__class__.__name__)
                # Requeue generation for later (ARQ will retry)
                raise

            # Mark generation as started
            await generation_service.mark_started(generation_id)
            gen_logger.info("generation_started")

            # Execute generation via provider
            try:
                submission = await provider_service.execute_job(
                    job=generation,  # Pass generation (compatible interface)
                    account=account,
                    params=generation.raw_params  # Use raw_params for legacy path
                )

                # Increment account's concurrent job count
                account.current_processing_jobs += 1
                await db.commit()

                gen_logger.info(
                    "provider:submit",
                    provider_job_id=submission.provider_job_id,
                    account_id=account.id,
                    msg="generation_submitted_to_provider"
                )

                # Track successful generation
                get_health_tracker().increment_processed()

                return {
                    "status": "submitted",
                    "provider_job_id": submission.provider_job_id,
                    "generation_id": generation_id,
                }

            except ProviderError as e:
                gen_logger.error("provider:error", error=str(e), error_type=e.__class__.__name__)
                await generation_service.mark_failed(generation_id, str(e))

                # Track failed generation
                get_health_tracker().increment_failed()

                raise

        except Exception as e:
            gen_logger.error("generation_processing_failed", error=str(e), error_type=e.__class__.__name__, exc_info=True)

            # Track failed generation
            get_health_tracker().increment_failed()

            # Try to mark generation as failed
            try:
                await generation_service.mark_failed(generation_id, str(e))
            except Exception as mark_error:
                gen_logger.error("mark_failed_error", error=str(mark_error))

            raise

        finally:
            # Close DB session
            await db.close()


async def on_startup(ctx: dict) -> None:
    """ARQ worker startup"""
    logger.info("worker_started", component="generation_processor")


async def on_shutdown(ctx: dict) -> None:
    """ARQ worker shutdown"""
    logger.info("worker_shutdown", component="generation_processor")


# ARQ task configuration
class WorkerSettings:
    """ARQ worker settings for generation processor"""
    functions = [process_generation]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = "redis://localhost:6379/0"  # Will be overridden by env
