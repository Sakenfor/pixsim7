"""
CORS Middleware Plugin

Handles Cross-Origin Resource Sharing (CORS) for API requests.
"""

from .manifest import manifest, middleware_class

__all__ = ["manifest", "middleware_class"]
