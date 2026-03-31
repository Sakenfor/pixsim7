"""
Migration Routes — Alembic migration management for multiple databases.
"""

from fastapi import APIRouter
from typing import Optional

router = APIRouter(prefix="/migrations", tags=["migrations"])


def _get_tools():
    from launcher.core.migration_tools import (
        _run_alembic, _filter_alembic_output,
        discover_databases, get_pending_migrations_detailed,
    )
    return _run_alembic, _filter_alembic_output, discover_databases, get_pending_migrations_detailed


@router.get("/databases")
async def list_databases():
    """List all discovered database/migration configs."""
    _, _, discover, _ = _get_tools()
    dbs = discover()
    # Mask passwords in URLs
    for db in dbs:
        url = db.get("db_url", "")
        if "@" in url:
            pre, post = url.rsplit("@", 1)
            if ":" in pre:
                scheme_user = pre.rsplit(":", 1)[0]
                db["db_url"] = f"{scheme_user}:***@{post}"
    return {"databases": dbs}


@router.get("/status")
async def migration_status(db_id: str = "main"):
    """Get migration status for a specific database."""
    run_alembic, filter_output, discover, get_pending = _get_tools()

    # Find config for this db_id
    dbs = discover()
    db = next((d for d in dbs if d["id"] == db_id), None)
    if not db:
        return {"error": f"Database '{db_id}' not found", "databases": [d["id"] for d in dbs]}

    config = db["config"]

    # Current revision
    code, out, err = run_alembic('current', config=config)
    current = filter_output(out) if code == 0 else f"error: {err.strip()}"

    # Heads
    code, out, err = run_alembic('heads', config=config)
    heads = filter_output(out) if code == 0 else f"error: {err.strip()}"

    # Pending — only works for main db currently (uses get_pending_migrations_detailed)
    pending_list = []
    pending_error = None
    if db_id == "main":
        try:
            nodes, perr = get_pending()
            pending_list = [
                {"revision": n.revision, "message": getattr(n, 'description', '') or getattr(n, 'message', ''), "is_head": n.is_head}
                for n in (nodes or [])
            ]
            pending_error = perr
        except Exception as e:
            pending_error = str(e)

    return {
        "db_id": db_id,
        "label": db["label"],
        "current_revision": current or "(no revision)",
        "heads": heads or "(no heads)",
        "pending": pending_list,
        "pending_error": pending_error,
    }


@router.get("/history")
async def migration_history(db_id: str = "main", limit: int = 20):
    """Get migration history for a specific database."""
    run_alembic, filter_output, discover, _ = _get_tools()
    db = next((d for d in discover() if d["id"] == db_id), None)
    if not db:
        return {"ok": False, "error": f"Database '{db_id}' not found"}
    code, out, err = run_alembic('history', f'-n {limit}', config=db["config"])
    if code != 0:
        return {"ok": False, "error": err.strip() or out.strip()}
    return {"ok": True, "result": filter_output(out)}


@router.post("/upgrade")
async def migrate_upgrade(db_id: str = "main"):
    """Run alembic upgrade head for a specific database."""
    run_alembic, _, discover, _ = _get_tools()
    db = next((d for d in discover() if d["id"] == db_id), None)
    if not db:
        return {"ok": False, "error": f"Database '{db_id}' not found"}
    code, out, err = run_alembic('upgrade', 'head', config=db["config"])
    return {"ok": code == 0, "result": out.strip() or "upgraded", "error": err.strip() if code != 0 else None}


@router.post("/downgrade")
async def migrate_downgrade(db_id: str = "main"):
    """Run alembic downgrade -1 for a specific database."""
    run_alembic, _, discover, _ = _get_tools()
    db = next((d for d in discover() if d["id"] == db_id), None)
    if not db:
        return {"ok": False, "error": f"Database '{db_id}' not found"}
    code, out, err = run_alembic('downgrade', '-1', config=db["config"])
    return {"ok": code == 0, "result": out.strip() or "downgraded", "error": err.strip() if code != 0 else None}


@router.post("/stamp")
async def migrate_stamp(db_id: str = "main"):
    """Run alembic stamp head for a specific database."""
    run_alembic, _, discover, _ = _get_tools()
    db = next((d for d in discover() if d["id"] == db_id), None)
    if not db:
        return {"ok": False, "error": f"Database '{db_id}' not found"}
    code, out, err = run_alembic('stamp', 'head', config=db["config"])
    return {"ok": code == 0, "result": out.strip() or "stamped", "error": err.strip() if code != 0 else None}


@router.post("/merge")
async def migrate_merge(db_id: str = "main"):
    """Run alembic merge heads for a specific database."""
    run_alembic, _, discover, _ = _get_tools()
    db = next((d for d in discover() if d["id"] == db_id), None)
    if not db:
        return {"ok": False, "error": f"Database '{db_id}' not found"}
    code, out, err = run_alembic('merge', 'heads', '-m', 'merge migration branches', config=db["config"])
    return {"ok": code == 0, "result": out.strip() or "merged", "error": err.strip() if code != 0 else None}
