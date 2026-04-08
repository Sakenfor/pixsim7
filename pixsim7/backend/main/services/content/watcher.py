"""
Registry-driven content watcher.

Replaces the hardcoded content_pack_watcher with a generic watcher that
discovers watchable directories from the ContentLoaderRegistry.

Each registered loader with ``watch_dirs`` gets its own watcher coroutine.
The vocab watcher is kept as-is (it's not a content loader — it reloads
an in-memory registry, not DB entities).
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import List, Optional

from watchfiles import awatch

from pixsim7.backend.main.shared.path_registry import get_path_registry

logger = logging.getLogger(__name__)

_watcher_tasks: List[asyncio.Task] = []
_vocab_watcher_task: Optional[asyncio.Task] = None


async def _watch_loader(
    loader_id: str,
    label: str,
    watch_dir: Path,
    reload_fn,
    file_extensions: tuple[str, ...] = (".yaml", ".yml"),
    debounce_ms: int = 1500,
) -> None:
    """Generic watcher for a single content loader's directory."""
    if not watch_dir.exists():
        logger.info(
            "content_watcher_no_dir",
            loader=loader_id,
            path=str(watch_dir),
        )
        return

    logger.info(
        "content_watcher_started",
        loader=loader_id,
        label=label,
        path=str(watch_dir),
    )

    try:
        async for changes in awatch(
            watch_dir,
            watch_filter=lambda change, path: path.endswith(file_extensions),
            debounce=debounce_ms,
            step=500,
        ):
            # Determine which sub-directories (packs) were affected
            affected_names: set[str] = set()
            for _change_type, path_str in changes:
                path = Path(path_str)
                for parent in path.parents:
                    if parent.parent == watch_dir:
                        affected_names.add(parent.name)
                        break

            if not affected_names:
                continue

            logger.info(
                "content_change_detected",
                loader=loader_id,
                names=sorted(affected_names),
            )

            try:
                result = await reload_fn(affected_names)
                count = result.get("count", 0) if isinstance(result, dict) else 0
                if count:
                    logger.info(
                        "content_hot_reloaded",
                        loader=loader_id,
                        label=label,
                        count=count,
                    )
            except Exception as e:
                logger.warning(
                    "content_hot_reload_failed",
                    loader=loader_id,
                    error=str(e),
                )

    except asyncio.CancelledError:
        logger.info("content_watcher_stopped", loader=loader_id)
        raise


async def _watch_vocab_dirs() -> None:
    """Watch plugins/*/vocabularies/ for YAML changes and reload the vocab registry."""
    plugins_dir = get_path_registry().feature_plugins_dir
    if not plugins_dir.exists():
        logger.info("vocab_watcher_no_dir", detail="plugins/ does not exist")
        return

    logger.info("vocab_watcher_started", path=str(plugins_dir))

    try:
        async for changes in awatch(
            plugins_dir,
            watch_filter=lambda change, path: path.endswith((".yaml", ".yml")),
            debounce=1500,
            step=500,
        ):
            vocab_changed = any(
                "vocabularies" in Path(p).parts for _, p in changes
            )
            if not vocab_changed:
                continue

            changed_files = [
                Path(p).name for _, p in changes if "vocabularies" in Path(p).parts
            ]
            logger.info("vocab_change_detected", files=changed_files)

            try:
                from pixsim7.backend.main.shared.ontology.vocabularies.registry import (
                    get_registry,
                )

                get_registry(reload=True)
                logger.info("vocab_registry_hot_reloaded")
            except Exception as e:
                logger.warning("vocab_registry_hot_reload_failed", error=str(e))

    except asyncio.CancelledError:
        logger.info("vocab_watcher_stopped")
        raise


def start_content_watchers() -> List[asyncio.Task]:
    """
    Start background file watchers for all watchable content loaders + vocabs.

    Discovers loaders from the ContentLoaderRegistry.  Call from lifespan startup
    (after ``seed_all`` so the registry is populated).
    """
    global _watcher_tasks, _vocab_watcher_task

    from pixsim7.backend.main.services.content import content_loader_registry

    for spec in content_loader_registry.get_watchable():
        if spec.reload:
            reload_fn = spec.reload
        else:
            # Wrap seed (which expects spec) to accept affected_names arg
            _spec = spec
            async def reload_fn(_names, __spec=_spec):  # noqa: E731
                return await __spec.seed(__spec)
        for watch_dir in spec.watch_dirs:
            task = asyncio.create_task(
                _watch_loader(
                    loader_id=spec.id,
                    label=spec.label,
                    watch_dir=watch_dir,
                    reload_fn=reload_fn,
                    file_extensions=spec.file_extensions,
                    debounce_ms=spec.debounce_ms,
                ),
                name=f"content_watcher:{spec.id}",
            )
            _watcher_tasks.append(task)

    # Vocab watcher is separate (not a content loader, reloads in-memory registry)
    _vocab_watcher_task = asyncio.create_task(
        _watch_vocab_dirs(), name="vocab_watcher"
    )

    logger.info(
        "content_watchers_started",
        content_watchers=len(_watcher_tasks),
        vocab_watcher=True,
    )
    return _watcher_tasks


async def stop_content_watchers() -> None:
    """Stop all background file watchers. Call from lifespan shutdown."""
    global _watcher_tasks, _vocab_watcher_task

    all_tasks = list(_watcher_tasks)
    if _vocab_watcher_task:
        all_tasks.append(_vocab_watcher_task)

    for task in all_tasks:
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    _watcher_tasks.clear()
    _vocab_watcher_task = None
