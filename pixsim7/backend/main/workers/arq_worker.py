"""
ARQ worker configuration - main worker entry point

Defines the ARQ worker family:
- WorkerSettings: main generation/automation worker
- GenerationRetryWorkerSettings: deferred generation retry worker
- SimulationWorkerSettings: dedicated world simulation scheduler worker

Usage:
    # Start main worker
    arq pixsim7.backend.main.workers.arq_worker.WorkerSettings

Redis configuration:
    Both the API and worker use the same redis_url from shared settings
    (settings.redis_url). Override via REDIS_URL in .env when needed.
"""

import asyncio
import os

# Load .env file BEFORE any other imports that need env vars
from dotenv import load_dotenv
load_dotenv()

from arq import cron
from arq.connections import RedisSettings
from pixsim7.backend.main.workers.job_processor import process_generation
from pixsim7.automation.workers.automation import process_automation, run_automation_loops, queue_pending_executions
from pixsim7.backend.main.workers.status_poller import poll_job_statuses, poll_generation_once
from pixsim7.backend.main.workers.status_poller_maintenance import (
    requeue_pending_generations,
    reconcile_account_counters,
    recover_stale_processing_generations,
    refresh_stale_account_credits,
)
from pixsim7.backend.main.workers.analysis_processor import process_analysis, requeue_pending_analyses
from pixsim7.backend.main.workers.derivatives_processor import process_derivatives
from pixsim7.backend.main.workers.analysis_backfill import run_analysis_backfill_batch
from pixsim7.automation.services.device_sync_service import poll_device_ads
from pixsim7.backend.main.workers.health import (
    update_main_heartbeat,
    update_retry_heartbeat,
    update_simulation_heartbeat,
    update_automation_heartbeat,
    get_health_tracker,
)
from pixsim7.backend.main.workers.log_cleanup import cleanup_old_logs
from pixsim7.backend.main.workers.world_simulation import tick_active_worlds
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.infrastructure.queue import (
    GENERATION_FRESH_QUEUE_NAME,
    GENERATION_RETRY_QUEUE_NAME,
    SIMULATION_SCHEDULER_QUEUE_NAME,
    AUTOMATION_QUEUE_NAME,
)
from pixsim7.backend.main.shared.debug import load_global_debug_from_env
from pixsim_logging import configure_logging, configure_stdlib_root_logger, bind_domain_context
from pixsim7.backend.main.services.account_event_service import AccountEventService
import logging as stdlib_logging
from pixsim7.backend.main.infrastructure.events.redis_bridge import (
    start_event_bus_bridge,
    stop_event_bus_bridge,
)
from pixsim7.backend.main.infrastructure.sleep_inhibit import inhibit_sleep, allow_sleep
from pixsim7.backend.main.infrastructure.database.session import close_database

# Configure structured logging and optional ingestion via env
logger = configure_logging("worker").bind(channel="system", domain="system")
configure_stdlib_root_logger()


_event_bridge = None
_retry_event_bridge = None


def _redis_settings() -> RedisSettings:
    s = RedisSettings.from_dsn(settings.redis_url)
    s.conn_retries = 20
    s.retry_on_timeout = True
    return s


def _sync_preload_system_config() -> None:
    """Pre-load DB-persisted config so class-level attributes see updated values.

    Uses a temporary event loop. Must dispose the engine afterward so pooled
    connections don't linger bound to the closed loop (causes
    'Event loop is closed' errors when ARQ's own loop later tries to clean up).
    """
    import asyncio
    try:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_load_persisted_system_config_for_worker())
        loop.run_until_complete(close_database())
        loop.close()
    except Exception:
        pass  # Falls back to env var / Pydantic default


async def _load_persisted_system_config_for_worker() -> None:
    """Best-effort load of persisted system config into worker process memory."""
    try:
        from pixsim7.backend.main.infrastructure.database.session import get_async_session
        from pixsim7.backend.main.services.system_config import apply_all_from_db
        import pixsim7.backend.main.services.system_config.appliers  # noqa: F401

        async with get_async_session() as db:
            # Migrate file-based settings to DB on first run
            from pixsim7.backend.main.services.system_config.migration import migrate_file_settings_to_db
            migrated = await migrate_file_settings_to_db(db)
            if migrated:
                logger.info("worker_system_config_migrated", namespaces=migrated)

            applied = await apply_all_from_db(db)
        if applied:
            logger.info("worker_system_config_loaded", namespaces=applied)
    except Exception as e:
        logger.warning("worker_system_config_load_failed", error=str(e))


async def reload_logging_config(ctx: dict) -> None:
    """Periodic reload of logging config from DB so UI changes take effect in worker."""
    try:
        from pixsim7.backend.main.infrastructure.database.session import get_async_session
        from pixsim7.backend.main.services.system_config import get_config, apply_namespace
        import pixsim7.backend.main.services.system_config.appliers  # noqa: F401

        async with get_async_session() as db:
            data = await get_config(db, "logging")
        if data:
            apply_namespace("logging", data)
    except Exception:
        pass  # Best-effort; next cycle will retry


def _normalize_arq_logger_handlers() -> None:
    """Drop ARQ's default plain-text handler so events flow once via pixsim_logging.

    The `arq` CLI applies its own logging dictConfig after importing this module.
    That handler emits `%(asctime)s: %(message)s` lines in parallel with the
    structured stdlib root handler configured by pixsim_logging, causing duplicates.
    """
    removed = 0
    for logger_name in ("arq", "arq.worker"):
        arq_logger = stdlib_logging.getLogger(logger_name)
        for handler in list(arq_logger.handlers):
            arq_logger.removeHandler(handler)
            removed += 1
        arq_logger.propagate = True
        arq_logger.disabled = False
    if removed:
        logger.info("arq_logger_handlers_removed", removed_handlers=removed)


async def startup(ctx: dict) -> None:
    """
    Worker startup handler

    Called once when the worker starts.
    Initialize any shared resources here.
    """
    # Initialize account event satellite handler
    AccountEventService.initialize()
    _normalize_arq_logger_handlers()
    get_health_tracker()

    global _event_bridge

    # Log effective log level for diagnostics
    import logging as stdlib_logging
    effective_level = stdlib_logging.getLogger().level
    level_name = stdlib_logging.getLevelName(effective_level)
    logger.info(
        "worker_start",
        msg="PixSim7 ARQ Worker Starting",
        log_level=level_name,
        log_level_env=os.getenv("LOG_LEVEL", "not set")
    )

    # Initialize global worker debug flags from environment (if set)
    debug_flags = load_global_debug_from_env()
    if debug_flags:
        enabled = [name for name, enabled in debug_flags.items() if enabled]
        logger.info("worker_debug_flags", flags=",".join(sorted(enabled)))
    else:
        logger.info("worker_debug_flags", flags="none")

    # Register providers (required for generation processing)
    from pixsim7.backend.main.domain.providers.registry import register_default_providers
    await _load_persisted_system_config_for_worker()
    register_default_providers()
    logger.info("worker_providers_registered", msg="Provider plugins loaded")

    # Bind automation protocol locator — harmless in main worker (no automation
    # callers today) but future-proofs any route handler that ends up here.
    from pixsim7.backend.main.automation_adapters import bind_automation_capabilities
    bind_automation_capabilities()
    logger.info("worker_component_registered", component="process_generation")
    logger.info("worker_component_registered", component="process_analysis")
    logger.info("worker_component_registered", component="process_derivatives")
    logger.info("worker_component_registered", component="run_analysis_backfill_batch")
    logger.info("worker_component_registered", component="poll_job_statuses", schedule="*/2s")
    logger.info("worker_component_registered", component="requeue_pending_generations", schedule="*/30s")
    logger.info("worker_component_registered", component="requeue_pending_analyses", schedule="*/30s")
    logger.info("worker_component_registered", component="update_main_heartbeat", schedule="*/30s")
    logger.info(
        "worker_component_externalized",
        component="tick_active_worlds",
        worker="SimulationWorkerSettings",
        queue=SIMULATION_SCHEDULER_QUEUE_NAME,
    )
    logger.info(
        "worker_component_externalized",
        component="process_automation",
        worker="AutomationWorkerSettings",
        queue=AUTOMATION_QUEUE_NAME,
    )

    logger.info(
        "worker_effective_config",
        arq_max_jobs=settings.arq_max_jobs,
    )

    # Recover stale PROCESSING generations (from crash/sleep — must run before counter reconcile)
    try:
        stale_result = await recover_stale_processing_generations(ctx)
        if stale_result.get("failed", 0) > 0:
            logger.info(
                "startup_stale_recovery_complete",
                failed=stale_result["failed"],
                errors=stale_result.get("errors", 0),
            )
    except Exception as e:
        logger.warning("startup_stale_recovery_failed", error=str(e))

    # Reconcile account counters on startup (fixes counter drift from crashes)
    try:
        reconcile_result = await reconcile_account_counters(ctx)
        if reconcile_result.get("reconciled", 0) > 0:
            logger.info(
                "startup_reconciliation_complete",
                reconciled=reconcile_result.get("reconciled", 0),
                errors=reconcile_result.get("errors", 0),
            )
    except Exception as e:
        logger.warning("startup_reconciliation_failed", error=str(e))

    # Start distributed event bridge
    _event_bridge = await start_event_bus_bridge(role="arq_worker")

    # Send initial heartbeat
    await update_main_heartbeat(ctx)

    # Prevent Windows from sleeping while the worker is active
    inhibit_sleep()


async def _drain_arq_pool(ctx: dict) -> None:
    """Force-close arq's Redis pool connections before arq's own pool.close() runs.

    arq cancels its main_task (poll loop) and job tasks before calling on_shutdown.
    If any were mid-pipeline (WATCH/MULTI/EXEC) when cancelled, their connections
    return to the pool with dirty transaction state. arq's subsequent
    pool.close(close_connection_pool=True) then reuses one of those connections and
    raises ExecAbortError: "Transaction discarded because of previous errors".

    Disconnecting all connections here (including in-use ones) severs any half-built
    transactions cleanly, so arq's cleanup has nothing poisoned to trip over.
    """
    pool = ctx.get("redis")
    if pool is None:
        return
    try:
        # Yield once so any just-cancelled pipeline coroutines can unwind first.
        await asyncio.sleep(0)
        await pool.connection_pool.disconnect(inuse_connections=True)
    except Exception as e:
        logger.warning("worker_shutdown_arq_pool_drain_error", error=str(e))


async def shutdown(ctx: dict) -> None:
    """
    Worker shutdown handler

    Called once when the worker stops.
    Clean up any resources here.
    """
    global _event_bridge
    logger.info("worker_shutdown", msg="PixSim7 ARQ Worker Shutting Down")

    if _event_bridge:
        try:
            await stop_event_bus_bridge()
        except Exception as e:
            logger.warning("worker_shutdown_event_bridge_error", error=str(e))
        _event_bridge = None

    try:
        AccountEventService.shutdown()
    except Exception as e:
        logger.warning("worker_shutdown_account_event_error", error=str(e))

    await _drain_arq_pool(ctx)

    try:
        await close_database()
    except Exception as e:
        logger.warning("worker_shutdown_database_close_error", error=str(e))

    allow_sleep()


async def retry_startup(ctx: dict) -> None:
    """Startup for generation retry worker (no cron/bootstrap side effects)."""
    global _retry_event_bridge
    AccountEventService.initialize()
    _normalize_arq_logger_handlers()
    get_health_tracker()
    logger.info("worker_start", msg="PixSim7 Generation Retry Worker Starting")

    debug_flags = load_global_debug_from_env()
    if debug_flags:
        enabled = [name for name, enabled in debug_flags.items() if enabled]
        logger.info("worker_debug_flags", flags=",".join(sorted(enabled)))

    from pixsim7.backend.main.domain.providers.registry import register_default_providers

    await _load_persisted_system_config_for_worker()
    register_default_providers()
    logger.info("worker_component_registered", component="process_generation", queue=GENERATION_RETRY_QUEUE_NAME)
    logger.info("worker_component_registered", component="update_retry_heartbeat", schedule="*/30s")
    _retry_event_bridge = await start_event_bus_bridge(role="arq_generation_retry_worker")
    await update_retry_heartbeat(ctx)


async def retry_shutdown(ctx: dict) -> None:
    """Shutdown for generation retry worker."""
    global _retry_event_bridge
    logger.info("worker_shutdown", msg="PixSim7 Generation Retry Worker Shutting Down")

    if _retry_event_bridge:
        try:
            await stop_event_bus_bridge()
        except Exception as e:
            logger.warning("worker_shutdown_event_bridge_error", error=str(e))
        _retry_event_bridge = None

    try:
        AccountEventService.shutdown()
    except Exception as e:
        logger.warning("worker_shutdown_account_event_error", error=str(e))

    await _drain_arq_pool(ctx)

    try:
        await close_database()
    except Exception as e:
        logger.warning("worker_shutdown_database_close_error", error=str(e))


async def simulation_startup(ctx: dict) -> None:
    """Startup for dedicated simulation scheduler worker."""
    _normalize_arq_logger_handlers()
    get_health_tracker()
    logger.info("worker_start", msg="PixSim7 Simulation Scheduler Worker Starting")
    await _load_persisted_system_config_for_worker()
    logger.info(
        "worker_component_registered",
        component="tick_active_worlds",
        schedule="*/5s",
        queue=SIMULATION_SCHEDULER_QUEUE_NAME,
    )
    logger.info("worker_component_registered", component="update_simulation_heartbeat", schedule="*/30s")
    await update_simulation_heartbeat(ctx)


async def simulation_shutdown(ctx: dict) -> None:
    """Shutdown for dedicated simulation scheduler worker."""
    logger.info("worker_shutdown", msg="PixSim7 Simulation Scheduler Worker Shutting Down")
    await _drain_arq_pool(ctx)
    try:
        await close_database()
    except Exception as e:
        logger.warning("worker_shutdown_database_close_error", error=str(e))


async def automation_startup(ctx: dict) -> None:
    """Startup for dedicated automation worker."""
    _normalize_arq_logger_handlers()
    get_health_tracker()
    logger.info("worker_start", msg="PixSim7 Automation Worker Starting")

    debug_flags = load_global_debug_from_env()
    if debug_flags:
        enabled = [name for name, enabled in debug_flags.items() if enabled]
        logger.info("worker_debug_flags", flags=",".join(sorted(enabled)))

    from pixsim7.backend.main.domain.providers.registry import register_default_providers
    await _load_persisted_system_config_for_worker()
    register_default_providers()

    # Bind automation protocol locator — callers in this worker process
    # (process_automation, loops, queue_pending_executions) need the adapters.
    from pixsim7.backend.main.automation_adapters import bind_automation_capabilities
    bind_automation_capabilities()

    logger.info("worker_component_registered", component="process_automation", queue=AUTOMATION_QUEUE_NAME)
    logger.info("worker_component_registered", component="run_automation_loops", schedule="*/30s")
    logger.info("worker_component_registered", component="queue_pending_executions", schedule="*/15s")
    logger.info("worker_component_registered", component="poll_device_ads", schedule="*/5s")
    logger.info("worker_component_registered", component="update_automation_heartbeat", schedule="*/30s")

    await update_automation_heartbeat(ctx)


async def automation_shutdown(ctx: dict) -> None:
    """Shutdown for dedicated automation worker."""
    logger.info("worker_shutdown", msg="PixSim7 Automation Worker Shutting Down")
    await _drain_arq_pool(ctx)
    try:
        await close_database()
    except Exception as e:
        logger.warning("worker_shutdown_database_close_error", error=str(e))


_sync_preload_system_config()


class WorkerSettings:
    """
    ARQ worker settings

    This class configures the ARQ worker with:
    - Redis connection
    - Task functions
    - Cron jobs (periodic tasks)
    - Startup/shutdown handlers
    - Worker configuration (max jobs, timeouts, retries)
    """

    # Redis connection (shared with API via settings.redis_url)
    redis_settings = _redis_settings()
    queue_name = GENERATION_FRESH_QUEUE_NAME

    # Task functions that can be queued
    functions = [
        process_generation,
        process_analysis,
        process_derivatives,
        run_analysis_backfill_batch,
        poll_job_statuses,
        poll_generation_once,
        requeue_pending_generations,
        requeue_pending_analyses,
        refresh_stale_account_credits,
        cleanup_old_logs,
        reload_logging_config,
    ]

    # Cron jobs (periodic tasks)
    cron_jobs = [
        # Poll job statuses every 2 seconds (fast enough for early CDN,
        # guarded by _poll_in_flight to prevent duplicate processing)
        cron(
            poll_job_statuses,
            second={0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58},  # Every 2 seconds
            run_at_startup=True,  # Run immediately on startup
        ),
        # Requeue stuck pending generations every 30 seconds
        cron(
            requeue_pending_generations,
            second={15, 45},  # Every 30 seconds (offset from heartbeat)
            run_at_startup=True,  # Check immediately on startup to pick up old stuck jobs
        ),
        # Requeue stuck pending analyses every 30 seconds
        cron(
            requeue_pending_analyses,
            second={20, 50},  # Every 30 seconds (offset from generations)
            run_at_startup=True,
        ),
        # Update worker heartbeat every 30 seconds
        cron(
            update_main_heartbeat,
            second={0, 30},
            run_at_startup=False,  # Will be called in startup
        ),
        # Reconcile account counters every 5 minutes
        cron(
            reconcile_account_counters,
            minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},
            second={5},
            run_at_startup=False,
        ),
        # Refresh stale account credits every 10 minutes
        # Catches idle accounts with expired sessions that the poller misses.
        # run_at_startup=True so deploys/restarts immediately reconcile credits.
        cron(
            refresh_stale_account_credits,
            minute={3, 13, 23, 33, 43, 53},
            second={30},
            run_at_startup=True,
        ),
        # Purge old log entries daily at 03:00
        cron(
            cleanup_old_logs,
            hour={3},
            minute={0},
            second={0},
            run_at_startup=False,
        ),
        # Reload logging config from DB every 60s (picks up UI changes)
        cron(
            reload_logging_config,
            second={10},  # Once per minute, offset from heartbeat
            run_at_startup=False,  # Already loaded in startup
        ),
    ]

    # Lifecycle handlers
    on_startup = startup
    on_shutdown = shutdown

    # Worker configuration
    max_jobs = settings.arq_max_jobs  # Max concurrent jobs (DB-persisted or env ARQ_MAX_JOBS)
    job_timeout = int(os.getenv("ARQ_JOB_TIMEOUT", "3600"))  # 1 hour timeout
    max_tries = int(os.getenv("ARQ_MAX_TRIES", "3"))  # Retry failed jobs 3 times
    retry_jobs = True

    # Logging
    log_results = True
    verbose = True

    # Health check
    health_check_interval = 60  # Check worker health every 60 seconds


class GenerationRetryWorkerSettings:
    """ARQ worker for deferred/retry generation jobs only."""

    redis_settings = _redis_settings()
    queue_name = GENERATION_RETRY_QUEUE_NAME

    functions = [
        process_generation,
        reload_logging_config,
    ]
    cron_jobs = [
        cron(
            update_retry_heartbeat,
            second={0, 30},
            run_at_startup=False,
        ),
        cron(
            reload_logging_config,
            second={10},
            run_at_startup=False,
        ),
    ]

    on_startup = retry_startup
    on_shutdown = retry_shutdown

    max_jobs = settings.arq_max_jobs
    job_timeout = int(os.getenv("ARQ_JOB_TIMEOUT", "3600"))
    max_tries = int(os.getenv("ARQ_MAX_TRIES", "3"))
    retry_jobs = True

    log_results = True
    verbose = True
    health_check_interval = 60


class SimulationWorkerSettings:
    """ARQ worker dedicated to periodic world simulation scheduling."""

    redis_settings = _redis_settings()
    queue_name = SIMULATION_SCHEDULER_QUEUE_NAME

    functions = [
        tick_active_worlds,
    ]

    cron_jobs = [
        cron(
            tick_active_worlds,
            second={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},
            run_at_startup=False,
        ),
        cron(
            update_simulation_heartbeat,
            second={0, 30},
            run_at_startup=False,
        ),
    ]

    on_startup = simulation_startup
    on_shutdown = simulation_shutdown

    max_jobs = int(os.getenv("ARQ_SIMULATION_MAX_JOBS", "2"))
    job_timeout = int(os.getenv("ARQ_SIMULATION_JOB_TIMEOUT", "120"))
    max_tries = 1
    retry_jobs = False

    log_results = True
    verbose = True
    health_check_interval = 60


class AutomationWorkerSettings:
    """ARQ worker dedicated to device automation execution.

    Isolated from the main generation worker so automation jobs (ADB device
    control, potentially long-running) cannot eat generation processing slots.
    """

    redis_settings = _redis_settings()
    queue_name = AUTOMATION_QUEUE_NAME

    functions = [
        process_automation,
        run_automation_loops,
        queue_pending_executions,
        poll_device_ads,
        reload_logging_config,
    ]

    cron_jobs = [
        # Run automation loops every 30 seconds
        cron(run_automation_loops, second={0, 30}, run_at_startup=True),
        # Queue pending executions every 15 seconds (picks up stuck/manual)
        cron(queue_pending_executions, second={0, 15, 30, 45}, run_at_startup=True),
        # Poll device ad activity every 5 seconds
        cron(
            poll_device_ads,
            second={2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57},
            run_at_startup=True,
        ),
        # Heartbeat every 30 seconds
        cron(update_automation_heartbeat, second={0, 30}, run_at_startup=False),
        # Reload logging config from DB every 60s
        cron(reload_logging_config, second={10}, run_at_startup=False),
    ]

    on_startup = automation_startup
    on_shutdown = automation_shutdown

    # Automation is device-bound — concurrency is limited by physical devices.
    max_jobs = int(os.getenv("ARQ_AUTOMATION_MAX_JOBS", "5"))
    # Allow up to 30 minutes for multi-step automation flows.
    job_timeout = int(os.getenv("ARQ_AUTOMATION_JOB_TIMEOUT", "1800"))
    # Don't auto-retry — device state is dirty after a mid-run failure.
    # The loop service handles rescheduling via business logic.
    max_tries = 1
    retry_jobs = False

    log_results = True
    verbose = True
    health_check_interval = 60


# For testing/debugging
if __name__ == "__main__":
    print("PixSim7 ARQ Worker Configuration")
    print("=" * 60)
    print(f"Redis: {WorkerSettings.redis_settings}")
    print(f"Functions: {[f.__name__ for f in WorkerSettings.functions]}")
    print(f"Cron jobs: {len(WorkerSettings.cron_jobs)}")
    print(f"Max jobs: {WorkerSettings.max_jobs}")
    print(f"Job timeout: {WorkerSettings.job_timeout}s")
    print(f"Max tries: {WorkerSettings.max_tries}")
    print("=" * 60)
    print("\nTo start worker, run:")
    print("  arq pixsim7.backend.main.workers.arq_worker.WorkerSettings")
    print("  arq pixsim7.backend.main.workers.arq_worker.GenerationRetryWorkerSettings")
    print("  arq pixsim7.backend.main.workers.arq_worker.SimulationWorkerSettings")
    print("  arq pixsim7.backend.main.workers.arq_worker.AutomationWorkerSettings")
