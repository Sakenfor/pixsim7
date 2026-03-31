"""Desktop window route — open service UIs in native OS windows."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from launcher.core.desktop_window import is_available, open_window

router = APIRouter(prefix="/window", tags=["window"])


class WindowOpenRequest(BaseModel):
    url: str
    title: str = "PixSim"


@router.get("/available")
async def check_available():
    """Check if desktop window mode is available (pywebview installed)."""
    return {"available": is_available()}


@router.post("/open")
async def open_desktop_window(req: WindowOpenRequest):
    """Open a URL in a native desktop window."""
    ok = open_window(url=req.url, title=req.title)
    if not ok:
        return {"ok": False, "message": "pywebview not installed — run: pip install pywebview"}
    return {"ok": True, "message": f"Opened: {req.title}"}
