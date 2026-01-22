"""API Routes."""

from .services import router as services_router
from .logs import router as logs_router
from .events import router as events_router
from .health import router as health_router
from .buildables import router as buildables_router
from .settings import router as settings_router
from .codegen import router as codegen_router

__all__ = [
    'services_router',
    'logs_router',
    'events_router',
    'health_router',
    'buildables_router',
    'settings_router',
    'codegen_router',
]
