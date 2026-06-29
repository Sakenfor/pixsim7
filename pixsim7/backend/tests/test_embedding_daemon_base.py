"""Unit tests for the shared embedding-daemon base (_daemon.py).

Covers the modality-agnostic /health state machine (loading/error/wedged/ok)
and the in-flight wedge guard — the contract both daemons + the launcher's
InferenceConverter rely on. Pure: no server, no model, no torch.
"""
from __future__ import annotations

import json
import logging
import time

import httpx
import pytest
from fastapi import FastAPI

from pixsim7.embedding._daemon import (
    DaemonState,
    InFlight,
    ModelSlot,
    attach_config_route,
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


# ── ModelSlot (single-model warm-swap) ───────────────────────────────────────


@pytest.mark.asyncio
async def test_modelslot_swap_loads_and_reports() -> None:
    loads: list[str] = []
    slot = ModelSlot(load=lambda mid: loads.append(mid) or f"model:{mid}")
    assert not slot.ready and slot.key is None
    obj = await slot.swap("m/a")
    assert obj == "model:m/a"
    assert slot.ready and slot.key == "m/a"
    assert slot.get() == "model:m/a"
    assert loads == ["m/a"]


@pytest.mark.asyncio
async def test_modelslot_swap_same_id_is_noop() -> None:
    loads: list[str] = []
    slot = ModelSlot(load=lambda mid: loads.append(mid) or object())
    await slot.swap("m/a")
    await slot.swap("m/a")
    assert loads == ["m/a"]  # second swap to the same id did not reload


@pytest.mark.asyncio
async def test_modelslot_initial_load_failure_sets_error() -> None:
    def boom(_mid):
        raise RuntimeError("weights missing")

    slot = ModelSlot(load=boom)
    with pytest.raises(RuntimeError):
        await slot.swap("m/a")
    assert slot.load_error and "weights missing" in slot.load_error
    assert not slot.ready


@pytest.mark.asyncio
async def test_modelslot_swap_failure_keeps_live_model() -> None:
    state = {"fail": False}

    def load(mid):
        if state["fail"]:
            raise RuntimeError("boom")
        return f"model:{mid}"

    slot = ModelSlot(load=load)
    await slot.swap("m/a")  # live
    state["fail"] = True
    with pytest.raises(RuntimeError):
        await slot.swap("m/b")  # swap fails with a live model present
    assert slot.key == "m/a"  # old model still served
    assert slot.load_error is None  # daemon stays healthy
    assert slot.get() == "model:m/a"


def test_modelslot_get_before_load_raises() -> None:
    slot = ModelSlot(load=lambda mid: None)
    with pytest.raises(RuntimeError):
        slot.get()


@pytest.mark.asyncio
async def test_attach_config_route_swaps_model() -> None:
    slot = ModelSlot(load=lambda mid: f"model:{mid}")
    await slot.swap("m/a")
    set_model = attach_config_route(FastAPI(), slot)

    class _Body:
        model = "m/b"

    res = await set_model(_Body())
    assert res == {"model_id": "m/b"}
    assert slot.key == "m/b"


@pytest.mark.asyncio
async def test_attach_config_route_load_failure_returns_503() -> None:
    state = {"fail": False}

    def load(mid):
        if state["fail"]:
            raise RuntimeError("nope")
        return mid

    slot = ModelSlot(load=load)
    await slot.swap("m/a")
    set_model = attach_config_route(FastAPI(), slot)
    state["fail"] = True

    class _Body:
        model = "m/bad"

    res = await set_model(_Body())  # JSONResponse on failure
    assert res.status_code == 503
    body = json.loads(res.body)
    assert body["error"] == "model_load_failed"
    assert body["model_id"] == "m/bad"
    assert slot.key == "m/a"  # live model untouched
