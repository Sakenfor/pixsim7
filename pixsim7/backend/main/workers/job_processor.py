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
    AccountExhaustedError,
    ProviderError,
)
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


async def refresh_account_credits(
    account: ProviderAccount,
    account_service: AccountService,
    gen_logger,
) -> dict:
    """
    Refresh credits for an account from the provider.

    Returns dict with credit amounts, or empty dict on failure.
    """
    from pixsim7.backend.main.services.provider.registry import registry

    try:
        provider = registry.get(account.provider_id)

        # Use get_credits_basic (faster, no ad-task lookup)
        if hasattr(provider, 'get_credits_basic'):
            credits_data = await provider.get_credits_basic(account, retry_on_session_error=False)
        elif hasattr(provider, 'get_credits'):
            credits_data = await provider.get_credits(account)
        else:
            gen_logger.debug("provider_no_credits_method", provider_id=account.provider_id)
            return {}

        # Update credits in database
        if credits_data:
            for credit_type, amount in credits_data.items():
                if credit_type in ('web', 'webapi', 'openapi', 'standard'):
                    # Map 'web' to 'webapi' for consistency
                    db_credit_type = 'webapi' if credit_type == 'web' else credit_type
                    try:
                        await account_service.set_credit(account.id, db_credit_type, int(amount))
                    except Exception as e:
                        gen_logger.warning("credit_update_failed", credit_type=db_credit_type, error=str(e))

            gen_logger.info("credits_refreshed", account_id=account.id, credits=credits_data)

        return credits_data or {}

    except Exception as e:
        gen_logger.warning("credits_refresh_failed", account_id=account.id, error=str(e))
        return {}


def has_sufficient_credits(credits_data: dict, min_credits: int = 1) -> bool:
    """Check if account has any usable credits."""
    # Check web/webapi credits (free tier)
    web = credits_data.get('web', 0) or credits_data.get('webapi', 0)
    # Check openapi credits (paid tier)
    openapi = credits_data.get('openapi', 0)

    return (web >= min_credits) or (openapi >= min_credits)


async def process_generation(ctx: dict, generation_id: int) -> dict:
    """
    Process a single generation

    This is the main ARQ task that gets queued when a generation is created.

    Args:
        ctx: ARQ worker context
        generation_id: ID of the generation to process

    Returns:
        dict with status and message
    """
    # Bind generation context for all logs in this function
    # Keep job_id in logs for backward compatibility with log analysis tools
    gen_logger = bind_job_context(logger, job_id=generation_id)
    gen_logger.info("pipeline:start", msg="generation_processing_started")

    async for db in get_db():
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

            # Select and reserve account atomically (prevents race conditions)
            try:
                account = await account_service.select_and_reserve_account(
                    provider_id=generation.provider_id,
                    user_id=generation.user_id
                )
                gen_logger.info("account_selected", account_id=account.id, provider_id=generation.provider_id)
            except (NoAccountAvailableError, AccountCooldownError) as e:
                gen_logger.warning("no_account_available", error=str(e), error_type=e.__class__.__name__)
                # Requeue generation for later (ARQ will retry)
                raise

            # Refresh credits BEFORE generation to verify account has credits
            credits_data = await refresh_account_credits(account, account_service, gen_logger)
            if credits_data and not has_sufficient_credits(credits_data):
                gen_logger.warning("account_no_credits", account_id=account.id, credits=credits_data)
                # Release this account and mark as exhausted
                await account_service.release_account(account.id)
                await account_service.mark_exhausted(account.id)
                # Raise to retry with different account
                raise AccountExhaustedError(f"Account {account.id} has no credits")

            # Mark generation as started
            await generation_service.mark_started(generation_id)
            gen_logger.info("generation_started")

            # Execute generation via provider
            try:
                submission = await provider_service.execute_generation(
                    generation=generation,
                    account=account,
                    params=generation.canonical_params or generation.raw_params,
                )

                # Note: Concurrency was already incremented by select_and_reserve_account

                gen_logger.info(
                    "provider:submit",
                    provider_job_id=submission.provider_job_id,
                    account_id=account.id,
                    msg="generation_submitted_to_provider"
                )

                # Note: Credits refreshed before submission; status_poller refreshes on completion

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

                # Release account reservation on failure
                try:
                    await account_service.release_account(account.id)
                except Exception as release_err:
                    gen_logger.warning("account_release_failed", error=str(release_err))

                # Note: Credits not refreshed on failure - provider rejects before billing

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
