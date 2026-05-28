"""Diagnostic Tests API.

Admin-only routes for listing, starting, streaming, and cancelling
diagnostics — sister to ``api.v1.dev_testing`` (which is the read-only
catalog of pytest suites).  Both live under ``/dev/testing/*`` so the
dev-tools family stays cohesive on the URL surface; this module's routes
require admin while the catalog requires only codegen-user.

Routes (all under /api/v1/dev/testing/diagnostics):

    GET   /                              — list diagnostic specs
    POST  /{diagnostic_id}/run           — start a run, returns run_id
    GET   /runs                          — list recent runs (summary)
    GET   /runs/{run_id}                 — run detail incl. events buffered so far
    POST  /runs/{run_id}/cancel          — request cancellation
    WS    /runs/{run_id}/stream?token=…  — live event stream

The WebSocket auth uses a ``?token=<jwt>`` query param consumed by
``get_current_principal_ws`` — the existing WS auth helper.  Token comes
from the same auth store as REST calls.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated, Any, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import (
    CurrentDiagnosticsUser,
    get_auth_service,
    get_current_principal_ws,
)
from pixsim7.backend.main.services.user import AuthService
from pixsim7.backend.main.services.diagnostics import (  # noqa: F401  (registrations side-effect)
    Diagnostic,
    DiagnosticParam,
    diagnostic_registry,
    diagnostic_run_manager,
)
from pixsim7.backend.main.services.diagnostics import registrations as _diagnostic_registrations  # noqa: F401
from pixsim7.backend.main.services.diagnostics.applied_ledger import list_backfill_status
from pixsim7.backend.main.infrastructure.database.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dev/testing/diagnostics", tags=["dev", "testing", "diagnostics"])


# ── Request / response models ────────────────────────────────────────────


class RunRequest(BaseModel):
    params: dict[str, Any] = Field(default_factory=dict)


class RunStartedResponse(BaseModel):
    run_id: str
    diagnostic_id: str
    started_at: str


# ── Param coercion ───────────────────────────────────────────────────────


def _coerce_params(diagnostic: Diagnostic, raw: dict[str, Any]) -> dict[str, Any]:
    """Apply defaults + light coercion against ``diagnostic.spec.params``.

    Unknown keys are dropped silently — diagnostic specs are the contract.
    Required-but-missing params raise 422.
    """
    out: dict[str, Any] = {}
    for spec in diagnostic.get_spec().params:
        if spec.name in raw:
            value = raw[spec.name]
        elif spec.default is not None:
            value = spec.default
        elif spec.required:
            raise HTTPException(
                status_code=422,
                detail=f"Missing required param '{spec.name}' for diagnostic '{diagnostic.spec.id}'",
            )
        else:
            continue
        out[spec.name] = _coerce_one(spec, value)
    return out


def _coerce_one(spec: DiagnosticParam, value: Any) -> Any:
    if value is None:
        return value
    try:
        if spec.kind == "int":
            return int(value)
        if spec.kind == "float":
            return float(value)
        if spec.kind == "bool":
            if isinstance(value, str):
                return value.lower() in ("1", "true", "yes", "on")
            return bool(value)
        if spec.kind == "select":
            value = str(value)
            if spec.options and value not in spec.options:
                raise HTTPException(
                    status_code=422,
                    detail=f"Param '{spec.name}' must be one of {spec.options}",
                )
            return value
        # string fall-through
        return str(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Param '{spec.name}' invalid for kind {spec.kind}: {exc}",
        )


# ── Routes ───────────────────────────────────────────────────────────────


@router.get("", summary="List registered diagnostics")
async def list_diagnostics(_: CurrentDiagnosticsUser) -> dict[str, Any]:
    items = [d.get_spec().to_dict() for d in diagnostic_registry.values()]
    items.sort(key=lambda s: s["label"])
    return {"diagnostics": items, "total": len(items)}


@router.get("/backfills/applied", summary="Per-script backfill applied-state (ledger)")
async def list_backfills_applied(
    _: CurrentDiagnosticsUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Applied-state of every discovered ``--apply`` script, from the
    ``backfill_applied`` ledger: 'never applied' vs 'last applied <when> by
    <actor>, N rows', plus whether the *current* script version was applied."""
    items = await list_backfill_status(db)
    return {"backfills": items, "total": len(items)}


@router.post(
    "/{diagnostic_id}/run",
    summary="Start a diagnostic run",
    response_model=RunStartedResponse,
)
async def run_diagnostic(
    diagnostic_id: str,
    body: RunRequest,
    principal: CurrentDiagnosticsUser,
) -> RunStartedResponse:
    diagnostic = diagnostic_registry.get_or_none(diagnostic_id)
    if diagnostic is None:
        raise HTTPException(status_code=404, detail=f"Unknown diagnostic '{diagnostic_id}'")
    coerced = _coerce_params(diagnostic, body.params)
    # ``source`` resolves to ``agent:<profile_id>`` for agent principals,
    # ``user:<id>`` for humans, ``service:bridge`` for bridge tokens — so the
    # persisted ``started_by`` attributes the run to whoever launched it,
    # including agents reaching this via the MCP diagnostics contract.
    run = await diagnostic_run_manager.start(
        diagnostic, coerced, started_by=principal.source
    )
    logger.info(
        "diagnostic_run_started diagnostic_id=%s run_id=%s by=%s",
        diagnostic_id, run.run_id, run.started_by,
    )
    return RunStartedResponse(
        run_id=run.run_id,
        diagnostic_id=run.diagnostic_id,
        started_at=run.started_at.isoformat(),
    )


@router.get("/runs", summary="List recent diagnostic runs")
async def list_runs(_: CurrentDiagnosticsUser, limit: int = Query(25, ge=1, le=200)) -> dict[str, Any]:
    runs = await diagnostic_run_manager.list_summaries(limit=limit)
    return {"runs": runs, "total": len(runs)}


@router.get("/runs/{run_id}", summary="Get a single diagnostic run with its event log")
async def get_run(run_id: str, _: CurrentDiagnosticsUser) -> dict[str, Any]:
    detail = await diagnostic_run_manager.get_detail(run_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Unknown run '{run_id}'")
    return detail


@router.post("/runs/{run_id}/cancel", summary="Cancel a running diagnostic")
async def cancel_run(run_id: str, _: CurrentDiagnosticsUser) -> dict[str, Any]:
    run = diagnostic_run_manager.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Unknown run '{run_id}'")
    if run.is_finished():
        raise HTTPException(
            status_code=409,
            detail=f"Run '{run_id}' is already {run.status}",
        )
    diagnostic_run_manager.cancel(run_id)
    return {"run_id": run_id, "status": "cancelling"}


# ── WebSocket stream ─────────────────────────────────────────────────────


@router.websocket("/runs/{run_id}/stream")
async def stream_run(
    websocket: WebSocket,
    run_id: str,
    token: Annotated[Optional[str], Query()] = None,
    auth_service: AuthService = Depends(get_auth_service),
):
    """Live event stream for one diagnostic run.

    Auth: the JWT comes in via ``?token=<jwt>``.  Browser WebSockets can't
    set Authorization headers, so this matches the conventional pattern.
    """
    principal = await get_current_principal_ws(token=token, auth_service=auth_service)
    if principal is None or not principal.is_admin():
        # 1008 = policy violation; signals "auth required" to the client.
        await websocket.close(code=1008, reason="admin authentication required")
        return

    run = diagnostic_run_manager.get(run_id)
    if run is None:
        # Not active in memory — replay from the durable store if we have it
        # (run finished earlier, possibly on another client or before a reload).
        # The persisted event list already includes the terminal event, so the
        # client renders the finished run, then we close.
        detail = await diagnostic_run_manager.get_detail(run_id)
        await websocket.accept()
        if detail is None:
            await websocket.send_json({"type": "error", "message": f"Unknown run '{run_id}'"})
            await websocket.close()
            return
        await websocket.send_json(
            {"type": "connected", "run_id": run_id, "status": detail.get("status")}
        )
        for event in detail.get("events", []):
            await websocket.send_json(event)
        await websocket.close()
        return

    await websocket.accept()
    await websocket.send_json(
        {"type": "connected", "run_id": run_id, "status": run.status}
    )

    try:
        async for event in run.subscribe():
            await websocket.send_json(event)
            # Optional ping handling: drain any incoming text without blocking.
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.0)
                if msg == "ping":
                    await websocket.send_json({"type": "pong"})
            except (asyncio.TimeoutError, Exception):
                pass
    except WebSocketDisconnect:
        logger.debug("diagnostic stream client disconnected run_id=%s", run_id)
    except Exception as exc:
        logger.warning("diagnostic stream error run_id=%s: %s", run_id, exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
