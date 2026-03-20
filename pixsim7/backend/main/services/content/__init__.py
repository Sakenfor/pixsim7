"""
Content Loader Registry

Lightweight, extensible registry for all content loading subsystems.
Each subsystem registers a ContentLoaderSpec describing how to seed,
watch, and report status.  Startup calls ``seed_all()`` once;
the file watcher uses ``get_watchable()`` to discover directories.

Usage (registering a loader)::

    from pixsim7.backend.main.services.content import content_loader_registry, ContentLoaderSpec

    content_loader_registry.register(ContentLoaderSpec(
        id="my-content",
        label="My Content",
        category="content-pack",
        seed=my_seed_function,
        watch_dirs=[Path("/some/dir")],
        reload=my_reload_function,
    ))

Usage (startup)::

    from pixsim7.backend.main.services.content import content_loader_registry
    await content_loader_registry.seed_all()
"""

from .registry import (
    ContentLoaderRegistry,
    ContentLoaderSpec,
    ContentLoaderResult,
    ContentLoaderStatus,
    content_loader_registry,
)

__all__ = [
    "ContentLoaderRegistry",
    "ContentLoaderSpec",
    "ContentLoaderResult",
    "ContentLoaderStatus",
    "content_loader_registry",
]
