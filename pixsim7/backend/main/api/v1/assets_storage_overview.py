"""
Storage Overview API

System-wide storage dashboard: filesystem directory sizes, media type breakdown,
PostgreSQL table sizes, unused indexes, and actionable cleanup opportunities.
"""
from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
from pixsim7.backend.main.services.storage import get_storage_service
from pixsim7.backend.main.services.storage.roots import LOCAL_ROOT_ID, get_root_specs
from pixsim7.backend.main.shared.path_registry import get_path_registry
from pixsim_logging import get_logger

router = APIRouter(tags=["assets-maintenance"])
logger = get_logger()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class DirectorySize(BaseModel):
    path: str
    label: str
    size_bytes: int
    size_human: str
    file_count: Optional[int] = None
    note: Optional[str] = None


class SubdirectorySize(BaseModel):
    name: str
    size_bytes: int
    size_human: str
    file_count: int


class MediaTypeBreakdown(BaseModel):
    mime_type: str
    media_type: str
    count: int
    size_bytes: int
    size_human: str
    pct_of_total: float


class TableSize(BaseModel):
    table_name: str
    row_count: int
    total_bytes: int
    total_human: str
    data_bytes: int
    toast_bytes: int
    index_bytes: int


class UnusedIndex(BaseModel):
    index_name: str
    table_name: str
    size_bytes: int
    size_human: str
    index_scans: int


class CleanupOpportunity(BaseModel):
    id: str
    label: str
    description: str
    estimated_savings_bytes: int
    estimated_savings_human: str
    severity: str  # "info" | "warning" | "critical"
    action_endpoint: Optional[str] = None


class StorageRootInfo(BaseModel):
    """Per-root placement summary for the tiered storage system.

    Sizes are the *logical* bytes of assets whose ``storage_root_id`` resolves
    to this root (summed ``file_size_bytes`` from the DB), not a live object-store
    scan — cheap and accurate enough for the dashboard. ``online`` is an optional
    reachability probe (None = not probed / unknown). See plan media-storage-tiering.
    """
    id: str
    kind: str  # 'local' | 's3'
    label: str
    detail: Optional[str] = None  # e.g. 'endpoint/bucket' or local path
    asset_count: int
    size_bytes: int
    size_human: str
    is_archive_target: bool  # where the placement policy WANTS video originals
    online: Optional[bool] = None
    error: Optional[str] = None


class StorageOverviewResponse(BaseModel):
    total_size_bytes: int
    total_size_human: str
    scan_duration_ms: int

    directories: list[DirectorySize]
    media_subdirectories: list[SubdirectorySize]
    media_types: list[MediaTypeBreakdown]
    db_tables: list[TableSize]
    unused_indexes: list[UnusedIndex]
    cleanup_opportunities: list[CleanupOpportunity]

    db_total_bytes: int
    db_total_human: str

    storage_roots: list[StorageRootInfo]
    tiering_enabled: bool


class StorageFilesystemResponse(BaseModel):
    """Filesystem-only slice of the overview (the expensive recursive walk).

    Split out from ``StorageOverviewResponse`` so the UI can render the instant
    DB sections first and stream these in once the walk completes.
    """
    total_size_bytes: int
    total_size_human: str
    scan_duration_ms: int

    directories: list[DirectorySize]
    media_subdirectories: list[SubdirectorySize]
    cleanup_opportunities: list[CleanupOpportunity]


class CleanupOrphanedResponse(BaseModel):
    deleted_count: int
    freed_bytes: int
    freed_human: str
    errors: int
    dry_run: bool


class RotateLogsResponse(BaseModel):
    rotated_count: int
    freed_bytes: int
    freed_human: str
    details: list[dict]
    dry_run: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _human_size(size_bytes: int | float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(size_bytes) < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


# Estimated PNG→WebP savings ratio
_PNG_WEBP_SAVINGS_PCT = 65.0


# ---------------------------------------------------------------------------
# Filesystem scanning (runs in thread)
# ---------------------------------------------------------------------------

def _dir_size_sync(path: Path) -> tuple[int, int]:
    """Recursively sum file sizes and count files using os.scandir."""
    total_bytes = 0
    file_count = 0
    try:
        with os.scandir(path) as entries:
            for entry in entries:
                try:
                    if entry.is_file(follow_symlinks=False):
                        total_bytes += entry.stat(follow_symlinks=False).st_size
                        file_count += 1
                    elif entry.is_dir(follow_symlinks=False):
                        sub_bytes, sub_count = _dir_size_sync(Path(entry.path))
                        total_bytes += sub_bytes
                        file_count += sub_count
                except OSError:
                    pass
    except OSError:
        pass
    return total_bytes, file_count


def _scan_pixsim_home(pixsim_home: Path) -> tuple[list[DirectorySize], list[SubdirectorySize]]:
    """Scan top-level data directories and media subdirectories."""
    directories: list[DirectorySize] = []
    media_subdirs: list[SubdirectorySize] = []

    # Top-level labels for known directories
    labels = {
        "media": "Media Files",
        "postgres": "PostgreSQL",
        "timescaledb": "TimescaleDB (Logs)",
        "logs": "Console Logs",
        "redis": "Redis",
        "orphaned": "Orphaned Files",
        "storage": "Legacy Storage",
        "cache": "Cache",
        "exports": "Exports",
        "temp": "Temp",
        "models": "Models",
        "settings": "Settings",
        "automation": "Automation",
        "launcher": "Launcher",
    }

    docker_dirs = {"postgres", "timescaledb", "redis"}

    if not pixsim_home.is_dir():
        return directories, media_subdirs

    try:
        with os.scandir(pixsim_home) as entries:
            for entry in entries:
                if not entry.is_dir(follow_symlinks=False):
                    continue
                name = entry.name
                path = Path(entry.path)
                size_bytes, file_count = _dir_size_sync(path)
                if size_bytes == 0 and file_count == 0:
                    continue
                directories.append(DirectorySize(
                    path=name,
                    label=labels.get(name, name.title()),
                    size_bytes=size_bytes,
                    size_human=_human_size(size_bytes),
                    file_count=file_count if name not in docker_dirs else None,
                    note="Docker bind mount" if name in docker_dirs else None,
                ))
    except OSError:
        pass

    directories.sort(key=lambda d: d.size_bytes, reverse=True)

    # Media subdirectories (e.g. content/, thumbnails/, assets/, previews/)
    media_root = pixsim_home / "media"
    if media_root.is_dir():
        # Walk one level into user dirs to find subdirectories
        try:
            for user_dir in media_root.iterdir():
                if not user_dir.is_dir():
                    continue
                for sub_dir in user_dir.iterdir():
                    if not sub_dir.is_dir():
                        continue
                    size_bytes, file_count = _dir_size_sync(sub_dir)
                    if size_bytes == 0 and file_count == 0:
                        continue
                    media_subdirs.append(SubdirectorySize(
                        name=sub_dir.name,
                        size_bytes=size_bytes,
                        size_human=_human_size(size_bytes),
                        file_count=file_count,
                    ))
        except OSError:
            pass

    # Merge subdirs with same name across users
    merged: dict[str, SubdirectorySize] = {}
    for sd in media_subdirs:
        if sd.name in merged:
            existing = merged[sd.name]
            merged[sd.name] = SubdirectorySize(
                name=sd.name,
                size_bytes=existing.size_bytes + sd.size_bytes,
                size_human=_human_size(existing.size_bytes + sd.size_bytes),
                file_count=existing.file_count + sd.file_count,
            )
        else:
            merged[sd.name] = sd

    media_subdirs = sorted(merged.values(), key=lambda s: s.size_bytes, reverse=True)

    return directories, media_subdirs


# ---------------------------------------------------------------------------
# Database queries
# ---------------------------------------------------------------------------

async def _query_media_types(db: AsyncSession, user_id: int) -> list[MediaTypeBreakdown]:
    result = await db.execute(text("""
        SELECT
            COALESCE(mime_type, 'unknown') as mime_type,
            COALESCE(media_type::text, 'unknown') as media_type,
            COUNT(*) as cnt,
            COALESCE(SUM(file_size_bytes), 0) as total_bytes
        FROM assets
        WHERE user_id = :uid AND stored_key IS NOT NULL
        GROUP BY mime_type, media_type
        ORDER BY total_bytes DESC
    """), {"uid": user_id})
    rows = result.fetchall()

    grand_total = sum(r.total_bytes for r in rows) or 1
    return [
        MediaTypeBreakdown(
            mime_type=r.mime_type,
            media_type=r.media_type,
            count=r.cnt,
            size_bytes=r.total_bytes,
            size_human=_human_size(r.total_bytes),
            pct_of_total=round(r.total_bytes / grand_total * 100, 1),
        )
        for r in rows
    ]


async def _query_table_sizes(db: AsyncSession) -> list[TableSize]:
    result = await db.execute(text("""
        SELECT
            c.relname AS table_name,
            COALESCE(s.n_live_tup, 0) AS row_count,
            pg_total_relation_size(c.oid) AS total_bytes,
            pg_relation_size(c.oid) AS data_bytes,
            COALESCE(pg_relation_size(c.reltoastrelid), 0) AS toast_bytes,
            pg_indexes_size(c.oid) AS index_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 10
    """))
    rows = result.fetchall()
    return [
        TableSize(
            table_name=r.table_name,
            row_count=r.row_count,
            total_bytes=r.total_bytes,
            total_human=_human_size(r.total_bytes),
            data_bytes=r.data_bytes,
            toast_bytes=r.toast_bytes,
            index_bytes=r.index_bytes,
        )
        for r in rows
    ]


async def _query_unused_indexes(db: AsyncSession) -> list[UnusedIndex]:
    result = await db.execute(text("""
        SELECT
            s.indexrelname AS index_name,
            s.relname AS table_name,
            pg_relation_size(s.indexrelid) AS size_bytes,
            s.idx_scan AS index_scans
        FROM pg_stat_user_indexes s
        WHERE s.idx_scan = 0
          AND pg_relation_size(s.indexrelid) > 1048576
        ORDER BY pg_relation_size(s.indexrelid) DESC
        LIMIT 20
    """))
    rows = result.fetchall()
    return [
        UnusedIndex(
            index_name=r.index_name,
            table_name=r.table_name,
            size_bytes=r.size_bytes,
            size_human=_human_size(r.size_bytes),
            index_scans=r.index_scans,
        )
        for r in rows
    ]


async def _query_db_total_size(db: AsyncSession) -> int:
    result = await db.execute(text(
        "SELECT pg_database_size(current_database())"
    ))
    return result.scalar() or 0


async def _query_root_aggregates(db: AsyncSession, user_id: int) -> dict[str, tuple[int, int]]:
    """Per-root (count, total_bytes) for the user's assets, keyed by root id.

    ``storage_root_id`` NULL collapses to the implicit ``'local'`` root.
    """
    result = await db.execute(text("""
        SELECT
            COALESCE(storage_root_id, :local) AS root_id,
            COUNT(*) AS cnt,
            COALESCE(SUM(file_size_bytes), 0) AS total_bytes
        FROM assets
        WHERE user_id = :uid AND stored_key IS NOT NULL
        GROUP BY COALESCE(storage_root_id, :local)
    """), {"uid": user_id, "local": LOCAL_ROOT_ID})
    return {r.root_id: (r.cnt, r.total_bytes) for r in result.fetchall()}


def _root_detail(spec) -> Optional[str]:
    """Short human descriptor for a root (endpoint/bucket for s3, path for local)."""
    cfg = spec.config or {}
    if spec.kind == "s3":
        endpoint = str(cfg.get("endpoint_url", "")).rstrip("/")
        bucket = cfg.get("bucket", "")
        # Strip scheme for compactness: http://10.243.1.2:9000 -> 10.243.1.2:9000
        host = endpoint.split("://", 1)[-1]
        return f"{host}/{bucket}" if bucket else host or None
    if spec.kind == "local":
        path = cfg.get("path")
        return str(path) if path else "media_root"
    return None


async def _build_storage_roots(
    db: AsyncSession, user_id: int, probe_health: bool
) -> list[StorageRootInfo]:
    """Merge the configured roots registry with per-root DB aggregates.

    Surfaces every configured root (even empty ones) plus any root id that
    appears in asset rows but is no longer configured (so orphaned placements
    are still visible). Optionally probes each non-local root's reachability.
    """
    from pixsim7.backend.main.services.storage.placement import ARCHIVE_ROOT_ID

    specs = get_root_specs()
    aggregates = await _query_root_aggregates(db, user_id)
    storage = get_storage_service()

    labels = {LOCAL_ROOT_ID: "Local (hot)", ARCHIVE_ROOT_ID: "Archive"}

    # Union of configured ids and ids actually present on asset rows.
    root_ids = list(specs.keys())
    for rid in aggregates:
        if rid not in specs:
            root_ids.append(rid)

    roots: list[StorageRootInfo] = []
    for rid in root_ids:
        spec = specs.get(rid)
        kind = spec.kind if spec else "unknown"
        count, total_bytes = aggregates.get(rid, (0, 0))

        online: Optional[bool] = None
        error: Optional[str] = None
        if probe_health and spec is not None:
            probe = await storage.probe_root(rid)
            online, error = probe["online"], probe["error"]

        detail = _root_detail(spec) if spec else "configured root missing"
        roots.append(StorageRootInfo(
            id=rid,
            kind=kind,
            label=labels.get(rid, rid.title()),
            detail=detail,
            asset_count=count,
            size_bytes=total_bytes,
            size_human=_human_size(total_bytes),
            is_archive_target=(rid == ARCHIVE_ROOT_ID and rid in specs),
            online=online,
            error=error,
        ))

    # Largest footprint first, but keep 'local' pinned at the top.
    roots.sort(key=lambda r: (r.id != LOCAL_ROOT_ID, -r.size_bytes))
    return roots


# ---------------------------------------------------------------------------
# Cleanup opportunity computation
# ---------------------------------------------------------------------------

def _compute_cleanup_opportunities(
    directories: list[DirectorySize],
    media_types: list[MediaTypeBreakdown],
    unused_indexes: list[UnusedIndex],
) -> list[CleanupOpportunity]:
    opportunities: list[CleanupOpportunity] = []

    # PNG → WebP conversion
    png_entry = next((m for m in media_types if m.mime_type == "image/png"), None)
    if png_entry and png_entry.size_bytes > 0:
        est_savings = int(png_entry.size_bytes * _PNG_WEBP_SAVINGS_PCT / 100)
        opportunities.append(CleanupOpportunity(
            id="png_to_webp",
            label="PNG to WebP conversion",
            description=f"{png_entry.count:,} PNG images ({png_entry.size_human}) can be converted to WebP",
            estimated_savings_bytes=est_savings,
            estimated_savings_human=_human_size(est_savings),
            severity="warning" if est_savings > 1_073_741_824 else "info",
            action_endpoint="/api/v1/assets/convert-format?target_format=webp&quality=90&limit={limit}",
        ))

    # Orphaned files
    orphaned = next((d for d in directories if d.path == "orphaned"), None)
    if orphaned and orphaned.size_bytes > 0:
        opportunities.append(CleanupOpportunity(
            id="orphaned_files",
            label="Orphaned files",
            description=f"{orphaned.file_count or 0:,} files ({orphaned.size_human}) in orphaned directory",
            estimated_savings_bytes=orphaned.size_bytes,
            estimated_savings_human=orphaned.size_human,
            severity="warning" if orphaned.size_bytes > 104_857_600 else "info",
            action_endpoint="/api/v1/assets/cleanup-orphaned",
        ))

    # Console log rotation
    logs = next((d for d in directories if d.path == "logs"), None)
    if logs and logs.size_bytes > 104_857_600:  # > 100 MB
        opportunities.append(CleanupOpportunity(
            id="log_rotation",
            label="Console log rotation",
            description=f"Console logs using {logs.size_human} ({logs.file_count or 0} files)",
            estimated_savings_bytes=int(logs.size_bytes * 0.7),  # conservative estimate
            estimated_savings_human=_human_size(int(logs.size_bytes * 0.7)),
            severity="info",
            action_endpoint="/api/v1/assets/rotate-logs",
        ))

    # Unused indexes
    if unused_indexes:
        total_unused = sum(idx.size_bytes for idx in unused_indexes)
        if total_unused > 1_048_576:  # > 1 MB
            opportunities.append(CleanupOpportunity(
                id="unused_indexes",
                label="Unused database indexes",
                description=f"{len(unused_indexes)} indexes with 0 scans ({_human_size(total_unused)})",
                estimated_savings_bytes=total_unused,
                estimated_savings_human=_human_size(total_unused),
                severity="info",
            ))

    # Sort by estimated savings descending
    opportunities.sort(key=lambda o: o.estimated_savings_bytes, reverse=True)
    return opportunities


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

# Caches ONLY the expensive recursive FS walk (directories + media subdirs); the
# DB sections are cheap enough to run per request. Both the combined overview and
# the filesystem-only endpoint read through here, and every place that mutates
# on-disk state (cleanup, log rotation, relocate/restore, root changes) clears it
# via ``_cache = None``.
_cache: Optional[tuple[float, tuple[list[DirectorySize], list[SubdirectorySize]]]] = None
# Covers the client's 5-min stale-while-revalidate window so a background
# revalidate after a panel reopen returns this cache instead of re-running the
# expensive FS walk. The Refresh button (force=true) always bypasses it.
_CACHE_TTL = 300.0


async def _fs_sections(
    force: bool,
) -> tuple[list[DirectorySize], list[SubdirectorySize], int]:
    """Recursive FS walk (directories + media subdirs), cached for ``_CACHE_TTL``.

    Returns ``(directories, media_subdirectories, total_size_bytes)``. The walk
    runs in a thread; a non-force call within the TTL reuses the cached result.
    """
    global _cache
    if not force and _cache is not None and time.monotonic() - _cache[0] < _CACHE_TTL:
        directories, media_subdirs = _cache[1]
    else:
        registry = get_path_registry()
        directories, media_subdirs = await asyncio.to_thread(
            _scan_pixsim_home, registry.pixsim_home
        )
        _cache = (time.monotonic(), (directories, media_subdirs))
    total_size = sum(d.size_bytes for d in directories)
    return directories, media_subdirs, total_size


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/storage-overview", response_model=StorageOverviewResponse)
async def get_storage_overview(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    force: bool = Query(False, description="Bypass the FS-scan cache"),
    include_fs: bool = Query(
        True,
        description=(
            "Run the recursive filesystem walk (directories, media subdirs, "
            "cleanup). Set False for a fast DB-only payload and hydrate the FS "
            "sections separately via /storage-overview/filesystem so the panel "
            "can render DB sections before the slow walk finishes."
        ),
    ),
    probe_health: bool = Query(
        True, description="Probe each non-local storage root for reachability"
    ),
):
    """
    System-wide storage overview: filesystem sizes, media breakdown,
    database table sizes, unused indexes, cleanup opportunities, and per-root
    placement summary (tiered storage).

    For progressive UI loading, call with ``include_fs=false`` (and
    ``probe_health=false``) for an instant DB-only payload, then hydrate the FS
    sections via ``/storage-overview/filesystem`` and reachability via
    ``/storage-roots`` in parallel.
    """
    t0 = time.monotonic()

    # DB sections are cheap — always run them in parallel.
    media_types, db_tables, unused_indexes, db_total = await asyncio.gather(
        _query_media_types(db, admin.id),
        _query_table_sizes(db),
        _query_unused_indexes(db),
        _query_db_total_size(db),
    )

    # Per-root placement summary (health probes touch the network).
    storage_roots = await _build_storage_roots(db, admin.id, probe_health)

    if include_fs:
        directories, media_subdirs, total_size = await _fs_sections(force)
        cleanup = _compute_cleanup_opportunities(directories, media_types, unused_indexes)
    else:
        directories, media_subdirs, total_size, cleanup = [], [], 0, []

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    return StorageOverviewResponse(
        total_size_bytes=total_size,
        total_size_human=_human_size(total_size),
        scan_duration_ms=elapsed_ms,
        directories=directories,
        media_subdirectories=media_subdirs,
        media_types=media_types,
        db_tables=db_tables,
        unused_indexes=unused_indexes,
        cleanup_opportunities=cleanup,
        db_total_bytes=db_total,
        db_total_human=_human_size(db_total),
        storage_roots=storage_roots,
        # >1 root configured == tiering is actually in play.
        tiering_enabled=len(get_root_specs()) > 1,
    )


@router.get("/storage-overview/filesystem", response_model=StorageFilesystemResponse)
async def get_storage_filesystem(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    force: bool = Query(False, description="Bypass the FS-scan cache"),
):
    """Filesystem-only slice of the overview: directory sizes, the media-subdir
    breakdown, and cleanup opportunities. Split from ``/storage-overview`` so the
    expensive recursive walk can stream in after the instant DB sections."""
    t0 = time.monotonic()
    directories, media_subdirs, total_size = await _fs_sections(force)
    # Cleanup also weighs PNG/index savings — pull those cheap DB bits too.
    media_types, unused_indexes = await asyncio.gather(
        _query_media_types(db, admin.id),
        _query_unused_indexes(db),
    )
    cleanup = _compute_cleanup_opportunities(directories, media_types, unused_indexes)

    return StorageFilesystemResponse(
        total_size_bytes=total_size,
        total_size_human=_human_size(total_size),
        scan_duration_ms=int((time.monotonic() - t0) * 1000),
        directories=directories,
        media_subdirectories=media_subdirs,
        cleanup_opportunities=cleanup,
    )


@router.post("/cleanup-orphaned", response_model=CleanupOrphanedResponse)
async def cleanup_orphaned_files(
    admin: CurrentAdminUser,
    dry_run: bool = Query(True, description="Preview without deleting"),
):
    """Delete files from the orphaned directory."""
    global _cache

    registry = get_path_registry()
    orphaned_dir = registry.pixsim_home / "orphaned"

    if not orphaned_dir.is_dir():
        return CleanupOrphanedResponse(
            deleted_count=0, freed_bytes=0, freed_human="0 B", errors=0, dry_run=dry_run,
        )

    deleted = 0
    freed = 0
    errors = 0

    def _cleanup_sync():
        nonlocal deleted, freed, errors
        try:
            for entry in os.scandir(orphaned_dir):
                try:
                    if entry.is_file(follow_symlinks=False):
                        size = entry.stat(follow_symlinks=False).st_size
                        if not dry_run:
                            os.unlink(entry.path)
                        deleted += 1
                        freed += size
                    elif entry.is_dir(follow_symlinks=False):
                        # Recursively handle subdirs
                        sub_bytes, sub_count = _dir_size_sync(Path(entry.path))
                        if not dry_run:
                            import shutil
                            shutil.rmtree(entry.path, ignore_errors=True)
                        deleted += sub_count
                        freed += sub_bytes
                except OSError as e:
                    logger.warning("orphaned_cleanup_error", path=entry.path, error=str(e))
                    errors += 1
        except OSError as e:
            logger.error("orphaned_dir_scan_error", error=str(e))
            errors += 1

    await asyncio.to_thread(_cleanup_sync)

    if not dry_run:
        _cache = None  # Invalidate overview cache

    return CleanupOrphanedResponse(
        deleted_count=deleted,
        freed_bytes=freed,
        freed_human=_human_size(freed),
        errors=errors,
        dry_run=dry_run,
    )


@router.post("/rotate-logs", response_model=RotateLogsResponse)
async def rotate_logs(
    admin: CurrentAdminUser,
    max_size_mb: int = Query(50, ge=1, le=500, description="Max size per log file in MB"),
    dry_run: bool = Query(True, description="Preview without truncating"),
):
    """Truncate console log files that exceed the size threshold."""
    global _cache

    registry = get_path_registry()
    logs_dir = registry.pixsim_home / "logs"

    rotated = 0
    freed = 0
    details: list[dict] = []

    if not logs_dir.is_dir():
        return RotateLogsResponse(
            rotated_count=0, freed_bytes=0, freed_human="0 B", details=[], dry_run=dry_run,
        )

    max_bytes = max_size_mb * 1_048_576
    # Number of bytes to keep from the tail when truncating
    keep_bytes = max_bytes

    def _rotate_sync():
        nonlocal rotated, freed
        for root, _dirs, files in os.walk(logs_dir):
            for name in files:
                if not name.endswith(".log"):
                    continue
                filepath = os.path.join(root, name)
                try:
                    size = os.path.getsize(filepath)
                    if size <= max_bytes:
                        continue

                    savings = size - keep_bytes

                    if not dry_run:
                        # Keep the last keep_bytes of the file
                        with open(filepath, "r+b") as f:
                            f.seek(-keep_bytes, 2)
                            tail = f.read()
                            f.seek(0)
                            f.write(tail)
                            f.truncate()

                    rotated += 1
                    freed += savings
                    details.append({
                        "file": name,
                        "original_size": _human_size(size),
                        "new_size": _human_size(keep_bytes),
                        "freed": _human_size(savings),
                    })
                except OSError as e:
                    logger.warning("log_rotate_error", file=name, error=str(e))
                    details.append({"file": name, "error": str(e)})

    await asyncio.to_thread(_rotate_sync)

    if not dry_run:
        _cache = None

    return RotateLogsResponse(
        rotated_count=rotated,
        freed_bytes=freed,
        freed_human=_human_size(freed),
        details=details,
        dry_run=dry_run,
    )


# ---------------------------------------------------------------------------
# Relocate videos to the archive (tiered storage, plan media-storage-tiering H)
# ---------------------------------------------------------------------------

class RelocateStatsResponse(BaseModel):
    archive_configured: bool
    archive_root_id: str
    candidate_count: int
    candidate_bytes: int
    candidate_human: str


class RelocateVideosResponse(BaseModel):
    archive_configured: bool
    dry_run: bool
    moved: int
    skipped: int
    errors: int
    freed_bytes: int
    freed_human: str
    would_move_bytes: int
    would_move_human: str
    error_ids: list[int]


class RestoreStatsResponse(BaseModel):
    archive_configured: bool
    archive_root_id: str
    candidate_count: int
    # Local disk this restore would CONSUME (inverse of relocation's freed bytes).
    candidate_bytes: int
    candidate_human: str


class RestoreResponse(BaseModel):
    archive_configured: bool
    dry_run: bool
    restored: int
    skipped: int
    errors: int
    restored_bytes: int
    restored_human: str
    would_restore_bytes: int
    would_restore_human: str
    error_ids: list[int]


class RelocateJobStartResponse(BaseModel):
    job_id: str
    status: str  # "queued"


class RelocateJobProgress(BaseModel):
    """Live snapshot of a background relocation job (Redis-backed)."""
    job_id: str
    status: str  # queued | running | completed | cancelled | error | continued
    apply: bool
    cursor: int
    processed: int
    moved: int
    skipped: int
    errors: int
    freed_bytes: int
    freed_human: str
    would_bytes: int
    would_human: str
    error_ids: list[int]
    skipped_reasons: dict[str, int] = {}


class RestoreJobProgress(BaseModel):
    """Live snapshot of a background restore job (Redis-backed)."""
    job_id: str
    status: str  # queued | running | completed | cancelled | error | continued | interrupted
    apply: bool
    cursor: int
    processed: int
    restored: int
    skipped: int
    errors: int
    restored_bytes: int
    restored_human: str
    would_bytes: int
    would_human: str
    error_ids: list[int]
    skipped_reasons: dict[str, int] = {}


def _csv_list(raw: Optional[str]) -> Optional[list[str]]:
    """Parse a comma-separated query param into a list (None when empty)."""
    if not raw:
        return None
    items = [x.strip() for x in raw.split(",") if x.strip()]
    return items or None


def _csv_int_list(raw: Optional[str]) -> Optional[list[int]]:
    """Parse a comma-separated query param into a list of ints (None when empty).

    Non-integer tokens are skipped rather than raising — the caller (a UI set
    picker) should only ever send numeric ids.
    """
    if not raw:
        return None
    out: list[int] = []
    for token in raw.split(","):
        token = token.strip()
        if not token:
            continue
        try:
            out.append(int(token))
        except ValueError:
            continue
    return out or None


# Shared criteria query params for the relocate stats + action endpoints.
_MEDIA_TYPES_Q = Query(
    None, description="CSV of media types to archive: video,image,audio,3d_model (default: video)"
)
_OLDER_THAN_Q = Query(None, ge=0, description="Only assets created more than N days ago")
_CONTENT_RATINGS_Q = Query(
    None, description="CSV of content_rating values: general,mature,adult,explicit"
)
_EXCLUDE_FAVORITES_Q = Query(
    False, description="Never archive assets tagged user:favorite (pin favorites to local)"
)
_EXCLUDE_SET_IDS_Q = Query(
    None,
    description="CSV of manual asset-set ids whose members are pinned to local (never archived)",
)
_INCLUDE_SET_IDS_Q = Query(
    None,
    description="CSV of manual asset-set ids; restrict candidates to members of these sets only",
)
_RESTORE_ASSET_IDS_Q = Query(
    None, description="CSV of asset ids to restore from archive back to local"
)
_RESTORE_SET_IDS_Q = Query(
    None,
    description="CSV of manual asset-set ids; restore the archived members of these sets",
)
_DELETE_ARCHIVE_Q = Query(
    False,
    description="After restoring to local, also delete the archive copy (default: keep as backup)",
)


def _exclude_tag_slugs(exclude_favorites: bool) -> Optional[list[str]]:
    """Map endpoint toggles onto candidate_query's generic exclude_tag_slugs."""
    from pixsim7.backend.main.services.storage.relocation import FAVORITE_TAG_SLUG

    slugs: list[str] = []
    if exclude_favorites:
        slugs.append(FAVORITE_TAG_SLUG)
    return slugs or None


@router.get("/relocate-stats", response_model=RelocateStatsResponse)
async def get_relocate_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    min_size_mb: float = Query(0.0, ge=0, description="Only assets >= this size (MB)"),
    media_types: Optional[str] = _MEDIA_TYPES_Q,
    older_than_days: Optional[int] = _OLDER_THAN_Q,
    content_ratings: Optional[str] = _CONTENT_RATINGS_Q,
    exclude_favorites: bool = _EXCLUDE_FAVORITES_Q,
    exclude_set_ids: Optional[str] = _EXCLUDE_SET_IDS_Q,
    include_set_ids: Optional[str] = _INCLUDE_SET_IDS_Q,
):
    """Count + bytes of local originals matching the relocation criteria that the
    archive would receive. Drives the relocate action's live preview."""
    from sqlalchemy import func as _func, select as _select

    from pixsim7.backend.main.services.storage.placement import (
        ARCHIVE_ROOT_ID,
        archive_configured,
    )
    from pixsim7.backend.main.services.storage.relocation import candidate_query

    min_bytes = int(min_size_mb * 1024 * 1024)
    base = candidate_query(
        min_bytes, admin.id,
        media_types=_csv_list(media_types),
        older_than_days=older_than_days,
        content_ratings=_csv_list(content_ratings),
        exclude_tag_slugs=_exclude_tag_slugs(exclude_favorites),
        exclude_set_ids=_csv_int_list(exclude_set_ids),
        include_set_ids=_csv_int_list(include_set_ids),
    ).subquery()
    row = (
        await db.execute(
            _select(
                _func.count().label("cnt"),
                _func.coalesce(_func.sum(base.c.file_size_bytes), 0).label("total_bytes"),
            ).select_from(base)
        )
    ).one()

    return RelocateStatsResponse(
        archive_configured=archive_configured(),
        archive_root_id=ARCHIVE_ROOT_ID,
        candidate_count=row.cnt,
        candidate_bytes=row.total_bytes,
        candidate_human=_human_size(row.total_bytes),
    )


@router.post("/relocate", response_model=RelocateVideosResponse)
@router.post("/relocate-videos", response_model=RelocateVideosResponse)
async def relocate_videos(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(50, ge=1, description="Max assets to process per batch"),
    min_size_mb: float = Query(0.0, ge=0, description="Only assets >= this size (MB)"),
    dry_run: bool = Query(True, description="Preview without uploading/moving"),
    verify_hash: bool = Query(
        False, description="Re-hash the archive copy and compare to asset.sha256 (slower)"
    ),
    media_types: Optional[str] = _MEDIA_TYPES_Q,
    older_than_days: Optional[int] = _OLDER_THAN_Q,
    content_ratings: Optional[str] = _CONTENT_RATINGS_Q,
    exclude_favorites: bool = _EXCLUDE_FAVORITES_Q,
    exclude_set_ids: Optional[str] = _EXCLUDE_SET_IDS_Q,
    include_set_ids: Optional[str] = _INCLUDE_SET_IDS_Q,
):
    """
    Move local originals matching the criteria to the configured ``archive``
    root, batch by batch. Wraps the same core logic as ``tools/relocate_media.py``.

    Criteria (all optional, AND-ed): ``media_types`` (default video), ``min_size_mb``,
    ``older_than_days``, ``content_ratings``, ``exclude_favorites`` (pin
    user:favorite-tagged assets to local), ``exclude_set_ids`` (pin members of these
    manual sets to local), ``include_set_ids`` (restrict to members of these manual
    sets). Each asset: upload to archive under the same key (idempotent), verify size
    (and optionally hash), flip ``storage_root_id``, then delete the local blob when
    no sibling still references it. Commits per-asset so a mid-batch failure keeps
    prior successes. Apply requires a configured archive.

    Served at both ``/relocate`` (generic) and ``/relocate-videos`` (legacy alias).
    """
    global _cache

    from pixsim7.backend.main.services.storage.placement import (
        ARCHIVE_ROOT_ID,
        archive_configured,
    )
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.services.storage.relocation import (
        candidate_query,
        relocate_one,
    )

    configured = archive_configured()
    if not dry_run and not configured:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Archive root '{ARCHIVE_ROOT_ID}' is not configured in "
                "settings.media_storage_roots — cannot relocate."
            ),
        )

    storage = get_storage_service()
    min_bytes = int(min_size_mb * 1024 * 1024)

    stmt = candidate_query(
        min_bytes, admin.id,
        media_types=_csv_list(media_types),
        older_than_days=older_than_days,
        content_ratings=_csv_list(content_ratings),
        exclude_tag_slugs=_exclude_tag_slugs(exclude_favorites),
        exclude_set_ids=_csv_int_list(exclude_set_ids),
        include_set_ids=_csv_int_list(include_set_ids),
    ).limit(limit)
    # Capture PKs up front, then re-fetch each asset fresh inside the loop.
    # relocate_one commits per-asset, and a per-asset failure runs db.rollback()
    # which expires EVERY loaded ORM instance (expire_on_commit=False otherwise
    # keeps them live). Iterating the already-loaded objects would then trip a
    # sync lazy-load on an expired attribute in async context -> MissingGreenlet
    # -> uncaught 500. Re-fetching by id (awaited) keeps every access on the
    # async path and lets the batch continue past a single bad asset.
    candidate_ids = [a.id for a in (await db.execute(stmt)).scalars().all()]

    moved = skipped = errors = 0
    freed = 0
    would_bytes = 0
    error_ids: list[int] = []

    for aid in candidate_ids:
        try:
            asset = await db.get(Asset, aid)
            if asset is None:
                skipped += 1
                continue
            res = await relocate_one(
                db, storage, asset,
                archive_root=ARCHIVE_ROOT_ID,
                apply=not dry_run,
                verify_hash=verify_hash,
            )
        except Exception as exc:  # noqa: BLE001 — report per-asset, keep going
            try:
                await db.rollback()
            except Exception:
                pass
            errors += 1
            error_ids.append(aid)
            logger.warning("relocate_video_failed", asset_id=aid, error=str(exc))
            continue

        status = res["status"]
        if status == "moved":
            moved += 1
            freed += res["freed_bytes"]
        elif status == "would_move":
            moved += 1
            would_bytes += res["bytes"]
        else:
            skipped += 1

    if not dry_run and moved:
        _cache = None  # storage placement changed — invalidate overview cache

    return RelocateVideosResponse(
        archive_configured=configured,
        dry_run=dry_run,
        moved=moved,
        skipped=skipped,
        errors=errors,
        freed_bytes=freed,
        freed_human=_human_size(freed),
        would_move_bytes=would_bytes,
        would_move_human=_human_size(would_bytes),
        error_ids=error_ids[:20],
    )


@router.get("/restore-stats", response_model=RestoreStatsResponse)
async def get_restore_stats(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    asset_ids: Optional[str] = _RESTORE_ASSET_IDS_Q,
    set_ids: Optional[str] = _RESTORE_SET_IDS_Q,
    media_types: Optional[str] = _MEDIA_TYPES_Q,
):
    """Count + bytes of archived originals matching the restore selection. The
    bytes are the LOCAL disk a restore would consume (mind low-disk machines)."""
    from sqlalchemy import func as _func, select as _select

    from pixsim7.backend.main.services.storage.placement import (
        ARCHIVE_ROOT_ID,
        archive_configured,
    )
    from pixsim7.backend.main.services.storage.relocation import restore_candidate_query

    base = restore_candidate_query(
        admin.id,
        archive_root=ARCHIVE_ROOT_ID,
        asset_ids=_csv_int_list(asset_ids),
        set_ids=_csv_int_list(set_ids),
        media_types=_csv_list(media_types),
    ).subquery()
    row = (
        await db.execute(
            _select(
                _func.count().label("cnt"),
                _func.coalesce(_func.sum(base.c.file_size_bytes), 0).label("total_bytes"),
            ).select_from(base)
        )
    ).one()

    return RestoreStatsResponse(
        archive_configured=archive_configured(),
        archive_root_id=ARCHIVE_ROOT_ID,
        candidate_count=row.cnt,
        candidate_bytes=row.total_bytes,
        candidate_human=_human_size(row.total_bytes),
    )


@router.post("/restore", response_model=RestoreResponse)
async def restore_assets(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(50, ge=1, le=500, description="Max assets to process per batch"),
    dry_run: bool = Query(True, description="Preview without downloading/restoring"),
    verify_hash: bool = Query(
        False, description="Re-hash the restored local copy and compare to asset.sha256"
    ),
    delete_archive: bool = _DELETE_ARCHIVE_Q,
    asset_ids: Optional[str] = _RESTORE_ASSET_IDS_Q,
    set_ids: Optional[str] = _RESTORE_SET_IDS_Q,
    media_types: Optional[str] = _MEDIA_TYPES_Q,
):
    """Restore archived originals back to the local root (reverse of ``/relocate``).

    Selection (AND-ed): ``asset_ids`` (explicit), ``set_ids`` (archived members of
    these manual sets), ``media_types``. Each asset: pull archive -> local, verify
    size (and optionally hash) BEFORE flipping ``storage_root_id`` back to local,
    then optionally delete the archive copy (``delete_archive``; off by default so
    the backup survives). Per-asset commit. Requires a configured archive.
    """
    global _cache

    from pixsim7.backend.main.services.storage.placement import (
        ARCHIVE_ROOT_ID,
        archive_configured,
    )
    from pixsim7.backend.main.domain.assets.models import Asset
    from pixsim7.backend.main.services.storage.relocation import (
        restore_candidate_query,
        restore_one,
    )

    configured = archive_configured()
    if not dry_run and not configured:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Archive root '{ARCHIVE_ROOT_ID}' is not configured — cannot restore."
            ),
        )

    storage = get_storage_service()
    stmt = restore_candidate_query(
        admin.id,
        archive_root=ARCHIVE_ROOT_ID,
        asset_ids=_csv_int_list(asset_ids),
        set_ids=_csv_int_list(set_ids),
        media_types=_csv_list(media_types),
    ).limit(limit)
    # See relocate_videos: re-fetch by id so a per-asset rollback (which expires
    # all loaded instances) can't trigger a sync lazy-load -> MissingGreenlet 500.
    candidate_ids = [a.id for a in (await db.execute(stmt)).scalars().all()]

    restored = skipped = errors = 0
    restored_bytes = 0
    would_bytes = 0
    error_ids: list[int] = []

    for aid in candidate_ids:
        try:
            asset = await db.get(Asset, aid)
            if asset is None:
                skipped += 1
                continue
            res = await restore_one(
                db, storage, asset,
                archive_root=ARCHIVE_ROOT_ID,
                apply=not dry_run,
                verify_hash=verify_hash,
                delete_archive=delete_archive,
            )
        except Exception as exc:  # noqa: BLE001 — report per-asset, keep going
            try:
                await db.rollback()
            except Exception:
                pass
            errors += 1
            error_ids.append(aid)
            logger.warning("restore_asset_failed", asset_id=aid, error=str(exc))
            continue

        status = res["status"]
        if status == "restored":
            restored += 1
            restored_bytes += res["restored_bytes"]
        elif status == "would_restore":
            restored += 1
            would_bytes += res["bytes"]
        else:
            skipped += 1

    if not dry_run and restored:
        _cache = None  # storage placement changed — invalidate overview cache

    return RestoreResponse(
        archive_configured=configured,
        dry_run=dry_run,
        restored=restored,
        skipped=skipped,
        errors=errors,
        restored_bytes=restored_bytes,
        restored_human=_human_size(restored_bytes),
        would_restore_bytes=would_bytes,
        would_restore_human=_human_size(would_bytes),
        error_ids=error_ids[:20],
    )


# ---------------------------------------------------------------------------
# Background relocation (cp-k): run the same move as a long-lived arq job so the
# UI doesn't block. Thin wrappers over the worker's control helpers — progress
# lives in Redis, so /relocate/job is pollable and survives a page reload.
# ---------------------------------------------------------------------------

def _progress_to_model(p: Optional[dict]) -> Optional[RelocateJobProgress]:
    if not p:
        return None
    freed = int(p.get("freed_bytes", 0) or 0)
    would = int(p.get("would_bytes", 0) or 0)
    return RelocateJobProgress(
        job_id=p.get("job_id", ""),
        status=p.get("status", "unknown"),
        apply=bool(p.get("apply", False)),
        cursor=int(p.get("cursor", 0) or 0),
        processed=int(p.get("processed", 0) or 0),
        moved=int(p.get("moved", 0) or 0),
        skipped=int(p.get("skipped", 0) or 0),
        errors=int(p.get("errors", 0) or 0),
        freed_bytes=freed,
        freed_human=_human_size(freed),
        would_bytes=would,
        would_human=_human_size(would),
        error_ids=list(p.get("error_ids", []) or [])[:20],
        skipped_reasons=dict(p.get("skipped_reasons", {}) or {}),
    )


@router.post("/relocate/start", response_model=RelocateJobStartResponse)
async def start_relocate_background(
    admin: CurrentAdminUser,
    min_size_mb: float = Query(0.0, ge=0),
    dry_run: bool = Query(False, description="Preview without moving (apply = not dry_run)"),
    verify_hash: bool = Query(False, description="Re-hash the archive copy vs asset.sha256 (slower)"),
    media_types: Optional[str] = _MEDIA_TYPES_Q,
    older_than_days: Optional[int] = _OLDER_THAN_Q,
    content_ratings: Optional[str] = _CONTENT_RATINGS_Q,
    exclude_favorites: bool = _EXCLUDE_FAVORITES_Q,
    exclude_set_ids: Optional[str] = _EXCLUDE_SET_IDS_Q,
    include_set_ids: Optional[str] = _INCLUDE_SET_IDS_Q,
    max_assets: Optional[int] = Query(None, ge=1, description="Cap assets processed (testing)"),
):
    """Start a background relocation job; returns its id for polling /relocate/job.

    Same criteria as POST /relocate. ``dry_run`` previews without moving; an
    apply (``dry_run=false``) requires a configured archive.
    """
    from pixsim7.backend.main.services.storage.placement import (
        ARCHIVE_ROOT_ID,
        archive_configured,
    )
    from pixsim7.backend.main.workers.relocation_processor import start_relocation_job

    apply = not dry_run
    if apply and not archive_configured():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Archive root '{ARCHIVE_ROOT_ID}' is not configured — cannot relocate."
            ),
        )
    criteria = {
        "user_id": admin.id,
        "min_size_mb": min_size_mb,
        "media_types": _csv_list(media_types) or ["video"],
        "older_than_days": older_than_days,
        "content_ratings": _csv_list(content_ratings),
        "exclude_favorites": exclude_favorites,
        "exclude_set_ids": _csv_int_list(exclude_set_ids),
        "include_set_ids": _csv_int_list(include_set_ids),
    }
    job_id = await start_relocation_job(
        criteria, apply=apply, verify_hash=verify_hash, max_assets=max_assets
    )
    return RelocateJobStartResponse(job_id=job_id, status="queued")


@router.get("/relocate/job", response_model=Optional[RelocateJobProgress])
async def get_relocate_job(
    admin: CurrentAdminUser,
    job_id: Optional[str] = Query(None, description="Job id; omit for the latest job"),
):
    """Poll a background relocation job's progress (latest job when ``job_id`` omitted).

    Returns null when there is no such job (or none has ever run) — the UI treats
    that as "nothing in flight".
    """
    from pixsim7.backend.main.workers.relocation_processor import read_relocation_progress

    return _progress_to_model(await read_relocation_progress(job_id))


@router.post("/relocate/cancel")
async def cancel_relocate_job(
    admin: CurrentAdminUser,
    job_id: str = Query(..., description="Job id to cancel"),
):
    """Request cancellation; the job stops after its current asset."""
    from pixsim7.backend.main.workers.relocation_processor import request_relocation_cancel

    await request_relocation_cancel(job_id)
    return {"ok": True, "job_id": job_id}


# ---------------------------------------------------------------------------
# Background restore: reverse of background relocation. Same long-lived arq job
# pattern so a bulk un-archive doesn't block the request — progress lives in
# Redis, so /restore/job is pollable and survives a page reload. Both run on the
# single-slot media-maintenance worker, so a restore and a relocation serialize
# (intended — they share the same S3/ZeroTier link).
# ---------------------------------------------------------------------------

def _restore_progress_to_model(p: Optional[dict]) -> Optional[RestoreJobProgress]:
    if not p:
        return None
    restored = int(p.get("restored_bytes", 0) or 0)
    would = int(p.get("would_bytes", 0) or 0)
    return RestoreJobProgress(
        job_id=p.get("job_id", ""),
        status=p.get("status", "unknown"),
        apply=bool(p.get("apply", False)),
        cursor=int(p.get("cursor", 0) or 0),
        processed=int(p.get("processed", 0) or 0),
        restored=int(p.get("restored", 0) or 0),
        skipped=int(p.get("skipped", 0) or 0),
        errors=int(p.get("errors", 0) or 0),
        restored_bytes=restored,
        restored_human=_human_size(restored),
        would_bytes=would,
        would_human=_human_size(would),
        error_ids=list(p.get("error_ids", []) or [])[:20],
        skipped_reasons=dict(p.get("skipped_reasons", {}) or {}),
    )


@router.post("/restore/start", response_model=RelocateJobStartResponse)
async def start_restore_background(
    admin: CurrentAdminUser,
    dry_run: bool = Query(False, description="Preview without restoring (apply = not dry_run)"),
    verify_hash: bool = Query(False, description="Re-hash the restored local copy vs archive (slower)"),
    delete_archive: bool = _DELETE_ARCHIVE_Q,
    asset_ids: Optional[str] = _RESTORE_ASSET_IDS_Q,
    set_ids: Optional[str] = _RESTORE_SET_IDS_Q,
    media_types: Optional[str] = _MEDIA_TYPES_Q,
    max_assets: Optional[int] = Query(None, ge=1, description="Cap assets processed (testing)"),
):
    """Start a background restore job; returns its id for polling /restore/job.

    Same selection as POST /restore. ``dry_run`` previews without downloading; an
    apply (``dry_run=false``) requires a configured archive.
    """
    from pixsim7.backend.main.services.storage.placement import (
        ARCHIVE_ROOT_ID,
        archive_configured,
    )
    from pixsim7.backend.main.workers.restore_processor import start_restore_job

    apply = not dry_run
    if apply and not archive_configured():
        raise HTTPException(
            status_code=400,
            detail=(
                f"Archive root '{ARCHIVE_ROOT_ID}' is not configured — cannot restore."
            ),
        )
    criteria = {
        "user_id": admin.id,
        "asset_ids": _csv_int_list(asset_ids),
        "set_ids": _csv_int_list(set_ids),
        # No video-only default for restore (mirrors restore_candidate_query):
        # None => restore all archived media types in the selection.
        "media_types": _csv_list(media_types),
    }
    job_id = await start_restore_job(
        criteria, apply=apply, verify_hash=verify_hash,
        delete_archive=delete_archive, max_assets=max_assets,
    )
    return RelocateJobStartResponse(job_id=job_id, status="queued")


@router.get("/restore/job", response_model=Optional[RestoreJobProgress])
async def get_restore_job(
    admin: CurrentAdminUser,
    job_id: Optional[str] = Query(None, description="Job id; omit for the latest job"),
):
    """Poll a background restore job's progress (latest job when ``job_id`` omitted).

    Returns null when there is no such job (or none has ever run) — the UI treats
    that as "nothing in flight".
    """
    from pixsim7.backend.main.workers.restore_processor import read_restore_progress

    return _restore_progress_to_model(await read_restore_progress(job_id))


@router.post("/restore/cancel")
async def cancel_restore_job(
    admin: CurrentAdminUser,
    job_id: str = Query(..., description="Job id to cancel"),
):
    """Request cancellation; the job stops after its current asset."""
    from pixsim7.backend.main.workers.restore_processor import request_restore_cancel

    await request_restore_cancel(job_id)
    return {"ok": True, "job_id": job_id}


# ---------------------------------------------------------------------------
# Storage roots configuration (add/edit/remove an archive root from the UI)
# ---------------------------------------------------------------------------
# Persisted in system_config namespace "storage_roots" as
# {"roots": [ {id, kind:"s3", endpoint_url, bucket, access_key, secret_key,
# region, presigned_ttl_seconds} ]}. A DB config row overrides the env-based
# settings.media_storage_roots (see roots.apply via the storage_roots applier).

_STORAGE_ROOTS_NS = "storage_roots"


class StorageRootConfigItem(BaseModel):
    """An editable extra root, with the secret never exposed."""
    id: str
    kind: str
    endpoint_url: Optional[str] = None
    bucket: Optional[str] = None
    access_key: Optional[str] = None
    region: Optional[str] = None
    presigned_ttl_seconds: Optional[int] = None
    has_secret: bool = False
    # 'store' (read/write tier) | 'source' (read-only ingest bucket). See plan
    # s3-source-root-ingest. 'prefix' scopes a source root to a sub-path.
    role: str = "store"
    prefix: Optional[str] = None


class StorageRootsConfigResponse(BaseModel):
    roots: list[StorageRootConfigItem]
    # 'db' = UI-managed (editable); 'env' = from .env (saving creates a DB
    # override that supersedes it); 'none' = no extra roots configured.
    source: str


class StorageRootUpsert(BaseModel):
    id: str = "archive"
    kind: str = "s3"
    endpoint_url: str
    bucket: str
    access_key: str
    # Omit/blank on edit to keep the stored secret.
    secret_key: Optional[str] = None
    region: str = "us-east-1"
    presigned_ttl_seconds: int = 3600
    # 'store' (read/write tier) | 'source' (read-only ingest bucket).
    role: str = "store"
    # Optional sub-path a source root is scoped to (ingest enumerates under it).
    prefix: Optional[str] = None


class StorageRootTestRequest(BaseModel):
    endpoint_url: str
    bucket: str
    access_key: str
    secret_key: Optional[str] = None
    region: str = "us-east-1"
    # If secret_key is omitted, reuse the stored secret for this root id.
    id: Optional[str] = None


class StorageRootTestResponse(BaseModel):
    online: bool
    error: Optional[str] = None


class StorageRootsListResponse(BaseModel):
    """Per-root placement summary for the dedicated Storage Tiering panel.

    Same StorageRootInfo as the storage-overview, but WITHOUT the expensive
    filesystem walk — a DB group-by plus an optional health probe. Cheap enough
    to load the panel on its own.
    """
    roots: list[StorageRootInfo]
    tiering_enabled: bool


@router.get("/storage-roots", response_model=StorageRootsListResponse)
async def list_storage_roots(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    probe_health: bool = Query(True, description="Probe each non-local root for reachability"),
):
    """Per-root sizes + online state for the Storage Tiering panel (no FS scan)."""
    roots = await _build_storage_roots(db, admin.id, probe_health)
    return StorageRootsListResponse(roots=roots, tiering_enabled=len(get_root_specs()) > 1)


def _mask_root(entry: dict) -> StorageRootConfigItem:
    return StorageRootConfigItem(
        id=str(entry.get("id", "")),
        kind=str(entry.get("kind", "s3")),
        endpoint_url=entry.get("endpoint_url"),
        bucket=entry.get("bucket"),
        access_key=entry.get("access_key"),
        region=entry.get("region"),
        presigned_ttl_seconds=entry.get("presigned_ttl_seconds"),
        has_secret=bool(entry.get("secret_key")),
        role=str(entry.get("role", "store")),
        prefix=entry.get("prefix"),
    )


async def _persisted_roots(db) -> list[dict]:
    from pixsim7.backend.main.services.system_config.service import get_config

    cfg = await get_config(db, _STORAGE_ROOTS_NS)
    return list(cfg.get("roots", [])) if cfg else []


async def _publish_storage_roots_reloaded() -> None:
    """Push a config-reload event so other processes (notably the arq worker,
    which runs the background relocate) rebuild their tiered storage service.

    Without this, ``apply_storage_roots`` only hot-reloads *this* API process;
    the worker keeps the storage endpoint it loaded at startup and a relocate
    job dials the stale host. Best-effort — the worker also reloads at startup.
    """
    try:
        from pixsim7.backend.main.infrastructure.events.bus import (
            event_bus,
            register_event_type,
        )

        register_event_type(
            "system_config:reloaded",
            description="A persisted system_config namespace was patched and should be reloaded by other processes.",
            payload_schema={"namespace": "str — namespace key (e.g. 'storage_roots')"},
            source="backend.api.v1.assets",
        )
        await event_bus.publish(
            "system_config:reloaded",
            {"namespace": _STORAGE_ROOTS_NS},
            wait=False,
            strict=False,
        )
    except Exception as e:  # noqa: BLE001 — propagation is best-effort
        logger.warning("storage_roots_event_publish_failed: %s", e)


@router.get("/storage-roots-config", response_model=StorageRootsConfigResponse)
async def get_storage_roots_config(admin: CurrentAdminUser, db: DatabaseSession):
    """Editable extra-root config for the Maintenance UI (secrets masked)."""
    persisted = await _persisted_roots(db)
    if persisted:
        return StorageRootsConfigResponse(
            roots=[_mask_root(r) for r in persisted], source="db"
        )
    # No DB override — reflect whatever the live registry derived from .env.
    specs = get_root_specs()
    env_items = [
        _mask_root({"id": s.id, "kind": s.kind, **(s.config or {})})
        for s in specs.values()
        if s.id != LOCAL_ROOT_ID
    ]
    return StorageRootsConfigResponse(
        roots=env_items, source="env" if env_items else "none"
    )


@router.post("/storage-roots/test", response_model=StorageRootTestResponse)
async def test_storage_root(
    body: StorageRootTestRequest,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """Probe an S3/MinIO root's reachability (head_bucket) without saving it."""
    from pixsim7.backend.main.services.storage.storage_service import S3StorageService

    secret = body.secret_key
    if not secret and body.id:
        for r in await _persisted_roots(db):
            if r.get("id") == body.id:
                secret = r.get("secret_key")
                break
    if not secret:
        raise HTTPException(status_code=400, detail="secret_key is required to test the connection")

    try:
        svc = S3StorageService(
            endpoint_url=body.endpoint_url,
            bucket=body.bucket,
            access_key=body.access_key,
            secret_key=secret,
            region=body.region,
        )
        await svc.health_check()
        return StorageRootTestResponse(online=True)
    except Exception as exc:  # noqa: BLE001 — report, never raise
        return StorageRootTestResponse(online=False, error=str(exc))


@router.put("/storage-roots", response_model=StorageRootsConfigResponse)
async def upsert_storage_root(
    body: StorageRootUpsert,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """Add or update an extra storage root and hot-reload the registry."""
    global _cache
    from pixsim7.backend.main.services.storage.roots import LOCAL_ROOT_ID as _LOCAL
    from pixsim7.backend.main.services.storage.storage_service import apply_storage_roots
    from pixsim7.backend.main.services.system_config.service import set_config

    if body.kind != "s3":
        raise HTTPException(status_code=400, detail="Only 's3' extra roots can be added from the UI")
    if not body.id or body.id == _LOCAL:
        raise HTTPException(status_code=400, detail="Invalid root id ('local' is reserved)")
    if body.role not in ("store", "source"):
        raise HTTPException(status_code=400, detail="role must be 'store' or 'source'")

    by_id = {r.get("id"): dict(r) for r in await _persisted_roots(db)}
    secret = body.secret_key or (by_id.get(body.id) or {}).get("secret_key")
    if not secret:
        raise HTTPException(
            status_code=400,
            detail="secret_key is required for a new root (or to migrate one from .env)",
        )

    entry = {
        "id": body.id,
        "kind": "s3",
        "endpoint_url": body.endpoint_url,
        "bucket": body.bucket,
        "access_key": body.access_key,
        "secret_key": secret,
        "region": body.region,
        "presigned_ttl_seconds": body.presigned_ttl_seconds,
        "role": body.role,
    }
    # Only persist a prefix for source roots, and only when non-empty.
    if body.role == "source" and body.prefix:
        entry["prefix"] = body.prefix
    by_id[body.id] = entry
    data = {"roots": list(by_id.values())}
    await set_config(db, _STORAGE_ROOTS_NS, data, admin.id)
    apply_storage_roots(data)  # live: override env + rebuild tiered storage
    await _publish_storage_roots_reloaded()  # propagate to the arq worker
    _cache = None  # storage roots changed — invalidate the overview scan cache

    return StorageRootsConfigResponse(
        roots=[_mask_root(r) for r in data["roots"]], source="db"
    )


@router.delete("/storage-roots/{root_id}", response_model=StorageRootsConfigResponse)
async def delete_storage_root(
    root_id: str,
    admin: CurrentAdminUser,
    db: DatabaseSession,
):
    """Remove an extra storage root and hot-reload the registry.

    Does NOT touch any assets already placed on that root — they keep their
    ``storage_root_id`` and will read as archived-offline until the root is
    restored. Relocate them back first if you want them fully local.
    """
    global _cache
    from pixsim7.backend.main.services.storage.storage_service import apply_storage_roots
    from pixsim7.backend.main.services.system_config.service import set_config

    remaining = [r for r in await _persisted_roots(db) if r.get("id") != root_id]
    data = {"roots": remaining}
    await set_config(db, _STORAGE_ROOTS_NS, data, admin.id)
    apply_storage_roots(data)
    await _publish_storage_roots_reloaded()  # propagate to the arq worker
    _cache = None

    return StorageRootsConfigResponse(
        roots=[_mask_root(r) for r in remaining], source="db"
    )


class SourceIngestResponse(BaseModel):
    """Aggregate result of a source-root ingest run (plan s3-source-root-ingest)."""
    root_id: str
    scanned: int
    created: int
    deduped: int
    skipped: int
    errors: int


@router.post("/storage-roots/{root_id}/ingest", response_model=SourceIngestResponse)
async def ingest_storage_source_root(
    root_id: str,
    admin: CurrentAdminUser,
    db: DatabaseSession,
    limit: int = Query(
        500, ge=1, le=100000,
        description="Max objects to scan this run (bounds a synchronous run; re-run to continue).",
    ),
):
    """Enumerate a ``role='source'`` S3 root and ingest its objects into the
    archive CAS as assets (plan s3-source-root-ingest, cp-d).

    Synchronous MVP: already-ingested objects are skipped without download, so
    re-running is cheap and incremental. Use ``limit`` to bound a single run on a
    large bucket (a background job is a follow-up). 404 if ``root_id`` is not a
    configured source root.
    """
    from pixsim7.backend.main.services.asset.source_ingest import ingest_source_root

    try:
        stats = await ingest_source_root(
            db, user_id=admin.id, source_root_id=root_id, limit=limit
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:  # noqa: BLE001 — classify unreachable source vs real error
        probe = await get_storage_service().probe_root(root_id)
        if probe.get("online") is False:
            logger.warning("source_ingest_root_offline", root_id=root_id, error=probe.get("error"))
            raise HTTPException(
                status_code=503,
                detail="Source root offline — the ingest store is unreachable",
                headers={"X-Media-State": "source-offline", "Retry-After": "30"},
            )
        logger.error("source_ingest_failed", root_id=root_id, error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ingest failed: {e}")
    return SourceIngestResponse(root_id=root_id, **stats)
