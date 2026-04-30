"""Read-only debug status endpoint for any FastAPI/Starlette service.

Any service using ``pixsim_logging`` can mount this route to expose its
current logging state for status dashboards (e.g. the launcher's Debug
panel). Writes are not exposed here — all logging config changes flow
through the canonical persisted path (``/admin/logging/config`` →
``system_config`` applier → in-memory state).

Usage (FastAPI)::

    from pixsim_logging.debug_endpoint import create_debug_router
    app.include_router(create_debug_router(), prefix="/_debug")

This gives the service::

    GET /_debug/logging  → current level + domain config + active domains
"""
from typing import Dict, List

from pydantic import BaseModel


class LoggingState(BaseModel):
    level: str
    domains: Dict[str, str]
    active_domains: List[str] = []  # domains that have had log events in this process


def create_debug_router():
    """Create a FastAPI router with a read-only logging-state endpoint."""
    from fastapi import APIRouter

    router = APIRouter(tags=["debug"])

    @router.get("/logging", response_model=LoggingState)
    async def get_logging_state():
        from pixsim_logging.domains import (
            get_global_level_display,
            get_domain_config_display,
            get_active_domains,
        )
        return LoggingState(
            level=get_global_level_display(),
            domains=get_domain_config_display(),
            active_domains=get_active_domains(),
        )

    return router
