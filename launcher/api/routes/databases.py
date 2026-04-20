"""Database Routes — operational DB management (backup, restore, health).

Sibling to ``migrations.py`` (which handles alembic schema evolution).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/databases", tags=["databases"])


@router.get("/backups")
async def list_backups_endpoint() -> dict:
    """List all existing .dump files in the backups directory."""
    from launcher.core.db_tools import list_backups
    return {"backups": list_backups()}


@router.get("/{db_id}/health")
async def database_health(db_id: str) -> dict:
    """Return DB size + table stats + recent migrations for the health panel."""
    from launcher.core.db_tools import get_database_health
    return get_database_health(db_id)


@router.get("/{db_id}/tables/{schema}/{name}")
async def inspect_table_endpoint(db_id: str, schema: str, name: str) -> dict:
    """Return columns + indexes + row count + size for one table."""
    from launcher.core.db_tools import inspect_table
    return inspect_table(db_id, schema, name)


@router.get("/{db_id}/backup-info")
async def backup_info(db_id: str) -> dict:
    """Report which backup mode will be used (docker / local / unavailable).

    The UI calls this before showing the backup button so the user knows
    whether anything will happen when they click, and via what route.
    """
    from launcher.core.db_tools import probe_backup_capability
    return {"db_id": db_id, **probe_backup_capability(db_id)}


@router.post("/{db_id}/backup")
async def backup_db(db_id: str) -> dict:
    """Run ``pg_dump -Fc`` for a given db_id and stash the file in the
    backups directory.  Prefers ``docker exec`` inside the DB's container
    when running; falls back to a local ``pg_dump``.
    """
    from launcher.core.db_tools import resolve_db_url, run_pg_dump

    url = resolve_db_url(db_id)
    if not url:
        raise HTTPException(
            status_code=404,
            detail=f"No DB URL configured for '{db_id}'",
        )

    code, path, err, mode = run_pg_dump(db_id, url)
    if code != 0 or path is None:
        return {
            "ok": False,
            "db_id": db_id,
            "mode": mode,
            "error": err or f"pg_dump exited with code {code}",
        }

    stat = path.stat()
    return {
        "ok": True,
        "db_id": db_id,
        "mode": mode,
        "filename": path.name,
        "path": str(path),
        "size_bytes": stat.st_size,
        "warnings": err or None,  # pg_dump often writes NOTICE lines to stderr
    }
