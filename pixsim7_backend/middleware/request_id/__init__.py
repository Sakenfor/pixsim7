"""
Request ID Middleware Plugin

Injects unique request IDs for request tracing.
"""

from .manifest import manifest, middleware_class

__all__ = ["manifest", "middleware_class"]
