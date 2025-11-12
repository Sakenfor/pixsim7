"""
ARQ worker configuration - main worker entry point

Combines job processor and status poller into a single worker.

Usage:
    # Start worker
    arq pixsim7_backend.workers.arq_worker.WorkerSettings

    # Or with custom Redis URL
    ARQ_REDIS_URL=redis://localhost:6379/0 arq pixsim7_backend.workers.arq_worker.WorkerSettings
"""
import logging
import os
from arq import cron
from arq.connections import RedisSettings
from pixsim7_backend.workers.job_processor import process_job
from pixsim7_backend.workers.status_poller import poll_job_statuses
from pixsim7_backend.workers.worker_logging import setup_worker_logging

# Setup worker-specific logging
setup_worker_logging(log_level=os.getenv("LOG_LEVEL", "INFO"))

logger = logging.getLogger(__name__)


async def startup(ctx: dict) -> None:
    """
    Worker startup handler

    Called once when the worker starts.
    Initialize any shared resources here.
    """
    logger.info("=" * 60)
    logger.info("🚀 PixSim7 ARQ Worker Starting")
    logger.info("=" * 60)
    logger.info("✅ Job processor registered: process_job")
    logger.info("✅ Status poller registered: poll_job_statuses (every 10s)")
    logger.info("=" * 60)


async def shutdown(ctx: dict) -> None:
    """
    Worker shutdown handler

    Called once when the worker stops.
    Clean up any resources here.
    """
    logger.info("=" * 60)
    logger.info("👋 PixSim7 ARQ Worker Shutting Down")
    logger.info("=" * 60)


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

    # Redis connection
    redis_settings = RedisSettings.from_dsn(
        os.getenv("REDIS_URL", "redis://localhost:6379/0")
    )

    # Task functions that can be queued
    functions = [
        process_job,
        poll_job_statuses,
    ]

    # Cron jobs (periodic tasks)
    cron_jobs = [
        # Poll job statuses every 10 seconds
        cron(
            poll_job_statuses,
            second={0, 10, 20, 30, 40, 50},  # Every 10 seconds
            run_at_startup=True,  # Run immediately on startup
        )
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
    print("  arq pixsim7_backend.workers.arq_worker.WorkerSettings")
