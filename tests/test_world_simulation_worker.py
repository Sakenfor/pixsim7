from contextlib import asynccontextmanager
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.workers import world_simulation as ws


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class _FakeSession:
    def __init__(self, rows=None, *, execute_error=None):
        self._rows = rows or []
        self._execute_error = execute_error
        self.commit_calls = 0

    async def execute(self, query):  # noqa: ARG002 - shape-compatible stub
        if self._execute_error is not None:
            raise self._execute_error
        return _FakeResult(self._rows)

    async def commit(self):
        self.commit_calls += 1


def _session_provider(sessions):
    session_iter = iter(sessions)

    @asynccontextmanager
    async def _provider():
        yield next(session_iter)

    return _provider


@pytest.fixture(autouse=True)
def _reset_last_tick_cache():
    ws._last_tick_times.clear()
    yield
    ws._last_tick_times.clear()


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (True, True),
        (False, False),
        ("true", True),
        ("TRUE", True),
        ("1", True),
        ("yes", True),
        ("on", True),
        ("false", False),
        ("0", False),
        ("no", False),
        ("off", False),
        ("", False),
        (1, True),
        (0, False),
    ],
)
def test_coerce_bool(value, expected):
    assert ws._coerce_bool(value) is expected


def test_get_simulation_config_returns_empty_for_non_dict_meta():
    world = SimpleNamespace(meta=None)
    assert ws._get_simulation_config(world) == {}


def test_get_simulation_config_returns_empty_for_non_dict_simulation():
    world = SimpleNamespace(meta={"simulation": "invalid"})
    assert ws._get_simulation_config(world) == {}


def test_get_simulation_config_returns_simulation_dict():
    expected = {"pauseSimulation": "true", "tickIntervalSeconds": "2.5"}
    world = SimpleNamespace(meta={"simulation": expected})
    assert ws._get_simulation_config(world) == expected


def test_is_world_paused_coerces_string_booleans():
    assert ws._is_world_paused({"pauseSimulation": "true"}) is True
    assert ws._is_world_paused({"pauseSimulation": "false"}) is False


def test_world_tick_interval_uses_per_world_value_when_valid():
    assert ws._get_world_tick_interval({"tickIntervalSeconds": "2.5"}) == pytest.approx(2.5)


def test_world_tick_interval_falls_back_to_global_default():
    assert ws._get_world_tick_interval({"tickIntervalSeconds": "0"}) == pytest.approx(
        ws.SIMULATION_TICK_INTERVAL
    )


def test_world_auto_tick_disabled_when_world_setting_disabled():
    assert ws._is_world_auto_tick_enabled({"enabled": False}, {}) is False


def test_world_auto_tick_disabled_for_turn_based_profile():
    assert ws._is_world_auto_tick_enabled({}, {"simulationMode": "turn_based"}) is False


def test_world_auto_tick_disabled_for_paused_profile():
    assert ws._is_world_auto_tick_enabled({}, {"simulationMode": "paused"}) is False


def test_world_auto_tick_enabled_for_real_time_profile():
    assert ws._is_world_auto_tick_enabled({}, {"simulationMode": "real_time"}) is True


@pytest.mark.asyncio
async def test_tick_active_worlds_uses_snapshots_and_ticks_only_due_enabled_worlds(monkeypatch):
    bootstrap_session = _FakeSession(
        rows=[
            (1, {"simulation": {"enabled": True, "tickIntervalSeconds": "0.1"}}),
            (2, {"simulation": {"enabled": False}}),
            (None, {"simulation": {"enabled": True}}),
        ]
    )
    world_session = _FakeSession()

    monkeypatch.setattr(
        ws,
        "get_async_session",
        _session_provider([bootstrap_session, world_session]),
    )
    monkeypatch.setattr(ws, "SIMULATION_GLOBAL_ENABLED", True)

    registered_worlds: list[int] = []
    ticked_worlds: list[int] = []

    class _FakeScheduler:
        def __init__(self, db):  # noqa: ARG002 - shape-compatible stub
            self._contexts = {}

        async def register_world(self, world_id: int):
            registered_worlds.append(world_id)

        async def tick_world(self, world_id: int, delta_seconds: float):  # noqa: ARG002
            ticked_worlds.append(world_id)
            self._contexts[world_id] = SimpleNamespace(npcs_simulated_this_tick=3)

        def get_context(self, world_id: int):
            return self._contexts.get(world_id)

    monkeypatch.setattr(ws, "WorldScheduler", _FakeScheduler)

    result = await ws.tick_active_worlds({})

    assert result["worlds_seen"] == 2
    assert result["worlds_ticked"] == 1
    assert result["worlds_disabled"] == 1
    assert result["npcs_simulated"] == 3
    assert result["errors"] == []
    assert registered_worlds == [1]
    assert ticked_worlds == [1]
    assert world_session.commit_calls == 1
    assert 1 in ws._last_tick_times


@pytest.mark.asyncio
async def test_tick_active_worlds_skips_not_due_world_without_scheduler(monkeypatch):
    ws._last_tick_times[7] = datetime.now(timezone.utc)

    bootstrap_session = _FakeSession(
        rows=[(7, {"simulation": {"enabled": True, "tickIntervalSeconds": "60"}})]
    )
    monkeypatch.setattr(ws, "get_async_session", _session_provider([bootstrap_session]))
    monkeypatch.setattr(ws, "SIMULATION_GLOBAL_ENABLED", True)

    class _UnexpectedScheduler:
        def __init__(self, db):  # noqa: ARG002 - shape-compatible stub
            raise AssertionError("Scheduler should not be created for not-due worlds")

    monkeypatch.setattr(ws, "WorldScheduler", _UnexpectedScheduler)

    result = await ws.tick_active_worlds({})

    assert result["worlds_seen"] == 1
    assert result["worlds_not_due"] == 1
    assert result["worlds_ticked"] == 0
    assert result["errors"] == []


@pytest.mark.asyncio
async def test_get_simulation_status_reads_scalar_rows_and_applies_fallbacks(monkeypatch):
    ws._last_tick_times[1] = datetime(2026, 3, 10, 12, 0, tzinfo=timezone.utc)

    status_session = _FakeSession(
        rows=[
            (
                1,
                "Alpha",
                {
                    "simulation": {"enabled": True, "timeScale": 120},
                    "gameProfile": {"simulationMode": "real_time"},
                },
                42.5,
            ),
            (
                2,
                "",
                {
                    "simulation": {"pauseSimulation": "true"},
                    "gameProfile": {"simulationMode": "paused"},
                },
                None,
            ),
            (3, None, "not-a-meta-dict", "bad-time"),
            (None, "Ignored", {}, 99.0),
        ]
    )
    monkeypatch.setattr(ws, "get_async_session", _session_provider([status_session]))
    monkeypatch.setattr(ws, "SIMULATION_GLOBAL_ENABLED", True)

    status = await ws.get_simulation_status({})

    assert set(status["worlds"].keys()) == {1, 2, 3}
    assert status["worlds"][1]["name"] == "Alpha"
    assert status["worlds"][1]["world_time"] == pytest.approx(42.5)
    assert status["worlds"][1]["time_scale"] == 120
    assert status["worlds"][1]["last_tick"] == "2026-03-10T12:00:00+00:00"

    assert status["worlds"][2]["name"] == "World 2"
    assert status["worlds"][2]["paused"] is True
    assert status["worlds"][2]["auto_tick_enabled"] is False
    assert status["worlds"][2]["world_time"] == pytest.approx(0.0)

    assert status["worlds"][3]["name"] == "World 3"
    assert status["worlds"][3]["world_time"] == pytest.approx(0.0)
    assert status["worlds"][3]["auto_tick_enabled"] is True


@pytest.mark.asyncio
async def test_get_simulation_status_returns_defaults_on_database_error(monkeypatch):
    error_session = _FakeSession(execute_error=RuntimeError("db-down"))
    monkeypatch.setattr(ws, "get_async_session", _session_provider([error_session]))
    monkeypatch.setattr(ws, "SIMULATION_GLOBAL_ENABLED", True)

    status = await ws.get_simulation_status({})

    assert status["enabled"] is True
    assert status["worlds"] == {}
