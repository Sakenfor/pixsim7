"""
File watcher for content packs and vocabularies — auto-reloads blocks,
templates, and characters when YAML files change under content_packs/prompt/,
and reloads the vocabulary registry when plugin vocab YAMLs change.

Uses `watchfiles` (rust-based, already installed for uvicorn --reload).
Runs as asyncio background tasks started from the app lifespan.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional

from watchfiles import awatch, Change

from pixsim7.backend.main.shared.path_registry import get_path_registry

from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
    CONTENT_PACKS_DIR,
    discover_content_packs,
    load_pack,
)

logger = logging.getLogger(__name__)

_watcher_task: Optional[asyncio.Task] = None
_vocab_watcher_task: Optional[asyncio.Task] = None

# Watch backend feature plugin vocabularies from canonical path registry.
_PLUGINS_DIR = get_path_registry().feature_plugins_dir


async def _watch_content_dirs() -> None:
    """Watch content_packs/prompt/ for YAML changes and reload."""
    if not CONTENT_PACKS_DIR.exists():
        logger.info("content_pack_watcher_no_dir", msg="content_packs/prompt/ does not exist")
        return

    logger.info(
        "content_pack_watcher_started",
        path=str(CONTENT_PACKS_DIR),
    )

    try:
        async for changes in awatch(
            CONTENT_PACKS_DIR,
            watch_filter=lambda change, path: path.endswith((".yaml", ".yml")),
            debounce=1500,
            step=500,
        ):
            # Determine which packs were affected
            # Layout: content_packs/prompt/<pack_name>/(blocks|templates|characters).yaml
            # or content_packs/prompt/<pack_name>/(blocks|templates|characters)/*.yaml
            affected_packs: set[str] = set()
            for change_type, path_str in changes:
                path = Path(path_str)
                # The pack name is the direct child of CONTENT_PACKS_DIR
                for parent in path.parents:
                    if parent.parent == CONTENT_PACKS_DIR:
                        affected_packs.add(parent.name)
                        break

            if not affected_packs:
                continue

            logger.info(
                "content_pack_change_detected",
                packs=sorted(affected_packs),
            )

            from pixsim7.backend.main.infrastructure.database.session import (
                get_async_session,
            )

            async with get_async_session() as db:
                for pack_name in sorted(affected_packs):
                    try:
                        stats = await load_pack(
                            db,
                            pack_name,
                            force=True,
                            prune_missing=True,
                        )
                        created = (
                            stats["blocks_created"]
                            + stats["templates_created"]
                            + stats.get("characters_created", 0)
                        )
                        updated = (
                            stats["blocks_updated"]
                            + stats["templates_updated"]
                            + stats.get("characters_updated", 0)
                        )
                        if created or updated:
                            logger.info(
                                "content_pack_hot_reloaded",
                                pack=pack_name,
                                blocks_created=stats["blocks_created"],
                                blocks_updated=stats["blocks_updated"],
                                templates_created=stats["templates_created"],
                                templates_updated=stats["templates_updated"],
                                characters_created=stats.get("characters_created", 0),
                                characters_updated=stats.get("characters_updated", 0),
                            )
                    except Exception as e:
                        logger.warning(
                            "content_pack_hot_reload_failed",
                            pack=pack_name,
                            error=str(e),
                        )

    except asyncio.CancelledError:
        logger.info("content_pack_watcher_stopped")
        raise


async def _watch_vocab_dirs() -> None:
    """Watch plugins/*/vocabularies/ for YAML changes and reload the vocab registry."""
    if not _PLUGINS_DIR.exists():
        logger.info("vocab_watcher_no_dir", msg="plugins/ does not exist")
        return

    logger.info("vocab_watcher_started", path=str(_PLUGINS_DIR))

    try:
        async for changes in awatch(
            _PLUGINS_DIR,
            watch_filter=lambda change, path: path.endswith((".yaml", ".yml")),
            debounce=1500,
            step=500,
        ):
            vocab_changed = any(
                "vocabularies" in Path(p).parts for _, p in changes
            )
            if not vocab_changed:
                continue

            changed_files = [Path(p).name for _, p in changes if "vocabularies" in Path(p).parts]
            logger.info("vocab_change_detected", files=changed_files)

            try:
                from pixsim7.backend.main.shared.ontology.vocabularies.registry import get_registry
                get_registry(reload=True)
                logger.info("vocab_registry_hot_reloaded")
            except Exception as e:
                logger.warning("vocab_registry_hot_reload_failed", error=str(e))

    except asyncio.CancelledError:
        logger.info("vocab_watcher_stopped")
        raise


def start_content_pack_watcher() -> asyncio.Task:
    """Start the background file watchers. Call from lifespan startup."""
    global _watcher_task, _vocab_watcher_task
    _watcher_task = asyncio.create_task(_watch_content_dirs(), name="content_pack_watcher")
    _vocab_watcher_task = asyncio.create_task(_watch_vocab_dirs(), name="vocab_watcher")
    return _watcher_task


async def stop_content_pack_watcher() -> None:
    """Stop the background file watchers. Call from lifespan shutdown."""
    global _watcher_task, _vocab_watcher_task
    for task in (_watcher_task, _vocab_watcher_task):
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    _watcher_task = None
    _vocab_watcher_task = None
