"""
Auth API Routes Plugin

Provides authentication endpoints (register, login, logout).
"""

from .manifest import manifest, router

__all__ = ["manifest", "router"]
