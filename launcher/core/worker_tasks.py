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

import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger("launcher.core.worker_tasks")

# (backend role, launcher service key, queue name, display label).
# Mirrors backend WORKER_FAMILIES — see module docstring.
WORKER_FAMILIES: tuple[tuple[str, str, str, str], ...] = (
    ("main", "worker", "arq:queue", "Main"),
    ("retry", "generation-retry", "arq:queue:generation-retry", "Generation Retry"),
    ("simulation", "simulation-worker", "arq:queue:simulation-scheduler", "Simulation"),
    ("automation", "automation-worker", "arq:queue:automation", "Automation"),
    ("media_maintenance", "media-maintenance-worker", "arq:queue:media-maintenance", "Media Maintenance"),
)

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


def _empty_family(role: str, service_key: str, queue: str, label: str) -> dict[str, Any]:
    return {
        "role": role,
        "label": label,
        "service_key": service_key,
        "queue": queue,
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
