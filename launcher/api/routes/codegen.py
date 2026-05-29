"""
Codegen Routes - Endpoints for codegen task discovery.
"""

import json
import time
import urllib.error
import urllib.request
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from launcher.core.codegen import load_codegen_tasks, run_codegen_task
from pixsim7.codegen import compute_task_output_stats
from pixsim7.codegen.manifest import _resolve_repo_root

from ..models import CodegenRunRequest, CodegenRunResponse, CodegenTaskResponse, CodegenTasksResponse


router = APIRouter(prefix="/codegen", tags=["codegen"])

# Display labels for service ids referenced by `task.requires` in the manifest.
# Single source of truth for service-id → human label mapping in the launcher.
# If a task lists a service not in this map, the raw service id falls through
# as the label (still informative).
SERVICE_LABELS: dict[str, str] = {
    "main-api": "Backend API",
}


@router.get("/tasks")
async def list_codegen_tasks():
    tasks = load_codegen_tasks()

    # Resolve running state once per unique required-service id.
    needed_services = {t.requires for t in tasks if t.requires}
    running_state: dict[str, bool] = {}
    try:
        from ..dependencies import get_container
        container = get_container()
        pm = container.get_process_manager()
        for svc in needed_services:
            running_state[svc] = pm.is_running(svc) if pm else False
    except Exception:
        pass

    def _service_dep(svc: str | None) -> dict | None:
        if not svc:
            return None
        return {"service": svc, "label": SERVICE_LABELS.get(svc, svc)}

    return {
        "tasks": [
            {
                "id": task.id,
                "description": task.description,
                "script": task.script,
                "supports_check": task.supports_check,
                "check_only": task.check_only,
                "args": task.args,
                "output_path": task.output_path,
                "requires": task.requires,
                "timeout_ms": task.timeout_ms,
                "groups": task.groups,
                "requires_service": _service_dep(task.requires),
                "service_running": (
                    running_state.get(task.requires, True) if task.requires else True
                ),
            }
            for task in tasks
        ],
        "total": len(tasks),
    }


# ── OpenAPI tag-stats ──
# Cached snapshot of per-tag operation counts from the live OpenAPI schema, used by
# the launcher Codegen tab to label scoped openapi-* tasks with what they cover.

_OPENAPI_STATS_CACHE: Dict[str, Any] = {"data": None, "ts": 0.0}
_OPENAPI_STATS_TTL = 30.0  # seconds — short enough to feel fresh, long enough to avoid hammering main-api
_OPENAPI_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
_OPENAPI_URL = "http://localhost:8000/openapi.json"


def _compute_openapi_stats(spec: dict) -> Dict[str, Any]:
    per_tag: Dict[str, int] = {}
    total_ops = 0
    for path_item in (spec.get("paths") or {}).values():
        if not isinstance(path_item, dict):
            continue
        for method, op in path_item.items():
            if method.lower() not in _OPENAPI_METHODS or not isinstance(op, dict):
                continue
            total_ops += 1
            tags = op.get("tags") or ["<untagged>"]
            for t in tags:
                per_tag[str(t)] = per_tag.get(str(t), 0) + 1
    return {"total_ops": total_ops, "per_tag": per_tag}


@router.get("/openapi-stats")
async def get_openapi_stats():
    """
    Per-tag operation counts from the live OpenAPI schema.

    Cached for 30s to avoid re-fetching the (large) spec on every UI render.
    Returns `{ok: false, error}` when main-api isn't reachable so the UI can render
    "stats unavailable" gracefully without a stack trace.
    """
    now = time.time()
    if _OPENAPI_STATS_CACHE["data"] is not None and now - _OPENAPI_STATS_CACHE["ts"] < _OPENAPI_STATS_TTL:
        return _OPENAPI_STATS_CACHE["data"]

    try:
        req = urllib.request.Request(_OPENAPI_URL, headers={"User-Agent": "pixsim-launcher"})
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            spec = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, ConnectionError, TimeoutError) as exc:
        return {"ok": False, "error": f"main-api unreachable: {exc}"}
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        return {"ok": False, "error": f"invalid openapi.json: {exc}"}

    stats = _compute_openapi_stats(spec)
    data = {"ok": True, "fetched_at": now, **stats}
    _OPENAPI_STATS_CACHE.update({"data": data, "ts": now})
    return data


@router.get("/output-stats")
async def get_output_stats(task_id: str):
    """
    Per-task output filesystem stats: file count, total size, last-modified,
    most-recent file, and (for openapi) generated-symbol count.

    Local-FS introspection — answers "is my generated code there and is it
    fresh?". Mirror of the helper exists in `pixsim7.codegen.output_stats`
    so the main backend can expose the same shape later for its own filesystem.
    """
    try:
        repo_root = _resolve_repo_root()
    except Exception as exc:  # pragma: no cover — defensive
        return {"ok": False, "task_id": task_id, "error": f"cannot locate repo root: {exc}"}
    return compute_task_output_stats(task_id, repo_root)


@router.post("/run", response_model=CodegenRunResponse)
async def run_codegen_task_endpoint(payload: CodegenRunRequest):
    try:
        result = run_codegen_task(payload.task_id, check_mode=payload.check)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CodegenRunResponse(
        task_id=result.task_id,
        ok=result.ok,
        exit_code=result.exit_code,
        duration_ms=result.duration_ms,
        stdout=result.stdout,
        stderr=result.stderr,
    )
