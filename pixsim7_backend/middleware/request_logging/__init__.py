"""
Request Logging Middleware Plugin

Logs HTTP request metrics (method, path, status, duration).
"""

from .manifest import manifest, middleware_class

__all__ = ["manifest", "middleware_class"]
