from launcher.core.health_manager import HealthManager
from launcher.core.types import HealthStatus, ServiceDefinition, ServiceState, ServiceStatus


def _worker_state() -> ServiceState:
    definition = ServiceDefinition(
        key="worker",
        title="Worker (ARQ)",
        program="python",
        args=["-m", "arq", "pixsim7.backend.main.workers.arq_worker.WorkerSettings"],
        cwd=".",
        health_url=None,
    )
    return ServiceState(definition=definition)


def _http_state() -> ServiceState:
    definition = ServiceDefinition(
        key="main-api",
        title="Main API",
        program="python",
        args=["-m", "pixsim7.backend.main.main"],
        cwd=".",
        health_url="http://127.0.0.1:8000/health",
    )
    return ServiceState(definition=definition)


def _bridge_state() -> ServiceState:
    definition = ServiceDefinition(
        key="ai-client",
        title="AI Client (Bridge)",
        program="python",
        args=["-m", "pixsim7.client"],
        cwd=".",
        health_url=None,
    )
    return ServiceState(definition=definition)


def test_worker_requires_pid_even_when_redis_is_healthy(monkeypatch):
    state = _worker_state()
    mgr = HealthManager(states={"worker": state})

    monkeypatch.setattr(mgr, "_check_redis_health", lambda _url: True)
    monkeypatch.setattr(mgr, "_detect_headless_service", lambda _key, _defn: None)

    mgr._check_service("worker", state)

    assert state.status == ServiceStatus.STOPPED
    assert state.health == HealthStatus.STOPPED
    assert state.pid is None
    assert state.detected_pid is None


def test_worker_is_healthy_when_pid_alive_and_redis_healthy(monkeypatch):
    state = _worker_state()
    state.pid = 12345
    mgr = HealthManager(states={"worker": state})

    monkeypatch.setattr(mgr, "_is_pid_alive", lambda _pid: True)
    monkeypatch.setattr(mgr, "_check_redis_health", lambda _url: True)

    mgr._check_service("worker", state)

    assert state.status == ServiceStatus.RUNNING
    assert state.health == HealthStatus.HEALTHY
    assert state.requested_running is True


def test_worker_stale_pid_does_not_stay_healthy(monkeypatch):
    state = _worker_state()
    state.status = ServiceStatus.RUNNING
    state.health = HealthStatus.HEALTHY
    state.detected_pid = 54321
    state.requested_running = True
    mgr = HealthManager(states={"worker": state})

    monkeypatch.setattr(mgr, "_is_pid_alive", lambda _pid: False)
    monkeypatch.setattr(mgr, "_check_redis_health", lambda _url: True)
    monkeypatch.setattr(mgr, "_detect_headless_service", lambda _key, _defn: None)

    mgr._check_service("worker", state)

    assert state.detected_pid is None
    assert state.status == ServiceStatus.STOPPED
    assert state.health == HealthStatus.STOPPED


def test_http_probe_failure_sets_reason_and_clears_on_recovery(monkeypatch):
    state = _http_state()
    state.status = ServiceStatus.RUNNING
    state.health = HealthStatus.HEALTHY
    state.requested_running = True
    mgr = HealthManager(states={"main-api": state})

    monkeypatch.setattr(mgr, "_check_http_health", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")))

    mgr._check_service("main-api", state)

    assert state.health == HealthStatus.UNHEALTHY
    assert "Health check failed:" in state.last_error
    assert "HTTP health probe failed" in state.last_error
    assert "RuntimeError: boom" in state.last_error

    monkeypatch.setattr(mgr, "_check_http_health", lambda *_args, **_kwargs: True)

    mgr._check_service("main-api", state)

    assert state.health == HealthStatus.HEALTHY
    assert state.last_error == ""


# ── AI client bridge: liveness-file health probe ─────────────────
# Plan: launcher-health-probe-stability. The bridge has no HTTP port and no
# Redis heartbeat, so PID-liveness alone lets a loop-wedged (post-sleep)
# process show green. A freshness file closes that gap.


def test_bridge_healthy_when_pid_alive_and_heartbeat_fresh(monkeypatch):
    state = _bridge_state()
    state.pid = 4321
    mgr = HealthManager(states={"ai-client": state})

    monkeypatch.setattr(mgr, "_is_pid_alive", lambda _pid: True)
    monkeypatch.setattr(mgr, "_bridge_heartbeat_age", lambda: 5.0)

    mgr._check_service("ai-client", state)

    assert state.status == ServiceStatus.RUNNING
    assert state.health == HealthStatus.HEALTHY
    assert state.requested_running is True


def test_bridge_stopped_when_pid_alive_but_heartbeat_stale(monkeypatch):
    """The core sleep/resume wedge: PID alive but the loop stopped writing.
    Past grace this must report STOPPED — the only status the RestartSupervisor
    acts on — so the wedged process is killed and respawned rather than left
    showing green forever."""
    state = _bridge_state()
    state.pid = 4321
    state.status = ServiceStatus.RUNNING
    state.health = HealthStatus.HEALTHY
    state.requested_running = True
    state.definition.health_grace_attempts = 0  # no grace → first stale is fatal
    mgr = HealthManager(states={"ai-client": state})

    monkeypatch.setattr(mgr, "_is_pid_alive", lambda _pid: True)
    monkeypatch.setattr(mgr, "_bridge_heartbeat_age", lambda: 999.0)

    mgr._check_service("ai-client", state)

    assert state.status == ServiceStatus.STOPPED
    assert state.health == HealthStatus.STOPPED
    assert "wedged" in (state.last_error or "")


def test_bridge_missing_heartbeat_tolerated_within_grace(monkeypatch):
    """Right after start the file may not exist yet — stay STARTING, not
    UNHEALTHY, until grace is exhausted."""
    state = _bridge_state()
    state.pid = 4321
    state.status = ServiceStatus.STARTING
    state.requested_running = True
    mgr = HealthManager(states={"ai-client": state})

    monkeypatch.setattr(mgr, "_is_pid_alive", lambda _pid: True)
    monkeypatch.setattr(mgr, "_bridge_heartbeat_age", lambda: None)

    mgr._check_service("ai-client", state)

    assert state.health == HealthStatus.STARTING


def test_bridge_no_pid_is_stopped(monkeypatch):
    state = _bridge_state()
    state.status = ServiceStatus.RUNNING
    state.detected_pid = 4321
    state.requested_running = True
    mgr = HealthManager(states={"ai-client": state})

    monkeypatch.setattr(mgr, "_is_pid_alive", lambda _pid: False)
    monkeypatch.setattr(mgr, "_detect_headless_service", lambda _key, _defn: None)
    monkeypatch.setattr(mgr, "_bridge_heartbeat_age", lambda: 5.0)

    mgr._check_service("ai-client", state)

    assert state.detected_pid is None
    assert state.status == ServiceStatus.STOPPED
    assert state.health == HealthStatus.STOPPED


def test_bridge_heartbeat_age_reads_file_mtime(monkeypatch, tmp_path):
    hb = tmp_path / "bridge_heartbeat"
    hb.write_text("123.0", encoding="utf-8")
    monkeypatch.setenv("PIXSIM_BRIDGE_HEARTBEAT_FILE", str(hb))
    mgr = HealthManager(states={})

    age = mgr._bridge_heartbeat_age()
    assert age is not None and age >= 0.0

    hb.unlink()
    assert mgr._bridge_heartbeat_age() is None


# ── Headless adoption respects requested-stopped intent ──────────
# Plan: launcher-health-probe-stability /
# headless-adoption-bypasses-requested-stopped.


def test_headless_scan_skipped_when_user_explicitly_stopped(monkeypatch):
    """User stopped the worker → cmdline scan must not run, even if an
    external matching process exists. Without the gate, the scan would
    set ``state.detected_pid`` + flip ``status`` to RUNNING and silently
    re-adopt the orphan process, undoing the user's Stop click."""
    state = _worker_state()
    state.status = ServiceStatus.STOPPED
    state.health = HealthStatus.STOPPED
    state.pid = None
    state.detected_pid = None
    state.requested_running = False  # user explicitly stopped
    mgr = HealthManager(states={"worker": state})

    scan_calls: list[str] = []
    def _detect(_key, _defn):
        scan_calls.append(_key)
        return 99999  # would adopt this PID if scan were allowed to run
    monkeypatch.setattr(mgr, "_detect_headless_service", _detect)
    monkeypatch.setattr(mgr, "_check_redis_health", lambda _url: True)

    mgr._check_service("worker", state)

    assert scan_calls == [], "scan must not run when user has stopped the service"
    assert state.detected_pid is None
    assert state.status == ServiceStatus.STOPPED
    assert state.health == HealthStatus.STOPPED
    assert state.requested_running is False


def test_headless_scan_runs_when_requested_running_is_unknown(monkeypatch):
    """``requested_running is None`` is the default for services the user
    hasn't explicitly touched. The scan must still run so externally-
    started processes get discovered and adopted — that's a feature,
    not the bug. Regression guard."""
    state = _worker_state()
    state.status = ServiceStatus.STOPPED
    state.health = HealthStatus.STOPPED
    state.pid = None
    state.detected_pid = None
    state.requested_running = None  # never touched
    mgr = HealthManager(states={"worker": state})

    scan_calls: list[str] = []
    def _detect(_key, _defn):
        scan_calls.append(_key)
        return 42424  # external process — should be adopted
    monkeypatch.setattr(mgr, "_detect_headless_service", _detect)
    monkeypatch.setattr(mgr, "_is_pid_alive", lambda _pid: True)
    monkeypatch.setattr(mgr, "_check_redis_health", lambda _url: True)

    mgr._check_service("worker", state)

    assert scan_calls == ["worker"], "scan must run for never-touched services"
    assert state.detected_pid == 42424


def test_headless_scan_runs_when_user_started(monkeypatch):
    """``requested_running is True`` (user started, then PID was lost
    e.g. via a reload race) should also allow the scan to recover the
    PID. Only ``is False`` should block."""
    state = _worker_state()
    state.status = ServiceStatus.STOPPED
    state.pid = None
    state.detected_pid = None
    state.requested_running = True  # user started
    mgr = HealthManager(states={"worker": state})

    scan_calls: list[str] = []
    def _detect(_key, _defn):
        scan_calls.append(_key)
        return 11111
    monkeypatch.setattr(mgr, "_detect_headless_service", _detect)
    monkeypatch.setattr(mgr, "_is_pid_alive", lambda _pid: True)
    monkeypatch.setattr(mgr, "_check_redis_health", lambda _url: True)

    mgr._check_service("worker", state)

    assert scan_calls == ["worker"]
    assert state.detected_pid == 11111
