"""
ARQ worker configuration - main worker entry point

Combines job processor and status poller into a single worker.

Usage:
    # Start worker
    arq pixsim7.backend.main.workers.arq_worker.WorkerSettings

Redis configuration:
    Both the API and worker use the same redis_url from shared settings
    (settings.redis_url). Override via REDIS_URL in .env when needed.
"""

import os

# Load .env file BEFORE any other imports that need env vars
from dotenv import load_dotenv
load_dotenv()

from arq import cron
from arq.connections import RedisSettings
from pixsim7.backend.main.workers.job_processor import process_generation
from pixsim7.backend.main.workers.automation import process_automation, run_automation_loops, queue_pending_executions
from pixsim7.backend.main.workers.status_poller import poll_job_statuses, requeue_pending_generations, reconcile_account_counters
from pixsim7.backend.main.workers.analysis_processor import process_analysis, requeue_pending_analyses
from pixsim7.backend.main.workers.health import update_heartbeat, get_health_tracker
from pixsim7.backend.main.workers.world_simulation import tick_active_worlds, SIMULATION_ENABLED
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.shared.debug import load_global_debug_from_env
from pixsim_logging import configure_logging
import logging as stdlib_logging
from pixsim7.backend.main.infrastructure.events.redis_bridge import (
    start_event_bus_bridge,
    stop_event_bus_bridge,
)

# Configure structured logging and optional ingestion via env
logger = configure_logging("worker")

# Configure root logger to capture ALL logging.getLogger() calls
# This ensures any module using standard logging will output to stdout
root_logger = stdlib_logging.getLogger()
if not root_logger.handlers:
    # Add console handler to root logger
    console_handler = stdlib_logging.StreamHandler()
    console_handler.setLevel(stdlib_logging.DEBUG)

    # Use human-readable format when PIXSIM_LOG_FORMAT=human
    if os.getenv("PIXSIM_LOG_FORMAT", "json").lower() == "human":
        formatter = stdlib_logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%H:%M:%S'
        )
    else:
        # JSON format for structured logging
        formatter = stdlib_logging.Formatter('%(message)s')

    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    root_logger.setLevel(stdlib_logging.INFO)  # Default to INFO

# Set root logger level from LOG_LEVEL env if provided
log_level_env = os.getenv("LOG_LEVEL", "INFO").upper()
if log_level_env in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
    root_logger.setLevel(getattr(stdlib_logging, log_level_env))


_event_bridge = None


async def startup(ctx: dict) -> None:
    """
    Worker startup handler

    Called once when the worker starts.
    Initialize any shared resources here.
    """
    # Initialize health tracker
    health = get_health_tracker()

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
    register_default_providers()
    logger.info("worker_providers_registered", msg="Provider plugins loaded")
    logger.info("worker_component_registered", component="process_generation")
    logger.info("worker_component_registered", component="process_automation")
    logger.info("worker_component_registered", component="process_analysis")
    logger.info("worker_component_registered", component="poll_job_statuses", schedule="*/10s")
    logger.info("worker_component_registered", component="run_automation_loops", schedule="*/30s")
    logger.info("worker_component_registered", component="queue_pending_executions", schedule="*/15s")
    logger.info("worker_component_registered", component="requeue_pending_generations", schedule="*/30s")
    logger.info("worker_component_registered", component="requeue_pending_analyses", schedule="*/30s")
    logger.info("worker_component_registered", component="update_heartbeat", schedule="*/30s")
    if SIMULATION_ENABLED:
        logger.info("worker_component_registered", component="tick_active_worlds", schedule="*/5s")
    else:
        logger.info("worker_simulation_disabled", msg="World simulation disabled (set SIMULATION_ENABLED=true to enable)")

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
    await update_heartbeat(ctx)


async def shutdown(ctx: dict) -> None:
    """
    Worker shutdown handler

    Called once when the worker stops.
    Clean up any resources here.
    """
    global _event_bridge
    logger.info("worker_shutdown", msg="PixSim7 ARQ Worker Shutting Down")
    if _event_bridge:
        await stop_event_bus_bridge()
        _event_bridge = None


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
    redis_settings = RedisSettings.from_dsn(settings.redis_url)

    # Task functions that can be queued
    functions = [
        process_generation,
        process_automation,
        process_analysis,
        poll_job_statuses,
        run_automation_loops,
        queue_pending_executions,
        requeue_pending_generations,
        requeue_pending_analyses,
        tick_active_worlds,
    ]

    # Cron jobs (periodic tasks)
    cron_jobs = [
        # Poll job statuses every 10 seconds
        cron(
            poll_job_statuses,
            second={0, 10, 20, 30, 40, 50},  # Every 10 seconds
            run_at_startup=True,  # Run immediately on startup
        ),
        # Run automation loops every 30 seconds
        cron(
            run_automation_loops,
            second={0, 30},
            run_at_startup=True,
        ),
        # Queue pending executions every 15 seconds (picks up stuck/manual executions)
        cron(
            queue_pending_executions,
            second={0, 15, 30, 45},  # Every 15 seconds
            run_at_startup=True,  # Check immediately on startup
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
            update_heartbeat,
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
        # Tick active worlds every 5 seconds (if SIMULATION_ENABLED=true)
        # This runs NPC behavior simulation, activity selection, and effects
        cron(
            tick_active_worlds,
            second={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},  # Every 5 seconds
            run_at_startup=False,  # Wait for first interval before starting
        ),
    ]

    # Lifecycle handlers
    on_startup = startup
    on_shutdown = shutdown

    # Worker configuration
    max_jobs = int(os.getenv("ARQ_MAX_JOBS", "10"))  # Max concurrent jobs
    job_timeout = int(os.getenv("ARQ_JOB_TIMEOUT", "3600"))  # 1 hour timeout
    max_tries = int(os.getenv("ARQ_MAX_TRIES", "3"))  # Retry failed jobs 3 times
    retry_jobs = True

    # Logging
    log_results = True
    verbose = True

    # Health check
    health_check_interval = 60  # Check worker health every 60 seconds


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
