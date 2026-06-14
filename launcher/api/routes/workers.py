"""Workers route — arq worker health + queue depth, read straight from Redis.

Backend-independent: reads the shared arq worker state (heartbeats, stats,
queue depth) directly from Redis so the Workers panel works even when the
backend API is down but the workers themselves are running. See
``launcher/core/worker_tasks.py``.
"""
from __future__ import annotations

from fastapi import APIRouter

from launcher.core.worker_tasks import get_worker_overview

router = APIRouter(prefix="/workers", tags=["workers"])


@router.get("/overview")
async def workers_overview():
    """Per-family worker health + queue depth (pending / active) from Redis."""
    return await get_worker_overview()
