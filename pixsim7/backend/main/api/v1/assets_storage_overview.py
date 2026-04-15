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

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.api.dependencies import CurrentAdminUser, DatabaseSession
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
            COALESCE(media_type, 'unknown') as media_type,
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

_cache: Optional[tuple[float, StorageOverviewResponse]] = None
_CACHE_TTL = 60.0


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/storage-overview", response_model=StorageOverviewResponse)
async def get_storage_overview(
    admin: CurrentAdminUser,
    db: DatabaseSession,
    force: bool = Query(False, description="Bypass cache"),
):
    """
    System-wide storage overview: filesystem sizes, media breakdown,
    database table sizes, unused indexes, and cleanup opportunities.
    """
    global _cache

    if not force and _cache is not None:
        cached_at, cached_response = _cache
        if time.monotonic() - cached_at < _CACHE_TTL:
            return cached_response

    t0 = time.monotonic()

    registry = get_path_registry()
    pixsim_home = registry.pixsim_home

    # Filesystem scan in thread + DB queries in parallel
    fs_task = asyncio.to_thread(_scan_pixsim_home, pixsim_home)
    media_task = _query_media_types(db, admin.id)
    tables_task = _query_table_sizes(db)
    indexes_task = _query_unused_indexes(db)
    db_size_task = _query_db_total_size(db)

    (directories, media_subdirs), media_types, db_tables, unused_indexes, db_total = (
        await asyncio.gather(fs_task, media_task, tables_task, indexes_task, db_size_task)
    )

    cleanup = _compute_cleanup_opportunities(directories, media_types, unused_indexes)

    total_size = sum(d.size_bytes for d in directories)
    elapsed_ms = int((time.monotonic() - t0) * 1000)

    response = StorageOverviewResponse(
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
    )

    _cache = (time.monotonic(), response)
    return response


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
