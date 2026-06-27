"""Unit tests for the shared embedding-daemon base (_daemon.py).

Covers the modality-agnostic /health state machine (loading/error/wedged/ok)
and the in-flight wedge guard — the contract both daemons + the launcher's
InferenceConverter rely on. Pure: no server, no model, no torch.
"""
from __future__ import annotations

import logging
import time

import httpx
import pytest

from pixsim7.embedding._daemon import (
    DaemonState,
    InFlight,
    build_daemon_app,
    evaluate_health,
)


def test_health_loading() -> None:
    code, body = evaluate_health(False, None, InFlight(), 120, {"model_id": "m"})
    assert code == 503
    assert body["status"] == "loading"
    assert body["model_loaded"] is False
    # health_extra is merged into every body, even while loading.
    assert body["model_id"] == "m"


def test_health_ready() -> None:
    code, body = evaluate_health(True, None, InFlight(), 120)
    assert code == 200
    assert body["status"] == "ok"
    assert body["model_loaded"] is True
    assert body["in_flight"] == 0


def test_health_error_takes_precedence_over_ready() -> None:
    code, body = evaluate_health(True, "boom", InFlight(), 120)
    assert code == 503
    assert body["status"] == "error"
    assert "boom" in body["error"]


def test_health_wedged() -> None:
    inflight = InFlight()
    inflight.starts = [time.monotonic() - 10_000]  # ancient in-flight request
    code, body = evaluate_health(True, None, inflight, 120)
    assert code == 503
    assert body["status"] == "wedged"
    assert body["in_flight"] == 1


def test_daemon_state_round_trips() -> None:
    # DaemonState is the holder build_daemon_app manages for single-model daemons.
    state = DaemonState()
    assert (state.ready, state.load_error) == (False, None)
    state.ready = True
    code, _ = evaluate_health(state.ready, state.load_error, InFlight(), 120)
    assert code == 200


def test_inflight_track_cleans_up() -> None:
    inflight = InFlight()
    assert inflight.count == 0
    with inflight.track():
        assert inflight.count == 1
        assert inflight.oldest_age() is not None
    assert inflight.count == 0
    assert inflight.oldest_age() is None


@pytest.mark.asyncio
async def test_build_daemon_app_logs_caller_headers(caplog) -> None:
    state = DaemonState()
    state.ready = True
    inflight = InFlight()

    async def warmup() -> None:
        return None

    app = build_daemon_app(
        title="Unit Daemon",
        warmup=warmup,
        state=state,
        inflight=inflight,
        wedge_threshold_sec=120,
    )

    @app.get("/work")
    async def work():
        return {"ok": True}

    caplog.set_level(logging.INFO, logger="pixsim7.embedding.daemon")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            "/work",
            headers={
                "X-PixSim-Caller": "unit:test",
                "X-PixSim-Context": '{"job":"1"}',
            },
        )

    assert response.status_code == 200
    assert "daemon_request daemon=Unit Daemon caller=unit:test" in caplog.text
    assert 'caller_context={"job":"1"}' in caplog.text
