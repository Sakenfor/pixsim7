"""
Buildables Routes - Endpoints for buildable workspace packages.
"""

import subprocess
import sys
import time
from fastapi import APIRouter, Body

from launcher.core import load_buildables

from ..models import BuildableDefinitionResponse, BuildablesListResponse


router = APIRouter(prefix="/buildables", tags=["buildables"])


@router.get("", response_model=BuildablesListResponse)
async def list_buildables():
    """List buildable workspace packages."""
    buildables = load_buildables()
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
        )
        for buildable in buildables
    ]
    return BuildablesListResponse(buildables=items, total=len(items))


@router.post("/{package_name}/build")
async def build_package(package_name: str):
    """Run pnpm build for a specific package."""
    pnpm = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    start = time.time()
    try:
        result = subprocess.run(
            [pnpm, "--filter", package_name, "build"],
            capture_output=True, text=True, timeout=120,
            cwd=str(load_buildables.__module__ and __import__('launcher.core.buildables', fromlist=['DEFAULT_ROOT']).DEFAULT_ROOT),
        )
        duration = int((time.time() - start) * 1000)
        return {
            "ok": result.returncode == 0,
            "exit_code": result.returncode,
            "duration_ms": duration,
            "stdout": result.stdout[-2000:] if result.stdout else "",
            "stderr": result.stderr[-2000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "exit_code": -1, "duration_ms": 120000, "stdout": "", "stderr": "Build timed out (120s)"}
    except Exception as e:
        return {"ok": False, "exit_code": -1, "duration_ms": 0, "stdout": "", "stderr": str(e)}
