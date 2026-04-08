"""
Content Loader Registry — extensible registry of content loading subsystems.

Each loader registers a ``ContentLoaderSpec`` that the registry uses to:
  1. Seed content at startup (``seed_all``)
  2. Discover watchable directories for hot-reload (``get_watchable``)
  3. Report per-loader status for the Content Map panel (``get_status``)

Design principles:
  - Existing loaders (content_pack_loader, primitive_loader, etc.) are unchanged.
    They are wrapped by thin ``seed`` / ``reload`` callables at registration time.
  - Registration order determines seed order.
  - All seeds are non-fatal by default (fail → warning, continue).
  - The registry is a singleton but import-safe (no DB/IO at import time).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Literal, Optional, Sequence

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

ContentCategory = Literal[
    "content-pack",   # Prompt content packs (blocks, templates, characters)
    "primitives",     # Block primitives packs
    "vocabulary",     # Plugin vocabularies
    "plugin",         # Backend plugins
    "seed",           # Default data seeds (presets, tags)
    "other",
]


@dataclass
class ContentLoaderResult:
    """Outcome of a single seed or reload operation."""

    loader_id: str
    ok: bool
    count: int = 0                       # Number of entities created/updated
    detail: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    duration_ms: Optional[float] = None


@dataclass
class ContentLoaderStatus:
    """Current health snapshot of a loader (for Content Map panel)."""

    loader_id: str
    label: str
    category: ContentCategory
    healthy: bool
    last_seed: Optional[datetime] = None
    last_result: Optional[ContentLoaderResult] = None
    watch_dirs: Sequence[Path] = ()


@dataclass
class ContentLoaderSpec:
    """
    Registration descriptor for a content loader subsystem.

    Parameters
    ----------
    id : str
        Unique identifier (e.g. ``"prompt-content-packs"``).
    label : str
        Human-readable name shown in panels / logs.
    category : ContentCategory
        Grouping for UI and ordering.
    seed : callable
        Async function called at startup.  Should return a dict with at
        least ``{"count": int}`` or raise on hard failure.
    watch_dirs : list[Path], optional
        Directories the file watcher should monitor for this loader.
        If empty, this loader is not hot-reloadable.
    reload : callable, optional
        Async function called by the watcher when files change.
        Receives ``affected_names: set[str]`` (pack/directory names that changed).
        Falls back to ``seed`` if not provided.
    status : callable, optional
        Async function returning a summary dict for the Content Map panel.
    required : bool
        If True, a seed failure aborts startup.  Default False (non-fatal).
    file_extensions : tuple[str, ...]
        File extensions the watcher filters on (default YAML).
    debounce_ms : int
        Watcher debounce in milliseconds (default 1500).
    """

    id: str
    label: str
    category: ContentCategory
    seed: Callable[..., Awaitable[Dict[str, Any]]]
    watch_dirs: List[Path] = field(default_factory=list)
    reload: Optional[Callable[[set], Awaitable[Dict[str, Any]]]] = None
    status: Optional[Callable[[], Awaitable[Dict[str, Any]]]] = None
    required: bool = False
    file_extensions: tuple[str, ...] = (".yaml", ".yml")
    debounce_ms: int = 1500


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

class ContentLoaderRegistry:
    """Singleton registry of content loader specs."""

    def __init__(self) -> None:
        self._specs: Dict[str, ContentLoaderSpec] = {}
        self._results: Dict[str, ContentLoaderResult] = {}
        self._seed_times: Dict[str, datetime] = {}

    # -- registration -------------------------------------------------------

    def register(self, spec: ContentLoaderSpec) -> None:
        """Register (or replace) a content loader spec."""
        if spec.id in self._specs:
            logger.debug("content_loader_replaced", loader=spec.id)
        self._specs[spec.id] = spec

    def unregister(self, loader_id: str) -> None:
        """Remove a loader spec (useful for tests)."""
        self._specs.pop(loader_id, None)
        self._results.pop(loader_id, None)

    def get(self, loader_id: str) -> Optional[ContentLoaderSpec]:
        return self._specs.get(loader_id)

    def list_specs(self) -> List[ContentLoaderSpec]:
        """All specs in registration order."""
        return list(self._specs.values())

    # -- seeding ------------------------------------------------------------

    async def seed_all(self) -> List[ContentLoaderResult]:
        """
        Run all registered seed functions in registration order.

        Non-required loaders log warnings on failure; required loaders
        re-raise the exception to abort startup.
        """
        import time

        results: List[ContentLoaderResult] = []
        for spec in self._specs.values():
            t0 = time.monotonic()
            try:
                raw = await spec.seed(spec)
                count = raw.get("count", 0) if isinstance(raw, dict) else 0
                detail = raw if isinstance(raw, dict) else {}
                result = ContentLoaderResult(
                    loader_id=spec.id,
                    ok=True,
                    count=count,
                    detail=detail,
                    duration_ms=(time.monotonic() - t0) * 1000,
                )
                if count:
                    logger.info(
                        "content_seeded",
                        loader=spec.id,
                        label=spec.label,
                        count=count,
                    )
            except Exception as exc:
                result = ContentLoaderResult(
                    loader_id=spec.id,
                    ok=False,
                    error=str(exc),
                    duration_ms=(time.monotonic() - t0) * 1000,
                )
                if spec.required:
                    logger.error(
                        "content_seed_required_failed",
                        loader=spec.id,
                        error=str(exc),
                    )
                    raise
                else:
                    logger.warning(
                        "content_seed_failed",
                        loader=spec.id,
                        label=spec.label,
                        error=str(exc),
                        error_type=exc.__class__.__name__,
                        detail=f"Continuing startup without {spec.label}",
                    )

            self._results[spec.id] = result
            self._seed_times[spec.id] = datetime.now(timezone.utc)
            results.append(result)

        return results

    # -- watching -----------------------------------------------------------

    def get_watchable(self) -> List[ContentLoaderSpec]:
        """Return specs that have watch_dirs defined."""
        return [s for s in self._specs.values() if s.watch_dirs]

    # -- status / introspection ---------------------------------------------

    def get_status(self, loader_id: str) -> Optional[ContentLoaderStatus]:
        """Build a status snapshot for a specific loader."""
        spec = self._specs.get(loader_id)
        if not spec:
            return None
        result = self._results.get(loader_id)
        return ContentLoaderStatus(
            loader_id=spec.id,
            label=spec.label,
            category=spec.category,
            healthy=result.ok if result else False,
            last_seed=self._seed_times.get(loader_id),
            last_result=result,
            watch_dirs=spec.watch_dirs,
        )

    def get_all_status(self) -> List[ContentLoaderStatus]:
        """Status snapshots for all registered loaders."""
        return [
            self.get_status(spec.id)
            for spec in self._specs.values()
            if self.get_status(spec.id) is not None
        ]

    def summary(self) -> Dict[str, Any]:
        """Quick summary dict for logging / API responses."""
        statuses = self.get_all_status()
        return {
            "total_loaders": len(statuses),
            "healthy": sum(1 for s in statuses if s.healthy),
            "failed": sum(1 for s in statuses if not s.healthy),
            "loaders": {
                s.loader_id: {
                    "label": s.label,
                    "category": s.category,
                    "healthy": s.healthy,
                    "count": s.last_result.count if s.last_result else 0,
                }
                for s in statuses
            },
        }


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

content_loader_registry = ContentLoaderRegistry()
