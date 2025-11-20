"""
Middleware plugin infrastructure

Provides dynamic loading and management of HTTP middleware.
"""

from .types import (
    MiddlewareManifest,
    MiddlewarePlugin,
    MiddlewareHooks,
    MiddlewareEvents,
    middleware_hooks,
)
from .manager import MiddlewareManager, init_middleware_manager

__all__ = [
    "MiddlewareManifest",
    "MiddlewarePlugin",
    "MiddlewareHooks",
    "MiddlewareEvents",
    "middleware_hooks",
    "MiddlewareManager",
    "init_middleware_manager",
]
