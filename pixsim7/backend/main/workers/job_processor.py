"""
Generation processor worker — thin ARQ transport host.

This module is a *process role*: it owns the queue/concurrency/lifecycle and the
ARQ ``WorkerSettings``. The actual processing logic is host-agnostic and lives in
``services/generation/processing`` (worker-thin-host-canon plan). ``process_generation``
is glue: it derives ``is_final_try``/``job_try`` from the arq ctx, calls
``GenerationProcessingService.process(...)``, and translates the returned
``ProcessingOutcome`` back into ARQ's dict-or-raise convention.

Processing logic lives under services/generation/processing/:
- processing.service: GenerationProcessingService (the orchestration)
- processing.errors: Error classification (EXPECTED_ERRORS, retryability checks)
- processing.account_ops: Credit verification, account reservation/release/cooldown
- processing.requeue: Requeue-for-rotation and pinned-generation deferral
"""
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.infrastructure.events.redis_bridge import (
    start_event_bus_bridge,
    stop_event_bus_bridge,
)
from pixsim_logging import configure_logging

from pixsim7.backend.main.services.generation.processing.outcome import ProcessingOutcome
from pixsim7.backend.main.services.generation.processing.service import (
    GenerationProcessingService,
    _is_final_try,
)

# Back-compat re-exports: a few pure helpers/constants are imported as values
# from this module by callers/tests. The orchestration logic itself now lives in
# services.generation.processing.service; patch-based tests target that module.
from pixsim7.backend.main.services.generation.processing.service import (  # noqa: F401
    _count_submissions_in_current_round,
    _quota_rotation_requeue_defer_seconds,
    _is_auth_rotation_error,
    EXPECTED_ERRORS,
    GENERATION_RETRY_QUEUE_NAME,
)

logger = configure_logging("worker").bind(channel="pipeline", domain="generation")


async def process_generation(ctx: dict, generation_id: int) -> dict:
    """ARQ task: process one pending generation.

    Thin transport glue — derives retry context from the arq ctx and delegates
    to the host-agnostic ``GenerationProcessingService``, then re-raises (so ARQ
    retries) or returns the terminal result dict per the ``ProcessingOutcome``.
    """
    outcome = await GenerationProcessingService().process(
        generation_id,
        is_final_try=_is_final_try(ctx),
        job_try=ctx.get("job_try", 1),
    )
    if outcome.raise_for_retry:
        raise outcome.error  # type: ignore[misc]
    return outcome.result  # type: ignore[return-value]


_event_bridge = None


async def on_startup(ctx: dict) -> None:
    """ARQ worker startup"""
    global _event_bridge
    logger.info("worker_started", component="generation_processor")
    _event_bridge = await start_event_bus_bridge(role="generation_processor")


async def on_shutdown(ctx: dict) -> None:
    """ARQ worker shutdown"""
    global _event_bridge
    logger.info("worker_shutdown", component="generation_processor")
    if _event_bridge:
        await stop_event_bus_bridge()
        _event_bridge = None


# ARQ task configuration
class WorkerSettings:
    """ARQ worker settings for generation processor"""
    functions = [process_generation]
    on_startup = on_startup
    on_shutdown = on_shutdown
    redis_settings = settings.redis_url
