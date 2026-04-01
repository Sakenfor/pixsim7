"""Reusable debug control endpoint for any FastAPI/Starlette service.

Any service using ``pixsim_logging`` can mount these routes to allow
runtime log level and domain control from the launcher or other tools.

Usage (FastAPI)::

    from pixsim_logging.debug_endpoint import create_debug_router
    app.include_router(create_debug_router(), prefix="/_debug")

This gives the service:
    GET  /_debug/logging          → current level + domain config
    PUT  /_debug/logging/level    → change global log level
    PUT  /_debug/logging/domains  → change per-domain levels

The launcher can discover and call these endpoints for any service
that exposes them, enabling runtime debug control without restarts.
"""
from typing import Dict, List

from pydantic import BaseModel


class LoggingState(BaseModel):
    level: str
    domains: Dict[str, str]
    active_domains: List[str] = []  # domains that have had log events in this process


class LevelUpdate(BaseModel):
    level: str  # DEBUG, INFO, WARNING, ERROR


class DomainsUpdate(BaseModel):
    domains: Dict[str, str]  # {"generation": "DEBUG", "provider": "OFF"}


def create_debug_router():
    """Create a FastAPI router with debug control endpoints."""
    from fastapi import APIRouter, Body

    router = APIRouter(tags=["debug"])

    def _build_state() -> LoggingState:
        from pixsim_logging.domains import get_global_level_display, get_domain_config_display, get_active_domains
        return LoggingState(
            level=get_global_level_display(),
            domains=get_domain_config_display(),
            active_domains=get_active_domains(),
        )

    @router.get("/logging", response_model=LoggingState)
    async def get_logging_state():
        return _build_state()

    @router.put("/logging/level", response_model=LoggingState)
    async def set_logging_level(body: LevelUpdate = Body(...)):
        from pixsim_logging.domains import update_global_level
        update_global_level(body.level)
        return _build_state()

    @router.put("/logging/domains", response_model=LoggingState)
    async def set_logging_domains(body: DomainsUpdate = Body(...)):
        from pixsim_logging.domains import update_domain_config
        update_domain_config(body.domains)
        return _build_state()

    return router
