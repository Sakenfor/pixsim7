"""Shared ARQ worker lifecycle skeleton — ``build_worker_lifecycle`` factory.

The six worker families defined in ``arq_worker.py`` (main, retry, simulation,
automation, media_maintenance, derivatives) share a uniform startup/shutdown
skeleton with genuine per-family variation. This module expresses that skeleton
once and takes the variation as parameters, so a step added to the skeleton
(e.g. the persisted-config load — now in all six) lands in every family instead
of drifting into "in four of five but not the fifth".

Canonical **startup** order (each bracketed step guarded by a param):

    [AccountEventService.initialize]        account_events
    _normalize_arq_logger_handlers
    get_health_tracker
    worker_start log                        (+ log-level detail if detailed_worker_start)
    [worker_debug_flags log]                log_debug_flags (+ "none" if log_debug_flags_when_empty)
    _load_persisted_system_config_for_worker
    [register_default_providers]            register_providers (+ providers log if log_providers)
    [bind_for_host]                         bind_host
    announcements                           per-family component/config logs (pure data)
    [startup reconcilers]                   startup_reconcilers (self-guarding coroutines)
    [start_event_bus_bridge]                event_bridge_role
    heartbeat
    [inhibit_sleep]                         inhibit_sleep_while_active

Canonical **shutdown** order (mirror):

    worker_shutdown log
    [stop_event_bus_bridge]                 event_bridge_role (only if a bridge was started)
    [AccountEventService.shutdown]          account_events
    [shutdown_for_host]                     bind_host + unbind_on_shutdown
    _drain_arq_pool
    close_database
    [allow_sleep]                           inhibit_sleep_while_active

NOTE on ``unbind_on_shutdown``: the main worker binds capabilities on startup and
tears them down on shutdown, but the automation worker (historically) binds on
startup and does NOT ``shutdown_for_host`` on shutdown. That asymmetry is
preserved by gating the shutdown teardown on ``unbind_on_shutdown`` rather than on
``bind_host`` alone — this is a behavior-preservation seam, not an oversight.

The register-providers and capability bind/shutdown calls are wrapped in the tiny
``_register_providers`` / ``_bind_host`` / ``_shutdown_host`` module-level helpers
so they keep their original lazy-import semantics AND remain patchable as a single
module attribute (the provider registry package resolves its export lazily, so
patching the package attribute does not intercept a fresh ``from ... import``).
"""

import asyncio
import logging as stdlib_logging
import os
from typing import Awaitable, Callable, Optional, Sequence, Tuple

from pixsim7.backend.main.shared.debug import load_global_debug_from_env
from pixsim7.backend.main.services.account_event_service import AccountEventService
from pixsim7.backend.main.workers.health import get_health_tracker
from pixsim7.backend.main.infrastructure.events.redis_bridge import (
    start_event_bus_bridge,
    stop_event_bus_bridge,
)
from pixsim7.backend.main.infrastructure.sleep_inhibit import inhibit_sleep, allow_sleep
from pixsim7.backend.main.infrastructure.database.session import close_database
from pixsim_logging import configure_logging, configure_stdlib_root_logger

# Single worker logger, shared with arq_worker (which imports it from here) so the
# worker_start / worker_component_registered / worker_shutdown events all flow
# through one bound logger.
logger = configure_logging("worker").bind(channel="system", domain="system")
configure_stdlib_root_logger()


# ---------------------------------------------------------------------------
# arq logging normalization (drops arq's plain-text handler + high-frequency
# cron start/end INFO lines). Lives here because it is pure worker-lifecycle
# infra invoked from every family's startup.
# ---------------------------------------------------------------------------

# arq logs an INFO start/end pair for every job and cron fire, e.g.
#   "1.01s → cron:poll_job_statuses()" / "0.10s ← cron:poll_job_statuses ●".
# A few crons fire very frequently (poll every 2s, heartbeats every 30s, reload
# and requeue) and those scaffolding lines carry no information — the functions
# log their own meaningful events. Drop just those INFO lines while keeping real
# job logs, arq's periodic "recording health" summary, and any WARNING/ERROR
# (including failures of these same crons).
_QUIET_CRON_NAMES = (
    "cron:poll_job_statuses",
    "cron:update_main_heartbeat",
    "cron:update_retry_heartbeat",
    "cron:update_simulation_heartbeat",
    "cron:update_automation_heartbeat",
    "cron:reload_logging_config",
    "cron:requeue_pending_generations",
    "cron:requeue_pending_analyses",
)


class _QuietHighFrequencyCronFilter(stdlib_logging.Filter):
    """Drop arq's routine INFO start/end lines for high-frequency crons.

    Only INFO (and below) records are dropped; WARNING/ERROR about the same
    crons pass through untouched so failures stay visible.
    """

    def filter(self, record: stdlib_logging.LogRecord) -> bool:
        if record.levelno > stdlib_logging.INFO:
            return True
        message = record.getMessage()
        return not any(name in message for name in _QUIET_CRON_NAMES)


_quiet_cron_filter = _QuietHighFrequencyCronFilter()


def _normalize_arq_logger_handlers() -> None:
    """Drop ARQ's default plain-text handler so events flow once via pixsim_logging.

    The `arq` CLI applies its own logging dictConfig after importing this module.
    That handler emits `%(asctime)s: %(message)s` lines in parallel with the
    structured stdlib root handler configured by pixsim_logging, causing duplicates.

    Also installs a filter on ``arq.worker`` that suppresses the routine INFO
    start/end lines for the high-frequency crons (see _QUIET_CRON_NAMES).
    """
    removed = 0
    for logger_name in ("arq", "arq.worker"):
        arq_logger = stdlib_logging.getLogger(logger_name)
        for handler in list(arq_logger.handlers):
            arq_logger.removeHandler(handler)
            removed += 1
        arq_logger.propagate = True
        arq_logger.disabled = False

    # The job/cron start-end lines are emitted by the "arq.worker" logger, so
    # the filter must be attached there (logger filters don't apply to records
    # propagated up from children). Idempotent across repeated startup calls.
    arq_worker_logger = stdlib_logging.getLogger("arq.worker")
    if not any(isinstance(f, _QuietHighFrequencyCronFilter) for f in arq_worker_logger.filters):
        arq_worker_logger.addFilter(_quiet_cron_filter)

    if removed:
        logger.info("arq_logger_handlers_removed", removed_handlers=removed)


# ---------------------------------------------------------------------------
# Persisted system-config load (best-effort) — shared by every family's startup
# and by the synchronous module-import preload.
# ---------------------------------------------------------------------------

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


def _sync_preload_system_config() -> None:
    """Pre-load DB-persisted config so class-level attributes see updated values.

    Uses a temporary event loop. Must dispose the engine afterward so pooled
    connections don't linger bound to the closed loop (causes
    'Event loop is closed' errors when ARQ's own loop later tries to clean up).
    """
    try:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_load_persisted_system_config_for_worker())
        loop.run_until_complete(close_database())
        loop.close()
    except Exception:
        pass  # Falls back to env var / Pydantic default


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


# ---------------------------------------------------------------------------
# Lazy-import seams — kept as module-level functions so they (a) preserve the
# original in-function lazy import and (b) are patchable as one module attribute.
# ---------------------------------------------------------------------------

def _register_providers() -> None:
    from pixsim7.backend.main.domain.providers.registry import register_default_providers
    register_default_providers()


def _bind_host(host: str) -> None:
    from pixsim7.backend.main.capability_registry import bind_for_host
    bind_for_host(host)


async def _shutdown_host(host: str) -> None:
    from pixsim7.backend.main.capability_registry import shutdown_for_host
    await shutdown_for_host(host)


# ---------------------------------------------------------------------------
# The factory
# ---------------------------------------------------------------------------

Ctx = dict
AsyncHook = Callable[[Ctx], Awaitable[None]]


def build_worker_lifecycle(
    *,
    worker_start_msg: str,
    shutdown_msg: str,
    heartbeat: AsyncHook,
    detailed_worker_start: bool = False,
    log_debug_flags: bool = False,
    log_debug_flags_when_empty: bool = False,
    account_events: bool = False,
    register_providers: bool = False,
    log_providers: bool = False,
    bind_host: Optional[str] = None,
    unbind_on_shutdown: bool = False,
    event_bridge_role: Optional[str] = None,
    inhibit_sleep_while_active: bool = False,
    announcements: Sequence[Tuple[str, dict]] = (),
    startup_reconcilers: Sequence[AsyncHook] = (),
) -> Tuple[AsyncHook, AsyncHook]:
    """Build ``(on_startup, on_shutdown)`` for one ARQ worker family.

    See the module docstring for the canonical step order. ``announcements`` is a
    sequence of ``(event_name, kwargs)`` logged verbatim (per-family component /
    effective-config lines are pure data). ``startup_reconcilers`` are
    self-guarding coroutines run after announcements and before the event bridge —
    each owns its own try/except + logging so the factory stays generic.
    """
    # Per-lifecycle event-bridge handle (replaces the old module globals).
    _bridge = {"handle": None}

    async def on_startup(ctx: Ctx) -> None:
        if account_events:
            AccountEventService.initialize()

        _normalize_arq_logger_handlers()
        get_health_tracker()

        if detailed_worker_start:
            effective_level = stdlib_logging.getLogger().level
            logger.info(
                "worker_start",
                msg=worker_start_msg,
                log_level=stdlib_logging.getLevelName(effective_level),
                log_level_env=os.getenv("LOG_LEVEL", "not set"),
            )
        else:
            logger.info("worker_start", msg=worker_start_msg)

        if log_debug_flags:
            debug_flags = load_global_debug_from_env()
            if debug_flags:
                enabled = [name for name, on in debug_flags.items() if on]
                logger.info("worker_debug_flags", flags=",".join(sorted(enabled)))
            elif log_debug_flags_when_empty:
                logger.info("worker_debug_flags", flags="none")

        await _load_persisted_system_config_for_worker()

        if register_providers:
            _register_providers()
            if log_providers:
                logger.info("worker_providers_registered", msg="Provider plugins loaded")

        if bind_host:
            _bind_host(bind_host)

        for event_name, kwargs in announcements:
            logger.info(event_name, **kwargs)

        for reconciler in startup_reconcilers:
            await reconciler(ctx)

        if event_bridge_role:
            _bridge["handle"] = await start_event_bus_bridge(role=event_bridge_role)

        await heartbeat(ctx)

        if inhibit_sleep_while_active:
            inhibit_sleep()

    async def on_shutdown(ctx: Ctx) -> None:
        logger.info("worker_shutdown", msg=shutdown_msg)

        if event_bridge_role and _bridge["handle"]:
            try:
                await stop_event_bus_bridge()
            except Exception as e:
                logger.warning("worker_shutdown_event_bridge_error", error=str(e))
            _bridge["handle"] = None

        if account_events:
            try:
                AccountEventService.shutdown()
            except Exception as e:
                logger.warning("worker_shutdown_account_event_error", error=str(e))

        if unbind_on_shutdown and bind_host:
            try:
                await _shutdown_host(bind_host)
            except Exception as e:
                logger.warning("worker_shutdown_capabilities_error", error=str(e))

        await _drain_arq_pool(ctx)

        try:
            await close_database()
        except Exception as e:
            logger.warning("worker_shutdown_database_close_error", error=str(e))

        if inhibit_sleep_while_active:
            allow_sleep()

    return on_startup, on_shutdown
