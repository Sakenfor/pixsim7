"""
Buildables Routes - Endpoints for buildable workspace packages.
"""

import subprocess
import sys
import time
from typing import Optional
from fastapi import APIRouter, Query

from launcher.core import load_buildables
from launcher.core.buildables import DEFAULT_ROOT

from ..models import BuildableDefinitionResponse, BuildablesListResponse, BuildStatusResponse


router = APIRouter(prefix="/buildables", tags=["buildables"])

# In-memory cache with TTL to avoid re-scanning on every poll
_cache: Optional[list] = None
_cache_ts: float = 0
_CACHE_TTL = 30.0  # seconds


def _get_buildables(force: bool = False) -> list:
    global _cache, _cache_ts
    now = time.time()
    if not force and _cache is not None and (now - _cache_ts) < _CACHE_TTL:
        return _cache
    _cache = load_buildables()
    _cache_ts = now
    return _cache


@router.get("", response_model=BuildablesListResponse)
async def list_buildables(refresh: bool = Query(False)):
    """List buildable workspace packages."""
    buildables = _get_buildables(force=refresh)
    items = [
        BuildableDefinitionResponse(
            id=buildable.id,
            title=buildable.title,
            package=buildable.package,
            directory=buildable.directory,
            description=buildable.description,
            command=buildable.command,
            args=buildable.args,
            category=buildable.category,
            tags=buildable.tags,
            build_status=BuildStatusResponse(
                state=buildable.build_status.state,
                output_dir=buildable.build_status.output_dir,
                source_modified=buildable.build_status.source_modified,
                build_modified=buildable.build_status.build_modified,
            ),
        )
        for buildable in buildables
    ]
    return BuildablesListResponse(buildables=items, total=len(items))


_BUILD_TIMEOUT_S = 600


@router.post("/{package_name}/build")
async def build_package(package_name: str):
    """Run pnpm build for a specific package."""
    global _cache
    pnpm = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    start = time.time()
    try:
        result = subprocess.run(
            [pnpm, "--filter", package_name, "build"],
            capture_output=True, text=True, timeout=_BUILD_TIMEOUT_S,
            cwd=str(DEFAULT_ROOT),
        )
        duration = int((time.time() - start) * 1000)
        _cache = None  # invalidate so next list gets fresh build_status
        return {
            "ok": result.returncode == 0,
            "exit_code": result.returncode,
            "duration_ms": duration,
            "stdout": result.stdout[-2000:] if result.stdout else "",
            "stderr": result.stderr[-2000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "exit_code": -1,
            "duration_ms": _BUILD_TIMEOUT_S * 1000,
            "stdout": "",
            "stderr": f"Build timed out ({_BUILD_TIMEOUT_S}s)",
        }
    except Exception as e:
        return {"ok": False, "exit_code": -1, "duration_ms": 0, "stdout": "", "stderr": str(e)}
