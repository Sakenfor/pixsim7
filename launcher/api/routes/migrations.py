"""
Migration Routes — Alembic migration management endpoints.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/migrations", tags=["migrations"])


def _run_migration_tool(func_name: str, **kwargs):
    """Call a migration_tools function and return the result."""
    try:
        from launcher.gui.migration_tools import (
            get_current_revision, get_heads, get_history,
            upgrade_head, downgrade_one, stamp_head, merge_heads,
            get_pending_migrations_detailed,
        )
        fn = {
            "current": get_current_revision,
            "heads": get_heads,
            "history": get_history,
            "upgrade": upgrade_head,
            "downgrade": downgrade_one,
            "stamp": stamp_head,
            "merge": merge_heads,
            "pending": get_pending_migrations_detailed,
        }.get(func_name)
        if not fn:
            return {"ok": False, "error": f"Unknown function: {func_name}"}
        result = fn(**kwargs) if kwargs else fn()
        return {"ok": True, "result": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("/status")
async def migration_status():
    """Get current migration status: revision, heads, pending."""
    current = _run_migration_tool("current")
    heads = _run_migration_tool("heads")
    pending = _run_migration_tool("pending")

    pending_list = []
    pending_error = None
    if pending["ok"]:
        nodes, err = pending["result"]
        pending_list = [
            {"revision": n.revision, "message": n.message, "is_head": n.is_head}
            for n in (nodes or [])
        ]
        pending_error = err
    else:
        pending_error = pending.get("error")

    return {
        "current_revision": current.get("result", "unknown") if current["ok"] else current.get("error"),
        "heads": heads.get("result", "") if heads["ok"] else heads.get("error"),
        "pending": pending_list,
        "pending_error": pending_error,
    }


@router.get("/history")
async def migration_history():
    """Get migration history."""
    result = _run_migration_tool("history")
    return result


@router.post("/upgrade")
async def migrate_upgrade():
    """Run alembic upgrade head."""
    return _run_migration_tool("upgrade")


@router.post("/downgrade")
async def migrate_downgrade():
    """Run alembic downgrade -1."""
    return _run_migration_tool("downgrade")


@router.post("/stamp")
async def migrate_stamp():
    """Run alembic stamp head."""
    return _run_migration_tool("stamp")


@router.post("/merge")
async def migrate_merge():
    """Run alembic merge heads."""
    return _run_migration_tool("merge", message="merge migration branches")
