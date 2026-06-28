"""Worker observability — read arq worker health + queue depth from Redis.

The launcher supervises the arq workers independently of the backend (PID +
Redis probe), so this reads the shared worker state straight from Redis instead
of proxying the backend's ``/admin/health``. That keeps the Workers panel alive
even when the backend is down but the workers are not.

Self-contained by design: the launcher runs as a separate process and does not
import backend internals (see ``launcher/core/worker_detection.py`` and the note
in ``pixsim7/backend/main/workers/worker_families.py``). The role→queue table
below mirrors the backend's canonical constants — keep them in sync if a sixth
worker family is added:

  * queues               → ``pixsim7/backend/main/infrastructure/queue/queue_names.py``
  * roles + key schema   → ``pixsim7/backend/main/workers/health.py``

All Redis reads are issued as a single pipeline and the client is reused across
requests, so each poll is one round trip rather than ~20.
"""
from __future__ import annotations

import ast
import json
import logging
import os
import time
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from launcher.core.environment import ROOT

logger = logging.getLogger("launcher.core.worker_tasks")

# (backend role, launcher service key, queue name, display label).
# Mirrors backend WORKER_FAMILIES — see module docstring.
WORKER_FAMILIES: tuple[tuple[str, str, str, str], ...] = (
    ("main", "worker", "arq:queue", "Main"),
    ("retry", "generation-retry", "arq:queue:generation-retry", "Generation Retry"),
    ("simulation", "simulation-worker", "arq:queue:simulation-scheduler", "Simulation"),
    ("automation", "automation-worker", "arq:queue:automation", "Automation"),
    ("media_maintenance", "media-maintenance-worker", "arq:queue:media-maintenance", "Media Maintenance"),
    ("derivatives", "derivatives-worker", "arq:queue:derivatives", "Derivatives"),
)

_ARQ_SETTINGS_BY_ROLE = {
    "main": "WorkerSettings",
    "retry": "GenerationRetryWorkerSettings",
    "simulation": "SimulationWorkerSettings",
    "automation": "AutomationWorkerSettings",
    "media_maintenance": "MediaMaintenanceWorkerSettings",
    "derivatives": "DerivativesWorkerSettings",
}

_TASK_LABELS = {
    "process_generation": "Generation processing",
    "process_analysis": "Asset analysis",
    "process_derivatives": "Media derivatives",
    "process_ingestion": "Media ingestion",
    "process_prompt_tagging": "Prompt tagging",
    "process_prompt_embedding": "Prompt embeddings",
    "process_chain_execution": "Generation chains",
    "process_ephemeral_chain_execution": "Ephemeral chains",
    "process_ephemeral_fanout_execution": "Ephemeral fanout",
    "run_analysis_backfill_batch": "Analysis backfill",
    "poll_job_statuses": "Provider status polling",
    "poll_generation_once": "One-off generation poll",
    "requeue_pending_generations": "Pending generation recovery",
    "requeue_pending_analyses": "Pending analysis recovery",
    "refresh_stale_account_credits": "Account credit refresh",
    "cleanup_old_logs": "Log cleanup",
    "reconcile_account_counters": "Account counter reconcile",
    "tick_active_worlds": "World simulation ticks",
    "process_automation": "Automation executions",
    "run_automation_loops": "Automation loops",
    "queue_pending_executions": "Queue pending automation",
    "poll_device_ads": "Device ad polling",
    "poll_device_reconnects": "Device reconnects",
    "process_relocation": "Archive relocate",
    "process_restore": "Archive restore",
    "run_signal_backfill_batch": "Signal-scan backfill",
    "reload_logging_config": "Logging config reload",
    "update_main_heartbeat": "Heartbeat",
    "update_retry_heartbeat": "Heartbeat",
    "update_simulation_heartbeat": "Heartbeat",
    "update_automation_heartbeat": "Heartbeat",
    "update_media_maintenance_heartbeat": "Heartbeat",
}

_RUNTIME_TASK_NAMES = {
    "reload_logging_config",
    "update_main_heartbeat",
    "update_retry_heartbeat",
    "update_simulation_heartbeat",
    "update_automation_heartbeat",
    "update_media_maintenance_heartbeat",
}

_HEARTBEAT_KEY = "arq:worker:{role}:heartbeat"
_STATS_KEY = "arq:worker:{role}:stats"

# Cached redis.asyncio client, reused across requests. Reset to None on any
# failure so the next request reconnects.
_client: Any = None


def _redis_url() -> str:
    """Resolve the arq Redis URL the same way the launcher health probe does."""
    return os.getenv("ARQ_REDIS_URL") or os.getenv("REDIS_URL") or "redis://127.0.0.1:6380/0"


async def _aclose(client) -> None:
    try:
        await client.aclose()
    except AttributeError:
        try:
            await client.close()
        except Exception:
            pass
    except Exception:
        pass


async def _reset_client() -> None:
    global _client
    client, _client = _client, None
    if client is not None:
        await _aclose(client)


def _get_client(url: str):
    """Return a cached redis.asyncio client, creating it on first use."""
    global _client
    if _client is not None:
        return _client
    import redis.asyncio as aioredis  # imported lazily; absent in minimal envs

    _client = aioredis.from_url(
        url, decode_responses=True, socket_connect_timeout=1, socket_timeout=1,
    )
    return _client


def _as_int(v: Any) -> Optional[int]:
    return v if isinstance(v, int) else None


def _node_name(node: ast.AST) -> Optional[str]:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def _extract_function_names(value: ast.AST) -> list[str]:
    if not isinstance(value, (ast.List, ast.Tuple)):
        return []
    names: list[str] = []
    for item in value.elts:
        name = _node_name(item)
        if name:
            names.append(name)
    return names


def _extract_cron_names(value: ast.AST) -> list[str]:
    if not isinstance(value, (ast.List, ast.Tuple)):
        return []
    names: list[str] = []
    for item in value.elts:
        if isinstance(item, ast.Call) and item.args:
            name = _node_name(item.args[0])
        else:
            name = _node_name(item)
        if name:
            names.append(name)
    return names


def _task_label(name: str) -> str:
    if name in _TASK_LABELS:
        return _TASK_LABELS[name]
    cleaned = name
    for prefix in ("process_", "run_"):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]
            break
    for suffix in ("_batch", "_job"):
        if cleaned.endswith(suffix):
            cleaned = cleaned[:-len(suffix)]
            break
    return cleaned.replace("_", " ").title()


def _task_records(names: list[str]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    records: list[dict[str, Any]] = []
    for name in names:
        if name in seen:
            continue
        seen.add(name)
        records.append({
            "name": name,
            "label": _task_label(name),
            "runtime": name in _RUNTIME_TASK_NAMES,
        })
    return records


@lru_cache(maxsize=1)
def _service_descriptions() -> dict[str, str]:
    descriptions: dict[str, str] = {}
    services_dir = Path(ROOT) / "services"
    try:
        for path in services_dir.glob("*/pixsim.service.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(data, dict):
                continue
            service_id = data.get("id")
            description = data.get("description")
            if isinstance(service_id, str) and isinstance(description, str) and description.strip():
                descriptions[service_id] = description.strip()
    except Exception as exc:
        logger.debug("worker_manifest_descriptions_unavailable error=%s", exc)
    return descriptions


@lru_cache(maxsize=1)
def _arq_settings_metadata() -> dict[str, dict[str, list[str]]]:
    path = Path(ROOT) / "pixsim7" / "backend" / "main" / "workers" / "arq_worker.py"
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.debug("worker_arq_metadata_parse_failed path=%s error=%s", path, exc)
        return {}

    wanted = set(_ARQ_SETTINGS_BY_ROLE.values())
    metadata: dict[str, dict[str, list[str]]] = {}
    for node in tree.body:
        if not isinstance(node, ast.ClassDef) or node.name not in wanted:
            continue
        entry = {"functions": [], "cron_functions": []}
        for stmt in node.body:
            if not isinstance(stmt, ast.Assign):
                continue
            target_names = {_node_name(target) for target in stmt.targets}
            if "functions" in target_names:
                entry["functions"] = _extract_function_names(stmt.value)
            elif "cron_jobs" in target_names:
                entry["cron_functions"] = _extract_cron_names(stmt.value)
        metadata[node.name] = entry
    return metadata


@lru_cache(maxsize=1)
def _worker_metadata_by_role() -> dict[str, dict[str, Any]]:
    descriptions = _service_descriptions()
    arq_metadata = _arq_settings_metadata()
    metadata: dict[str, dict[str, Any]] = {}
    for role, service_key, _queue, _label in WORKER_FAMILIES:
        settings_class = _ARQ_SETTINGS_BY_ROLE.get(role)
        arq = arq_metadata.get(settings_class or "", {})
        metadata[role] = {
            "description": descriptions.get(service_key),
            "settings_class": settings_class,
            "functions": _task_records(arq.get("functions", [])),
            "cron_functions": _task_records(arq.get("cron_functions", [])),
        }
    return metadata


def _empty_family(role: str, service_key: str, queue: str, label: str) -> dict[str, Any]:
    metadata = _worker_metadata_by_role().get(role, {})
    return {
        "role": role,
        "label": label,
        "service_key": service_key,
        "queue": queue,
        "description": metadata.get("description"),
        "settings_class": metadata.get("settings_class"),
        "functions": metadata.get("functions", []),
        "cron_functions": metadata.get("cron_functions", []),
        "alive": False,
        "heartbeat_age_s": None,
        "uptime_s": None,
        "hostname": None,
        "pending": None,
        "active": None,
        "processed_jobs": None,
        "failed_jobs": None,
        "success_rate": None,
        "memory_mb": None,
        "cpu_percent": None,
    }


def _offline(url: str, error: str) -> dict[str, Any]:
    return {
        "redis_url": url,
        "redis_ok": False,
        "in_progress_global": None,
        "families": [_empty_family(*m) for m in WORKER_FAMILIES],
        "error": error,
    }


def _parse_family(meta, hb_raw, st_raw, zc, ll, inprog, now) -> dict[str, Any]:
    role, service_key, queue, label = meta
    fam = _empty_family(role, service_key, queue, label)

    if isinstance(hb_raw, (str, bytes)):
        try:
            hb = json.loads(hb_raw)
            fam["alive"] = True
            fam["uptime_s"] = hb.get("uptime_seconds")
            fam["hostname"] = hb.get("hostname")
            ts = hb.get("timestamp")
            if ts:
                try:
                    fam["heartbeat_age_s"] = max(0.0, now - datetime.fromisoformat(ts).timestamp())
                except Exception:
                    pass
        except Exception:
            pass

    if isinstance(st_raw, (str, bytes)):
        try:
            st = json.loads(st_raw)
            fam["processed_jobs"] = st.get("processed_jobs")
            fam["failed_jobs"] = st.get("failed_jobs")
            fam["success_rate"] = st.get("success_rate")
            fam["memory_mb"] = st.get("memory_mb")
            fam["cpu_percent"] = st.get("cpu_percent")
        except Exception:
            pass

    # arq queues are sorted sets (ZCARD); fall back to LLEN for list-based configs.
    pending = _as_int(zc)
    if pending is None:
        pending = _as_int(ll)
    fam["pending"] = pending
    fam["active"] = _as_int(inprog)

    return fam


async def get_worker_overview() -> dict[str, Any]:
    """Return per-family worker health + queue depth, read straight from Redis.

    Never raises. On any Redis failure, returns ``redis_ok=false`` with each
    family carrying ``alive=false`` so the UI can render an offline state.
    """
    url = _redis_url()

    try:
        client = _get_client(url)
    except ImportError:
        return _offline(url, "redis library unavailable")

    # One pipeline for everything: per family GET hb, GET stats, ZCARD queue,
    # LLEN queue, ZCARD in-progress; plus the global in-progress set.
    try:
        pipe = client.pipeline(transaction=False)
        for role, _sk, queue, _label in WORKER_FAMILIES:
            pipe.get(_HEARTBEAT_KEY.format(role=role))
            pipe.get(_STATS_KEY.format(role=role))
            pipe.zcard(queue)
            pipe.llen(queue)
            pipe.zcard(f"arq:in-progress:{queue}")
        pipe.zcard("arq:in-progress")
        results = await pipe.execute(raise_on_error=False)
    except Exception as e:
        await _reset_client()
        return _offline(url, f"Redis unreachable: {e}")

    now = time.time()
    families: list[dict[str, Any]] = []
    for i, meta in enumerate(WORKER_FAMILIES):
        base = i * 5
        families.append(_parse_family(meta, *results[base:base + 5], now))
    in_progress_global = _as_int(results[-1]) if results else None

    return {
        "redis_url": url,
        "redis_ok": True,
        "in_progress_global": in_progress_global,
        "families": families,
        "error": None,
    }
