"""
Built-in content loader registrations.

Wraps existing loader functions (content_pack_loader, primitive_loader, etc.)
as ``ContentLoaderSpec`` entries in the content loader registry.

Import this module to register all built-in loaders::

    import pixsim7.backend.main.services.content.builtin_loaders  # noqa: F401
"""

from __future__ import annotations

from typing import Any, Dict

from pixsim7.backend.main.services.content.registry import (
    ContentLoaderSpec,
    content_loader_registry,
)
from pixsim7.backend.main.shared.path_registry import get_path_registry


_paths = get_path_registry()


# ---------------------------------------------------------------------------
# Default seeds (presets, tags)
# ---------------------------------------------------------------------------

async def _seed_default_presets(_spec: ContentLoaderSpec) -> Dict[str, Any]:
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.seeds.default_presets import seed_default_presets

    async with get_async_session() as db:
        await seed_default_presets(db)
    return {"count": 1}


async def _seed_default_tags(_spec: ContentLoaderSpec) -> Dict[str, Any]:
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.seeds.default_tags import seed_default_tags

    async with get_async_session() as db:
        count = await seed_default_tags(db)
    return {"count": count or 0}


# ---------------------------------------------------------------------------
# Built-in plugins
# ---------------------------------------------------------------------------

async def _seed_builtin_plugins(_spec: ContentLoaderSpec) -> Dict[str, Any]:
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.plugin.plugin_service import PluginCatalogService

    async with get_async_session() as db:
        service = PluginCatalogService(db)
        count = await service.seed_builtin_plugins()
    return {"count": count or 0}


# ---------------------------------------------------------------------------
# Prompt content packs
# ---------------------------------------------------------------------------

async def _seed_content_packs(_spec: ContentLoaderSpec) -> Dict[str, Any]:
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
        seed_content_packs,
    )

    async with get_async_session() as db:
        count = await seed_content_packs(db)
    return {"count": count or 0}


async def _reload_content_packs(affected_names: set) -> Dict[str, Any]:
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.prompt.block.content_pack_loader import load_pack

    total_created = 0
    total_updated = 0
    async with get_async_session() as db:
        for pack_name in sorted(affected_names):
            stats = await load_pack(db, pack_name, force=True, prune_missing=True)
            total_created += (
                stats["blocks_created"]
                + stats["templates_created"]
                + stats.get("characters_created", 0)
            )
            total_updated += (
                stats["blocks_updated"]
                + stats["templates_updated"]
                + stats.get("characters_updated", 0)
            )
    return {"count": total_created + total_updated, "created": total_created, "updated": total_updated}


# ---------------------------------------------------------------------------
# Block primitives
# ---------------------------------------------------------------------------

async def _seed_primitives(_spec: ContentLoaderSpec) -> Dict[str, Any]:
    from pixsim7.backend.main.services.prompt.block.primitive_loader import (
        load_all_primitives,
    )

    results = await load_all_primitives(_paths.content_packs_root)
    total = sum(
        r.get("count", 0)
        for r in results.values()
        if isinstance(r, dict) and "count" in r
    )
    return {"count": total, "packs": len(results), "detail": results}


async def _reload_primitives(affected_names: set) -> Dict[str, Any]:
    from pixsim7.backend.main.services.prompt.block.primitive_loader import (
        load_primitives_pack,
    )

    primitives_dir = _paths.content_packs_root / "primitives"
    total = 0
    for name in sorted(affected_names):
        pack_dir = primitives_dir / name
        if pack_dir.is_dir():
            result = await load_primitives_pack(pack_dir)
            total += result.get("count", 0)
    return {"count": total}


# ---------------------------------------------------------------------------
# System config (persisted namespace settings from DB)
# ---------------------------------------------------------------------------

async def _seed_system_config(_spec: ContentLoaderSpec) -> Dict[str, Any]:
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.system_config import apply_all_from_db

    # Ensure all applier registrations have run (import triggers registration)
    import pixsim7.backend.main.services.system_config.appliers  # noqa: F401

    async with get_async_session() as db:
        # Migrate file-based settings to DB on first run
        from pixsim7.backend.main.services.system_config.migration import migrate_file_settings_to_db
        await migrate_file_settings_to_db(db)

        applied = await apply_all_from_db(db)

    return {"count": len(applied) if applied else 0, "namespaces": applied or []}


# ---------------------------------------------------------------------------
# Analyzer definitions (custom analyzers from DB)
# ---------------------------------------------------------------------------

async def _seed_analyzer_definitions(_spec: ContentLoaderSpec) -> Dict[str, Any]:
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.analysis import load_analyzer_definitions

    async with get_async_session() as db:
        count = await load_analyzer_definitions(db)
    return {"count": count}


# ---------------------------------------------------------------------------
# Authoring modes (synced from DB, seeds builtins on first run)
# ---------------------------------------------------------------------------

async def _seed_authoring_modes(_spec: ContentLoaderSpec) -> Dict[str, Any]:
    from pixsim7.backend.main.infrastructure.database.session import get_async_session
    from pixsim7.backend.main.services.prompt.authoring_mode_registry import authoring_mode_registry

    async with get_async_session() as db:
        await authoring_mode_registry.sync_from_db(db)
    return {"count": len(authoring_mode_registry.list_all())}


# ---------------------------------------------------------------------------
# Register all built-in loaders
# ---------------------------------------------------------------------------

def register_builtin_loaders() -> None:
    """Register all built-in content loaders with the registry."""

    content_loader_registry.register(ContentLoaderSpec(
        id="default-presets",
        label="Default Presets",
        category="seed",
        seed=_seed_default_presets,
    ))

    content_loader_registry.register(ContentLoaderSpec(
        id="default-tags",
        label="Default Tags",
        category="seed",
        seed=_seed_default_tags,
    ))

    content_loader_registry.register(ContentLoaderSpec(
        id="builtin-plugins",
        label="Built-in Plugins",
        category="plugin",
        seed=_seed_builtin_plugins,
    ))

    content_loader_registry.register(ContentLoaderSpec(
        id="prompt-content-packs",
        label="Prompt Content Packs",
        category="content-pack",
        seed=_seed_content_packs,
        watch_dirs=[_paths.prompt_content_packs_dir],
        reload=_reload_content_packs,
        file_extensions=(".yaml", ".yml"),
    ))

    content_loader_registry.register(ContentLoaderSpec(
        id="block-primitives",
        label="Block Primitives",
        category="primitives",
        seed=_seed_primitives,
        watch_dirs=[_paths.content_packs_root / "primitives"],
        reload=_reload_primitives,
        file_extensions=(".yaml", ".yml"),
    ))

    content_loader_registry.register(ContentLoaderSpec(
        id="system-config",
        label="System Config",
        category="other",
        seed=_seed_system_config,
    ))

    content_loader_registry.register(ContentLoaderSpec(
        id="analyzer-definitions",
        label="Analyzer Definitions",
        category="other",
        seed=_seed_analyzer_definitions,
    ))

    content_loader_registry.register(ContentLoaderSpec(
        id="authoring-modes",
        label="Authoring Modes",
        category="other",
        seed=_seed_authoring_modes,
    ))


# Auto-register on import
register_builtin_loaders()
