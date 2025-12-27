"""
FastAPI dependencies for plugin context injection.

Provides get_plugin_context() dependency factory for route plugins.

Usage in plugin routes:
    from pixsim7.backend.main.infrastructure.plugins.dependencies import get_plugin_context

    @router.get("/my-endpoint")
    async def my_endpoint(
        ctx: PluginContext = Depends(get_plugin_context("my_plugin_id"))
    ):
        world = await ctx.world.get_world(world_id)
        await ctx.session_write.set_session_flag(session_id, "key", "value")
        ctx.log.info("Endpoint called")
        return {"status": "ok"}
"""

from typing import Callable, Optional
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from .context import PluginContext
from .manager import PluginManager


# Global plugin manager registry (set during app startup)
# Supports multiple managers: "feature" for feature plugins, "route" for route plugins
_plugin_managers: dict[str, PluginManager] = {}


def set_plugin_manager(manager: PluginManager, namespace: str = "feature") -> None:
    """
    Register a plugin manager for a namespace.

    Args:
        manager: PluginManager instance
        namespace: Manager namespace ("feature" or "route")

    Called during app startup (main.py).
    """
    global _plugin_managers
    _plugin_managers[namespace] = manager


def get_plugin_context(plugin_id: str) -> Callable:
    """
    Create a FastAPI dependency for plugin context injection.

    Args:
        plugin_id: Plugin ID (must match manifest.id)

    Returns:
        FastAPI dependency function that returns PluginContext

    Example:
        @router.get("/endpoint")
        async def my_endpoint(
            ctx: PluginContext = Depends(get_plugin_context("my_plugin"))
        ):
            # Use ctx.world, ctx.session, ctx.log, etc.
            pass
    """

    async def _dependency(
        db: Optional[AsyncSession] = Depends(_get_database_optional),
        redis: Optional[Redis] = Depends(_get_redis_optional),
    ) -> PluginContext:
        """
        Dependency that creates PluginContext for the specified plugin.
        """
        # Search all registered managers for the plugin
        if not _plugin_managers:
            raise RuntimeError("No plugin managers initialized")

        plugin_info = None
        for manager in _plugin_managers.values():
            plugin_info = manager.get_plugin(plugin_id)
            if plugin_info:
                break

        if not plugin_info:
            namespaces = list(_plugin_managers.keys())
            raise RuntimeError(
                f"Plugin '{plugin_id}' not found in any manager. "
                f"Registered namespaces: {namespaces}"
            )

        manifest = plugin_info["manifest"]

        # Create and return context
        return PluginContext(
            plugin_id=manifest.id,
            permissions=manifest.permissions,
            db=db if manifest.requires_db else None,
            redis=redis if manifest.requires_redis else None,
        )

    return _dependency


# ===== HELPER DEPENDENCIES =====

async def _get_database_optional():
    """
    Get database session (optional - returns None if not available).

    This is a wrapper around standard DB dependencies that returns None on error.
    """
    try:
        from pixsim7.backend.main.api.dependencies import get_async_db
        # Use the standard async DB dependency (it's already a generator)
        async for db in get_async_db():
            yield db
            return  # Only yield once
    except Exception:
        yield None


async def _get_redis_optional():
    """
    Get Redis client (optional - returns None if not available).
    """
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis
        redis = await get_redis()
        yield redis
    except Exception:
        yield None
