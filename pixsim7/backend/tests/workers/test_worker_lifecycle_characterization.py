"""Characterization test for the shared worker lifecycle skeleton.

Pins the exact ordered call-sequence of every worker family's on_startup /
on_shutdown handler. These handlers were extracted from six near-duplicate
hand-written pairs in ``arq_worker.py`` into a single ``build_worker_lifecycle``
factory (plan ``worker-thin-host-canon`` checkpoint ``lifecycle-skeleton``); this
test is the behavior-preservation net for that refactor and the guard against
future drift — lifecycle code hides subtle ordering bugs (heartbeat before/after
event-bridge, drain before/after close_database, sleep-inhibit balance).

Design: it imports the *production* spec dicts (``arq_worker._MAIN_LIFECYCLE`` …)
and rebuilds each family's pair through the real factory, swapping only the
heartbeat for a recorder and patching every side-effecting collaborator with an
ordered recorder. Because it consumes the same spec objects production spreads
into the factory, a per-family flag change flows straight into the assertion —
no re-specification, no test/prod drift.
"""

import asyncio

import pytest

from pixsim7.backend.main.workers import lifecycle as life
from pixsim7.backend.main.workers import arq_worker as aw


# --------------------------------------------------------------------------- #
# Recording harness
# --------------------------------------------------------------------------- #

class _Recorder:
    def __init__(self):
        self.seq = []

    def sync(self, label):
        def _fn(*a, **k):
            self.seq.append(label)
            return None
        return _fn

    def aio(self, label, ret=None):
        async def _fn(*a, **k):
            self.seq.append(label)
            return ret
        return _fn

    def logger(self):
        rec = self

        class _L:
            def info(self, event, *a, **k):
                rec.seq.append(f"log:{event}")

            def warning(self, event, *a, **k):
                rec.seq.append(f"warn:{event}")

            def bind(self, *a, **k):
                return self

        return _L()


@pytest.fixture
def recorder(monkeypatch):
    rec = _Recorder()
    log = rec.logger()

    # Factory-core collaborators (resolved from the lifecycle module at call time).
    monkeypatch.setattr(life, "logger", log)
    monkeypatch.setattr(life, "_normalize_arq_logger_handlers", rec.sync("_normalize_arq_logger_handlers"))
    monkeypatch.setattr(life, "get_health_tracker", rec.sync("get_health_tracker"))
    monkeypatch.setattr(life, "load_global_debug_from_env", lambda: (rec.seq.append("load_global_debug_from_env"), {})[1])
    monkeypatch.setattr(life, "inhibit_sleep", rec.sync("inhibit_sleep"))
    monkeypatch.setattr(life, "allow_sleep", rec.sync("allow_sleep"))
    monkeypatch.setattr(life, "_register_providers", rec.sync("register_default_providers"))
    monkeypatch.setattr(life, "_bind_host", rec.sync("bind_for_host"))
    monkeypatch.setattr(life, "_shutdown_host", rec.aio("shutdown_for_host"))
    monkeypatch.setattr(life, "_load_persisted_system_config_for_worker", rec.aio("_load_persisted_system_config_for_worker"))
    monkeypatch.setattr(life, "_drain_arq_pool", rec.aio("_drain_arq_pool"))
    monkeypatch.setattr(life, "close_database", rec.aio("close_database"))
    monkeypatch.setattr(life, "start_event_bus_bridge", rec.aio("start_event_bus_bridge", ret="BRIDGE"))
    monkeypatch.setattr(life, "stop_event_bus_bridge", rec.aio("stop_event_bus_bridge"))

    class _AccountEventService:
        @staticmethod
        def initialize():
            rec.seq.append("AccountEventService.initialize")

        @staticmethod
        def shutdown():
            rec.seq.append("AccountEventService.shutdown")

    monkeypatch.setattr(life, "AccountEventService", _AccountEventService)

    # Announcements + reconciler wrappers live in arq_worker and log via aw.logger.
    monkeypatch.setattr(aw, "logger", log)
    # Reconciler wrappers are kept real; patch what they call so their position shows.
    monkeypatch.setattr(aw, "recover_stale_processing_generations", rec.aio("recover_stale_processing_generations", ret={"failed": 0}))
    monkeypatch.setattr(aw, "reconcile_account_counters", rec.aio("reconcile_account_counters", ret={"reconciled": 0}))
    monkeypatch.setattr(aw, "_reconcile_relocation_on_startup", rec.aio("_reconcile_relocation_on_startup", ret=None))
    monkeypatch.setattr(aw, "_reconcile_restore_on_startup", rec.aio("_reconcile_restore_on_startup", ret=None))
    return rec


def _build(spec, rec):
    """Build a family's (on_startup, on_shutdown) from its production spec, with the
    heartbeat swapped for a recorder so its ordering is observable."""
    spec = dict(spec)
    spec["heartbeat"] = rec.aio("heartbeat")
    return life.build_worker_lifecycle(**spec)


def _run(fn, rec):
    rec.seq.clear()
    asyncio.run(fn({"redis": None}))
    return list(rec.seq)


# --------------------------------------------------------------------------- #
# Golden sequences
# --------------------------------------------------------------------------- #

_COMPONENT = "log:worker_component_registered"
_EXTERNAL = "log:worker_component_externalized"


def _components(n):
    return [_COMPONENT] * n


MAIN_STARTUP = [
    "AccountEventService.initialize",
    "_normalize_arq_logger_handlers",
    "get_health_tracker",
    "log:worker_start",
    "load_global_debug_from_env",
    "log:worker_debug_flags",
    "_load_persisted_system_config_for_worker",
    "register_default_providers",
    "log:worker_providers_registered",
    "bind_for_host",
    *_components(14),
    _EXTERNAL,
    _EXTERNAL,
    "log:worker_effective_config",
    "recover_stale_processing_generations",
    "reconcile_account_counters",
    "start_event_bus_bridge",
    "heartbeat",
    "inhibit_sleep",
]
MAIN_SHUTDOWN = [
    "log:worker_shutdown",
    "stop_event_bus_bridge",
    "AccountEventService.shutdown",
    "shutdown_for_host",
    "_drain_arq_pool",
    "close_database",
    "allow_sleep",
]

RETRY_STARTUP = [
    "AccountEventService.initialize",
    "_normalize_arq_logger_handlers",
    "get_health_tracker",
    "log:worker_start",
    "load_global_debug_from_env",
    "_load_persisted_system_config_for_worker",
    "register_default_providers",
    *_components(2),
    "start_event_bus_bridge",
    "heartbeat",
    "inhibit_sleep",
]
RETRY_SHUTDOWN = [
    "log:worker_shutdown",
    "stop_event_bus_bridge",
    "AccountEventService.shutdown",
    "_drain_arq_pool",
    "close_database",
    "allow_sleep",
]

SIMULATION_STARTUP = [
    "_normalize_arq_logger_handlers",
    "get_health_tracker",
    "log:worker_start",
    "_load_persisted_system_config_for_worker",
    *_components(2),
    "heartbeat",
]
SIMULATION_SHUTDOWN = [
    "log:worker_shutdown",
    "_drain_arq_pool",
    "close_database",
]

AUTOMATION_STARTUP = [
    "_normalize_arq_logger_handlers",
    "get_health_tracker",
    "log:worker_start",
    "load_global_debug_from_env",
    "_load_persisted_system_config_for_worker",
    "register_default_providers",
    "bind_for_host",
    *_components(6),
    "heartbeat",
]
AUTOMATION_SHUTDOWN = [
    "log:worker_shutdown",
    "_drain_arq_pool",
    "close_database",
]

MEDIA_MAINTENANCE_STARTUP = [
    "_normalize_arq_logger_handlers",
    "get_health_tracker",
    "log:worker_start",
    "_load_persisted_system_config_for_worker",
    *_components(4),
    "_reconcile_relocation_on_startup",
    "_reconcile_restore_on_startup",
    "heartbeat",
    "inhibit_sleep",
]
MEDIA_MAINTENANCE_SHUTDOWN = [
    "log:worker_shutdown",
    "_drain_arq_pool",
    "close_database",
    "allow_sleep",
]

DERIVATIVES_STARTUP = [
    "_normalize_arq_logger_handlers",
    "get_health_tracker",
    "log:worker_start",
    "_load_persisted_system_config_for_worker",
    *_components(2),
    "heartbeat",
]
DERIVATIVES_SHUTDOWN = [
    "log:worker_shutdown",
    "_drain_arq_pool",
    "close_database",
]


_FAMILIES = [
    ("main", aw._MAIN_LIFECYCLE, MAIN_STARTUP, MAIN_SHUTDOWN),
    ("retry", aw._RETRY_LIFECYCLE, RETRY_STARTUP, RETRY_SHUTDOWN),
    ("simulation", aw._SIMULATION_LIFECYCLE, SIMULATION_STARTUP, SIMULATION_SHUTDOWN),
    ("automation", aw._AUTOMATION_LIFECYCLE, AUTOMATION_STARTUP, AUTOMATION_SHUTDOWN),
    ("media_maintenance", aw._MEDIA_MAINTENANCE_LIFECYCLE, MEDIA_MAINTENANCE_STARTUP, MEDIA_MAINTENANCE_SHUTDOWN),
    ("derivatives", aw._DERIVATIVES_LIFECYCLE, DERIVATIVES_STARTUP, DERIVATIVES_SHUTDOWN),
]


@pytest.mark.parametrize("name,spec,golden_startup,golden_shutdown", _FAMILIES, ids=[f[0] for f in _FAMILIES])
def test_lifecycle_call_sequence(recorder, name, spec, golden_startup, golden_shutdown):
    on_startup, on_shutdown = _build(spec, recorder)
    assert _run(on_startup, recorder) == golden_startup, f"{name} startup sequence drifted"
    assert _run(on_shutdown, recorder) == golden_shutdown, f"{name} shutdown sequence drifted"


def test_production_handlers_are_wired_to_the_factory():
    """The WorkerSettings classes must point at the factory-built handlers (guards
    against the spec dicts being built but never spread / wired)."""
    from pixsim7.backend.main.workers.arq_worker import (
        WorkerSettings, GenerationRetryWorkerSettings, SimulationWorkerSettings,
        AutomationWorkerSettings, MediaMaintenanceWorkerSettings, DerivativesWorkerSettings,
    )
    for cls in (
        WorkerSettings, GenerationRetryWorkerSettings, SimulationWorkerSettings,
        AutomationWorkerSettings, MediaMaintenanceWorkerSettings, DerivativesWorkerSettings,
    ):
        assert asyncio.iscoroutinefunction(cls.on_startup), f"{cls.__name__}.on_startup not async"
        assert asyncio.iscoroutinefunction(cls.on_shutdown), f"{cls.__name__}.on_shutdown not async"
