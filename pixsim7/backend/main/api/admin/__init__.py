"""Admin API endpoints"""
from .database import router as database_router
from .migrations import router as migrations_router

__all__ = ['database_router', 'migrations_router']
