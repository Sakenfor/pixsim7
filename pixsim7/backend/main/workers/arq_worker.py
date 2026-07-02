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

from typing import Optional

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
from pixsim7.backend.main.workers.chain_execution_processor import (
    process_chain_execution,
    process_ephemeral_chain_execution,
    process_ephemeral_fanout_execution,
)
from pixsim7.backend.main.workers.derivatives_processor import process_derivatives
from pixsim7.backend.main.workers.relocation_processor import process_relocation
from pixsim7.backend.main.workers.restore_processor import process_restore
from pixsim7.backend.main.workers.ingestion_processor import process_ingestion
from pixsim7.backend.main.workers.prompt_tagging_processor import process_prompt_tagging
from pixsim7.backend.main.workers.prompt_embedding_processor import process_prompt_embedding
from pixsim7.backend.main.workers.analysis_backfill import run_analysis_backfill_batch
from pixsim7.backend.main.workers.signal_backfill import run_signal_backfill_batch
from pixsim7.automation.services.device_sync_service import poll_device_ads, poll_device_reconnects
from pixsim7.backend.main.workers.health import (
    update_main_heartbeat,
    update_retry_heartbeat,
    update_simulation_heartbeat,
    update_automation_heartbeat,
    update_media_maintenance_heartbeat,
    update_derivatives_heartbeat,
)
from pixsim7.backend.main.workers.log_cleanup import cleanup_old_logs
from pixsim7.backend.main.workers.world_simulation import tick_active_worlds
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.workers.worker_families import (
    BY_ROLE,
    WORKER_ROLE_AUTOMATION,
    WORKER_ROLE_MAIN,
    WORKER_ROLE_MEDIA_MAINTENANCE,
    WORKER_ROLE_DERIVATIVES,
    WORKER_ROLE_RETRY,
    WORKER_ROLE_SIMULATION,
)
from pixsim7.backend.main.infrastructure.queue import (
    GENERATION_FRESH_QUEUE_NAME,
    GENERATION_RETRY_QUEUE_NAME,
    SIMULATION_SCHEDULER_QUEUE_NAME,
    AUTOMATION_QUEUE_NAME,
    MEDIA_MAINTENANCE_QUEUE_NAME,
    DERIVATIVES_QUEUE_NAME,
)
from pixsim7.backend.main.workers.lifecycle import (
    build_worker_lifecycle,
    logger,
    _sync_preload_system_config,
)


def _redis_settings() -> RedisSettings:
    s = RedisSettings.from_dsn(settings.redis_url)
    s.conn_retries = 20
    s.retry_on_timeout = True
    return s


async def reload_logging_config(ctx: dict) -> None:
    """Reload logging config from DB.

    Two callers in this worker:
    - Periodic cron (fallback / catches missed events).
    - Event-bus subscriber below (sub-second push from backend admin patch).
    """
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


# Module-level event subscription: react to backend logging-config patches
# in sub-second time instead of waiting for the periodic cron. The Redis
# event bridge (started during worker startup) routes the published event
# from the backend into the local event_bus, which fires this handler.
def _register_system_config_subscriber() -> None:
    from pixsim7.backend.main.infrastructure.events.bus import event_bus, register_event_type

    register_event_type(
        "system_config:reloaded",
        description="A persisted system_config namespace was patched and should be reloaded by other processes.",
        payload_schema={"namespace": "str — namespace key (e.g. 'logging')"},
        source="backend.api.v1.admin",
    )

    async def _on_system_config_reloaded(event) -> None:
        namespace = (event.data or {}).get("namespace")
        if not namespace:
            return
        if namespace == "logging":
            # Dedicated path (also reconciles the in-memory display).
            try:
                await reload_logging_config({})
                logger.info("worker_logging_config_reloaded_via_event")
            except Exception as e:
                logger.warning("worker_logging_config_reload_failed", error=str(e))
            return
        # Generic path for every other namespace that has a registered applier
        # (e.g. 'storage_roots' — rebuilds the worker's tiered storage service so
        # a relocate job picks up an endpoint change without a worker restart).
        try:
            from pixsim7.backend.main.infrastructure.database.session import get_async_session
            from pixsim7.backend.main.services.system_config import get_config, apply_namespace
            import pixsim7.backend.main.services.system_config.appliers  # noqa: F401

            async with get_async_session() as db:
                data = await get_config(db, namespace)
            apply_namespace(namespace, data or {})
            logger.info("worker_system_config_reloaded_via_event", namespace=namespace)
        except Exception as e:
            logger.warning("worker_system_config_reload_failed", namespace=namespace, error=str(e))

    event_bus.subscribe("system_config:reloaded", _on_system_config_reloaded)


_register_system_config_subscriber()


# ---------------------------------------------------------------------------
# Per-family lifecycle handlers, built from the shared build_worker_lifecycle
# skeleton. Only the genuine per-family variation lives below: the startup
# reconcilers (self-guarding coroutines), the component-registered "announcement"
# logs (pure data), and the factory flags. The uniform core (logger normalize ->
# health tracker -> worker_start -> persisted-config load -> heartbeat; and, on
# shutdown, drain -> close_database) lives once in workers/lifecycle.py.
# ---------------------------------------------------------------------------


async def _startup_recover_stale(ctx: dict) -> None:
    """Recover stale PROCESSING generations (from crash/sleep — must run before
    the counter reconcile). Self-guarding: logs its own success/failure."""
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


async def _startup_reconcile_counters(ctx: dict) -> None:
    """Reconcile account counters on startup (fixes counter drift from crashes)."""
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


async def _reconcile_relocation_on_startup() -> Optional[str]:
    from pixsim7.backend.main.workers.relocation_processor import (
        reconcile_orphaned_relocation_job,
    )
    return await reconcile_orphaned_relocation_job()


async def _reconcile_restore_on_startup() -> Optional[str]:
    from pixsim7.backend.main.workers.restore_processor import (
        reconcile_orphaned_restore_job,
    )
    return await reconcile_orphaned_restore_job()


async def _startup_media_maintenance_reconcile(ctx: dict) -> None:
    """Retire any relocation/restore job left non-terminal by a crash/restart so
    the UI doesn't show a phantom in-flight job. This belongs on the
    media-maintenance family, NOT the main worker: relocation/restore run
    exclusively here, so only *this* worker's startup actually implies "no batch
    is mid-flight". Running it from the main worker would both miss orphans (this
    worker can die while main stays up) and false-positive a live job (main
    restarts mid-batch)."""
    for reconcile in (_reconcile_relocation_on_startup, _reconcile_restore_on_startup):
        try:
            retired = await reconcile()
            if retired:
                logger.info("startup_media_maintenance_reconcile_complete", job_id=retired)
        except Exception as e:
            logger.warning("startup_media_maintenance_reconcile_failed", error=str(e))


# Per-family "announcements": component-registered / effective-config log lines.
# Pure data (no side effects), emitted verbatim after the bind step.
_MAIN_ANNOUNCEMENTS = [
    ("worker_component_registered", {"component": "process_generation"}),
    ("worker_component_registered", {"component": "process_analysis"}),
    ("worker_component_registered", {"component": "process_derivatives"}),
    ("worker_component_registered", {"component": "process_ingestion"}),
    ("worker_component_registered", {"component": "process_prompt_tagging"}),
    ("worker_component_registered", {"component": "process_prompt_embedding"}),
    ("worker_component_registered", {"component": "process_chain_execution"}),
    ("worker_component_registered", {"component": "process_ephemeral_chain_execution"}),
    ("worker_component_registered", {"component": "process_ephemeral_fanout_execution"}),
    ("worker_component_registered", {"component": "run_analysis_backfill_batch"}),
    ("worker_component_registered", {"component": "poll_job_statuses", "schedule": "*/2s"}),
    ("worker_component_registered", {"component": "requeue_pending_generations", "schedule": "*/30s"}),
    ("worker_component_registered", {"component": "requeue_pending_analyses", "schedule": "*/30s"}),
    ("worker_component_registered", {"component": "update_main_heartbeat", "schedule": "*/30s"}),
    ("worker_component_externalized", {
        "component": "tick_active_worlds",
        "worker": "SimulationWorkerSettings",
        "queue": SIMULATION_SCHEDULER_QUEUE_NAME,
    }),
    ("worker_component_externalized", {
        "component": "process_automation",
        "worker": "AutomationWorkerSettings",
        "queue": AUTOMATION_QUEUE_NAME,
    }),
    ("worker_effective_config", {"arq_max_jobs": settings.arq_max_jobs}),
]

_RETRY_ANNOUNCEMENTS = [
    ("worker_component_registered", {"component": "process_generation", "queue": GENERATION_RETRY_QUEUE_NAME}),
    ("worker_component_registered", {"component": "update_retry_heartbeat", "schedule": "*/30s"}),
]

_SIMULATION_ANNOUNCEMENTS = [
    ("worker_component_registered", {
        "component": "tick_active_worlds",
        "schedule": "*/5s",
        "queue": SIMULATION_SCHEDULER_QUEUE_NAME,
    }),
    ("worker_component_registered", {"component": "update_simulation_heartbeat", "schedule": "*/30s"}),
]

_AUTOMATION_ANNOUNCEMENTS = [
    ("worker_component_registered", {"component": "process_automation", "queue": AUTOMATION_QUEUE_NAME}),
    ("worker_component_registered", {"component": "run_automation_loops", "schedule": "*/30s"}),
    ("worker_component_registered", {"component": "queue_pending_executions", "schedule": "*/15s"}),
    ("worker_component_registered", {"component": "poll_device_ads", "schedule": "*/5s"}),
    ("worker_component_registered", {"component": "poll_device_reconnects", "schedule": "*/30s"}),
    ("worker_component_registered", {"component": "update_automation_heartbeat", "schedule": "*/30s"}),
]

_MEDIA_MAINTENANCE_ANNOUNCEMENTS = [
    ("worker_component_registered", {"component": "process_relocation", "queue": MEDIA_MAINTENANCE_QUEUE_NAME}),
    ("worker_component_registered", {"component": "process_restore", "queue": MEDIA_MAINTENANCE_QUEUE_NAME}),
    ("worker_component_registered", {"component": "run_signal_backfill_batch", "queue": MEDIA_MAINTENANCE_QUEUE_NAME}),
    ("worker_component_registered", {"component": "update_media_maintenance_heartbeat", "schedule": "*/30s"}),
]

_DERIVATIVES_ANNOUNCEMENTS = [
    ("worker_component_registered", {"component": "process_derivatives", "queue": DERIVATIVES_QUEUE_NAME}),
    ("worker_component_registered", {"component": "update_derivatives_heartbeat", "schedule": "*/30s"}),
]


# Per-family lifecycle specs. Kept as data (spread into build_worker_lifecycle)
# so the characterization test can import the exact production kwargs and assert
# the emitted call-sequence without re-specifying — no test/prod drift.

# The main worker: registers all generation/analysis/etc. capabilities, binds
# the main_worker host, runs the crash-recovery reconcilers, hosts the event
# bridge, and inhibits sleep while active.
_MAIN_LIFECYCLE = dict(
    worker_start_msg="PixSim7 ARQ Worker Starting",
    shutdown_msg="PixSim7 ARQ Worker Shutting Down",
    heartbeat=update_main_heartbeat,
    detailed_worker_start=True,
    log_debug_flags=True,
    log_debug_flags_when_empty=True,
    account_events=True,
    register_providers=True,
    log_providers=True,
    bind_host="main_worker",
    unbind_on_shutdown=True,
    event_bridge_role="arq_worker",
    inhibit_sleep_while_active=True,
    announcements=_MAIN_ANNOUNCEMENTS,
    startup_reconcilers=(_startup_recover_stale, _startup_reconcile_counters),
)

# Deferred/retry generation worker: providers + event bridge + sleep-inhibit,
# but no capability bind, no crons/bootstrap reconcilers.
_RETRY_LIFECYCLE = dict(
    worker_start_msg="PixSim7 Generation Retry Worker Starting",
    shutdown_msg="PixSim7 Generation Retry Worker Shutting Down",
    heartbeat=update_retry_heartbeat,
    log_debug_flags=True,
    account_events=True,
    register_providers=True,
    event_bridge_role="arq_generation_retry_worker",
    inhibit_sleep_while_active=True,
    announcements=_RETRY_ANNOUNCEMENTS,
)

# Simulation scheduler worker: config load + heartbeat only.
_SIMULATION_LIFECYCLE = dict(
    worker_start_msg="PixSim7 Simulation Scheduler Worker Starting",
    shutdown_msg="PixSim7 Simulation Scheduler Worker Shutting Down",
    heartbeat=update_simulation_heartbeat,
    announcements=_SIMULATION_ANNOUNCEMENTS,
)

# Automation worker: providers + capability bind (automation_worker), but does
# NOT tear the host down on shutdown (unbind_on_shutdown=False) — preserving the
# historical asymmetry; see build_worker_lifecycle's docstring.
_AUTOMATION_LIFECYCLE = dict(
    worker_start_msg="PixSim7 Automation Worker Starting",
    shutdown_msg="PixSim7 Automation Worker Shutting Down",
    heartbeat=update_automation_heartbeat,
    log_debug_flags=True,
    register_providers=True,
    bind_host="automation_worker",
    unbind_on_shutdown=False,
    announcements=_AUTOMATION_ANNOUNCEMENTS,
)

# Media-maintenance worker: config load, orphaned-batch reconcile, sleep-inhibit
# (slow archive uploads run long).
_MEDIA_MAINTENANCE_LIFECYCLE = dict(
    worker_start_msg="PixSim7 Media Maintenance Worker Starting",
    shutdown_msg="PixSim7 Media Maintenance Worker Shutting Down",
    heartbeat=update_media_maintenance_heartbeat,
    inhibit_sleep_while_active=True,
    announcements=_MEDIA_MAINTENANCE_ANNOUNCEMENTS,
    startup_reconcilers=(_startup_media_maintenance_reconcile,),
)

# Derivatives worker: config load + heartbeat only. Jobs are short, so (unlike
# media-maintenance) it doesn't inhibit sleep or reconcile long-running batches.
_DERIVATIVES_LIFECYCLE = dict(
    worker_start_msg="PixSim7 Derivatives Worker Starting",
    shutdown_msg="PixSim7 Derivatives Worker Shutting Down",
    heartbeat=update_derivatives_heartbeat,
    announcements=_DERIVATIVES_ANNOUNCEMENTS,
)

startup, shutdown = build_worker_lifecycle(**_MAIN_LIFECYCLE)
retry_startup, retry_shutdown = build_worker_lifecycle(**_RETRY_LIFECYCLE)
simulation_startup, simulation_shutdown = build_worker_lifecycle(**_SIMULATION_LIFECYCLE)
automation_startup, automation_shutdown = build_worker_lifecycle(**_AUTOMATION_LIFECYCLE)
media_maintenance_startup, media_maintenance_shutdown = build_worker_lifecycle(**_MEDIA_MAINTENANCE_LIFECYCLE)
derivatives_startup, derivatives_shutdown = build_worker_lifecycle(**_DERIVATIVES_LIFECYCLE)


_sync_preload_system_config()


# Per-family config descriptors (queue, concurrency, timeout, retries) — single
# source of truth in worker_families. Each WorkerSettings below reads its scalar
# config from these instead of re-deriving env vars inline.
_MAIN_FAMILY = BY_ROLE[WORKER_ROLE_MAIN]
_RETRY_FAMILY = BY_ROLE[WORKER_ROLE_RETRY]
_SIMULATION_FAMILY = BY_ROLE[WORKER_ROLE_SIMULATION]
_AUTOMATION_FAMILY = BY_ROLE[WORKER_ROLE_AUTOMATION]
_MEDIA_MAINTENANCE_FAMILY = BY_ROLE[WORKER_ROLE_MEDIA_MAINTENANCE]
_DERIVATIVES_FAMILY = BY_ROLE[WORKER_ROLE_DERIVATIVES]


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
    queue_name = _MAIN_FAMILY.queue_name

    # Task functions that can be queued
    functions = [
        process_generation,
        process_analysis,
        process_derivatives,
        process_ingestion,
        process_prompt_tagging,
        process_prompt_embedding,
        process_chain_execution,
        process_ephemeral_chain_execution,
        process_ephemeral_fanout_execution,
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

    # Worker configuration (from worker_families: settings.arq_max_jobs,
    # ARQ_JOB_TIMEOUT=3600, ARQ_MAX_TRIES=3, retry_jobs=True)
    max_jobs = _MAIN_FAMILY.resolve_max_jobs()
    job_timeout = _MAIN_FAMILY.resolve_job_timeout()
    max_tries = _MAIN_FAMILY.resolve_max_tries()
    retry_jobs = _MAIN_FAMILY.retry_jobs

    # Logging
    log_results = True
    verbose = True

    # Health check
    health_check_interval = 60  # Check worker health every 60 seconds


class GenerationRetryWorkerSettings:
    """ARQ worker for deferred/retry generation jobs only."""

    redis_settings = _redis_settings()
    queue_name = _RETRY_FAMILY.queue_name

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

    max_jobs = _RETRY_FAMILY.resolve_max_jobs()
    job_timeout = _RETRY_FAMILY.resolve_job_timeout()
    max_tries = _RETRY_FAMILY.resolve_max_tries()
    retry_jobs = _RETRY_FAMILY.retry_jobs

    log_results = True
    verbose = True
    health_check_interval = 60


class SimulationWorkerSettings:
    """ARQ worker dedicated to periodic world simulation scheduling."""

    redis_settings = _redis_settings()
    queue_name = _SIMULATION_FAMILY.queue_name

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

    max_jobs = _SIMULATION_FAMILY.resolve_max_jobs()
    job_timeout = _SIMULATION_FAMILY.resolve_job_timeout()
    max_tries = _SIMULATION_FAMILY.resolve_max_tries()
    retry_jobs = _SIMULATION_FAMILY.retry_jobs

    log_results = True
    verbose = True
    health_check_interval = 60


class AutomationWorkerSettings:
    """ARQ worker dedicated to device automation execution.

    Isolated from the main generation worker so automation jobs (ADB device
    control, potentially long-running) cannot eat generation processing slots.
    """

    redis_settings = _redis_settings()
    queue_name = _AUTOMATION_FAMILY.queue_name

    functions = [
        process_automation,
        run_automation_loops,
        queue_pending_executions,
        poll_device_ads,
        poll_device_reconnects,
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
        # Reconnect TCP-attached emulators every 30s — replaces launcher's
        # ad-hoc adb-keeper service. Source of truth: AndroidDevice.instance_port.
        cron(poll_device_reconnects, second={15, 45}, run_at_startup=True),
        # Heartbeat every 30 seconds
        cron(update_automation_heartbeat, second={0, 30}, run_at_startup=False),
        # Reload logging config from DB every 60s
        cron(reload_logging_config, second={10}, run_at_startup=False),
    ]

    on_startup = automation_startup
    on_shutdown = automation_shutdown

    # Automation is device-bound — concurrency limited by physical devices
    # (ARQ_AUTOMATION_MAX_JOBS=5). job_timeout allows 30min multi-step flows
    # (ARQ_AUTOMATION_JOB_TIMEOUT=1800). Don't auto-retry — device state is
    # dirty after a mid-run failure; the loop service reschedules.
    max_jobs = _AUTOMATION_FAMILY.resolve_max_jobs()
    job_timeout = _AUTOMATION_FAMILY.resolve_job_timeout()
    max_tries = _AUTOMATION_FAMILY.resolve_max_tries()
    retry_jobs = _AUTOMATION_FAMILY.retry_jobs

    log_results = True
    verbose = True
    health_check_interval = 60


class MediaMaintenanceWorkerSettings:
    """ARQ worker dedicated to slow bulk media-maintenance jobs.

    Hosts archive relocate/restore and durable signal-scan reprobe — isolated
    from the main generation worker so long S3/ZeroTier uploads and probe sweeps
    can't eat generation processing slots. Single-slot by default; each job
    self-paginates and re-enqueues to span the job timeout. See plans
    media-storage-tiering cp-k and signal-reprobe-backfill-run.
    """

    redis_settings = _redis_settings()
    queue_name = _MEDIA_MAINTENANCE_FAMILY.queue_name

    functions = [
        process_relocation,
        process_restore,
        run_signal_backfill_batch,
        reload_logging_config,
    ]

    cron_jobs = [
        cron(update_media_maintenance_heartbeat, second={0, 30}, run_at_startup=False),
        cron(reload_logging_config, second={10}, run_at_startup=False),
    ]

    on_startup = media_maintenance_startup
    on_shutdown = media_maintenance_shutdown

    max_jobs = _MEDIA_MAINTENANCE_FAMILY.resolve_max_jobs()
    job_timeout = _MEDIA_MAINTENANCE_FAMILY.resolve_job_timeout()
    max_tries = _MEDIA_MAINTENANCE_FAMILY.resolve_max_tries()
    retry_jobs = _MEDIA_MAINTENANCE_FAMILY.retry_jobs

    log_results = True
    verbose = True
    health_check_interval = 60


class DerivativesWorkerSettings:
    """ARQ worker dedicated to asset derivative generation (thumbnail/preview).

    The derivative step shells out to ffmpeg per asset and is CPU-bound. On the
    MAIN worker it inherits ``arq_max_jobs`` (=30), so a burst of generations
    (e.g. 30 at once) can spawn ~30 concurrent ffmpeg processes, pinning every
    core and starving the generation/API hot path. Isolating it here with a
    small fixed cap (ARQ_DERIVATIVES_MAX_JOBS, default 4) drains the burst in
    waves instead. Routing to this queue is opt-in via
    ``settings.derivatives_dedicated_queue`` — when off, derivatives stay on the
    MAIN queue (which also still registers ``process_derivatives``), so enabling
    the worker is a deliberate, reversible switch.

    NB: every attribute ARQ consumes must be declared HERE, not inherited — ARQ
    reads ``settings_cls.__dict__`` (own attributes only), so an inherited
    ``redis_settings`` silently falls back to ARQ's localhost:6379 default. This
    is why the worker classes don't share a base.
    """

    # Redis connection (shared with API via settings.redis_url) — see note above.
    redis_settings = _redis_settings()
    queue_name = _DERIVATIVES_FAMILY.queue_name

    functions = [
        process_derivatives,
        reload_logging_config,
    ]

    cron_jobs = [
        cron(update_derivatives_heartbeat, second={0, 30}, run_at_startup=False),
        cron(reload_logging_config, second={10}, run_at_startup=False),
    ]

    on_startup = derivatives_startup
    on_shutdown = derivatives_shutdown

    max_jobs = _DERIVATIVES_FAMILY.resolve_max_jobs()
    job_timeout = _DERIVATIVES_FAMILY.resolve_job_timeout()
    max_tries = _DERIVATIVES_FAMILY.resolve_max_tries()
    retry_jobs = _DERIVATIVES_FAMILY.retry_jobs

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
