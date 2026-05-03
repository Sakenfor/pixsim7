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
