"""
Devtools codegen API endpoints.

Backend-authoritative task listing and execution for devtools,
plus database migration management.
"""

from __future__ import annotations

import configparser
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from pixsim7.backend.main.api.dependencies import CurrentCodegenUser
from pixsim7.backend.main.services.codegen import (
    CodegenRunResult,
    CodegenTask,
    DevtoolsTestRunResult,
    load_codegen_tasks,
    run_codegen_task,
    run_test_profile,
)

router = APIRouter(prefix="/devtools/codegen", tags=["devtools", "codegen"])


class CodegenTaskResponse(BaseModel):
    id: str
    description: str
    script: str
    supports_check: bool
    groups: list[str] = Field(default_factory=list)


class CodegenTasksResponse(BaseModel):
    tasks: list[CodegenTaskResponse]
    total: int


class CodegenRunRequest(BaseModel):
    task_id: str = Field(..., min_length=1)
    check: bool = False


class CodegenRunResponse(BaseModel):
    task_id: str
    ok: bool
    exit_code: int | None
    duration_ms: int
    stdout: str
    stderr: str


TestProfile = Literal["changed", "fast", "project-bundle", "full"]


class TestRunRequest(BaseModel):
    profile: TestProfile
    backend_only: bool = False
    frontend_only: bool = False
    list_only: bool = False


class TestRunResponse(BaseModel):
    profile: TestProfile
    ok: bool
    exit_code: int | None
    duration_ms: int
    stdout: str
    stderr: str
    backend_only: bool = False
    frontend_only: bool = False
    list_only: bool = False


def _to_task_response(task: CodegenTask) -> CodegenTaskResponse:
    return CodegenTaskResponse(
        id=task.id,
        description=task.description,
        script=task.script,
        supports_check=task.supports_check,
        groups=task.groups,
    )


def _to_run_response(result: CodegenRunResult) -> CodegenRunResponse:
    return CodegenRunResponse(
        task_id=result.task_id,
        ok=result.ok,
        exit_code=result.exit_code,
        duration_ms=result.duration_ms,
        stdout=result.stdout,
        stderr=result.stderr,
    )


def _to_test_run_response(result: DevtoolsTestRunResult) -> TestRunResponse:
    return TestRunResponse(
        profile=result.profile,
        ok=result.ok,
        exit_code=result.exit_code,
        duration_ms=result.duration_ms,
        stdout=result.stdout,
        stderr=result.stderr,
        backend_only=result.backend_only,
        frontend_only=result.frontend_only,
        list_only=result.list_only,
    )


@router.get("/tasks", response_model=CodegenTasksResponse)
async def list_codegen_tasks(user: CurrentCodegenUser):
    _ = user
    try:
        tasks = load_codegen_tasks()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load codegen tasks: {exc}") from exc

    return CodegenTasksResponse(
        tasks=[_to_task_response(task) for task in tasks],
        total=len(tasks),
    )


@router.post("/run", response_model=CodegenRunResponse)
async def run_codegen_task_endpoint(
    payload: CodegenRunRequest,
    user: CurrentCodegenUser,
):
    _ = user
    try:
        result = await run_in_threadpool(
            run_codegen_task,
            payload.task_id,
            payload.check,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to run codegen task: {exc}") from exc

    return _to_run_response(result)


@router.post("/tests/run", response_model=TestRunResponse)
async def run_tests_endpoint(
    payload: TestRunRequest,
    user: CurrentCodegenUser,
):
    _ = user
    try:
        result = await run_in_threadpool(
            run_test_profile,
            payload.profile,
            payload.backend_only,
            payload.frontend_only,
            payload.list_only,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to run tests: {exc}") from exc

    return _to_test_run_response(result)


# ---------------------------------------------------------------------------
# Database Migrations
# ---------------------------------------------------------------------------

VALID_MIGRATION_SCOPES = ("all", "main", "game", "blocks", "logs")
INDIVIDUAL_SCOPES = ("main", "game", "blocks", "logs")

MigrationScope = Literal["all", "main", "game", "blocks", "logs"]

# Maps scope -> alembic config file (relative to repo root)
_SCOPE_CONFIG_FILES: dict[str, str] = {
    "main": "alembic.ini",
    "game": "alembic_game.ini",
    "blocks": "alembic_blocks.ini",
    "logs": "alembic_logs.ini",
}

# Maps scope -> version table used in env.py
_SCOPE_VERSION_TABLES: dict[str, str] = {
    "main": "alembic_version",
    "game": "alembic_version_game",
    "blocks": "alembic_version_blocks",
    "logs": "alembic_version_logs",
}


class MigrationScopeDetail(BaseModel):
    scope: str
    config_file: str
    script_location: str
    database_url: str
    version_table: str
    migration_count: int


class MigrationStatusResponse(BaseModel):
    available: bool
    scopes: list[str]
    scope_details: list[MigrationScopeDetail] = Field(default_factory=list)


class MigrationRunRequest(BaseModel):
    scope: str = Field(..., min_length=1)


class MigrationRunResponse(BaseModel):
    ok: bool
    scope: str
    exit_code: int | None
    duration_ms: int
    stdout: str
    stderr: str


class MigrationHeadResponse(BaseModel):
    scope: str
    current_head: str | None
    is_head: bool
    error: str | None = None


def _resolve_repo_root() -> Path:
    """Walk up from this file to find the repo root (contains scripts/)."""
    candidate = Path(__file__).resolve()
    for _ in range(10):
        candidate = candidate.parent
        if (candidate / "scripts" / "migrate_all.py").is_file():
            return candidate
    raise FileNotFoundError("Cannot locate repository root")


def _resolve_migrate_script() -> Path:
    """Locate ``scripts/migrate_all.py`` relative to the repo root."""
    return _resolve_repo_root() / "scripts" / "migrate_all.py"


def _mask_url(url: str) -> str:
    """Mask password in a database URL for safe display."""
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", url)


def _count_migrations(repo_root: Path, script_location: str) -> int:
    """Count .py migration files in the versions/ directory."""
    versions_dir = repo_root / script_location / "versions"
    if not versions_dir.is_dir():
        return 0
    return sum(
        1 for f in versions_dir.iterdir()
        if f.suffix == ".py" and f.name != "__pycache__"
    )


def _parse_scope_config(scope: str, repo_root: Path) -> MigrationScopeDetail | None:
    """Parse an alembic .ini file and return scope detail."""
    config_file = _SCOPE_CONFIG_FILES.get(scope)
    if not config_file:
        return None
    ini_path = repo_root / config_file
    if not ini_path.is_file():
        return None
    cp = configparser.ConfigParser()
    cp.read(str(ini_path))
    alembic = cp["alembic"] if "alembic" in cp else {}
    script_location = alembic.get("script_location", "")
    raw_url = alembic.get("sqlalchemy.url", "")
    return MigrationScopeDetail(
        scope=scope,
        config_file=config_file,
        script_location=script_location,
        database_url=_mask_url(raw_url),
        version_table=_SCOPE_VERSION_TABLES.get(scope, "alembic_version"),
        migration_count=_count_migrations(repo_root, script_location),
    )


def _get_current_head(scope: str, repo_root: Path, timeout_s: int = 30) -> MigrationHeadResponse:
    """Run ``alembic -c <config> current`` and parse the revision."""
    config_file = _SCOPE_CONFIG_FILES.get(scope)
    if not config_file:
        return MigrationHeadResponse(scope=scope, current_head=None, is_head=False, error="Unknown scope")
    ini_path = repo_root / config_file
    if not ini_path.is_file():
        return MigrationHeadResponse(scope=scope, current_head=None, is_head=False, error=f"{config_file} not found")
    cmd = [sys.executable, "-m", "alembic", "-c", str(ini_path), "current"]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout_s, cwd=str(repo_root),
        )
        output = proc.stdout.strip()
        # Parse lines like "20260303_0003 (head)" or "game_baseline (head)"
        head_match = re.search(r"(\S+)\s+\(head\)", output)
        if head_match:
            return MigrationHeadResponse(scope=scope, current_head=head_match.group(1), is_head=True)
        # May have a revision but not at head
        rev_match = re.search(r"^(\S+)", output, re.MULTILINE)
        if rev_match and proc.returncode == 0:
            return MigrationHeadResponse(scope=scope, current_head=rev_match.group(1), is_head=False)
        if proc.returncode != 0:
            return MigrationHeadResponse(
                scope=scope, current_head=None, is_head=False,
                error=proc.stderr.strip() or f"Exit code {proc.returncode}",
            )
        return MigrationHeadResponse(scope=scope, current_head=None, is_head=False)
    except subprocess.TimeoutExpired:
        return MigrationHeadResponse(scope=scope, current_head=None, is_head=False, error="Timed out")


def _run_migration(scope: str, timeout_s: int = 300) -> MigrationRunResponse:
    script = _resolve_migrate_script()
    cmd = [sys.executable, str(script), "--scope", scope]
    start = time.monotonic()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            cwd=str(script.parent.parent),
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return MigrationRunResponse(
            ok=proc.returncode == 0,
            scope=scope,
            exit_code=proc.returncode,
            duration_ms=elapsed_ms,
            stdout=proc.stdout or "",
            stderr=proc.stderr or "",
        )
    except subprocess.TimeoutExpired:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return MigrationRunResponse(
            ok=False,
            scope=scope,
            exit_code=None,
            duration_ms=elapsed_ms,
            stdout="",
            stderr=f"Migration timed out after {timeout_s}s",
        )


@router.get("/migrations/status", response_model=MigrationStatusResponse)
async def get_migration_status(user: CurrentCodegenUser):
    _ = user
    try:
        repo_root = _resolve_repo_root()
        available = True
    except FileNotFoundError:
        return MigrationStatusResponse(available=False, scopes=[], scope_details=[])

    details = []
    for scope in INDIVIDUAL_SCOPES:
        detail = _parse_scope_config(scope, repo_root)
        if detail:
            details.append(detail)

    return MigrationStatusResponse(
        available=available,
        scopes=list(INDIVIDUAL_SCOPES),
        scope_details=details,
    )


@router.get("/migrations/{scope}/head", response_model=MigrationHeadResponse)
async def get_migration_head(scope: str, user: CurrentCodegenUser):
    _ = user
    if scope not in INDIVIDUAL_SCOPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scope '{scope}'. Must be one of: {', '.join(INDIVIDUAL_SCOPES)}",
        )
    try:
        repo_root = _resolve_repo_root()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    result = await run_in_threadpool(_get_current_head, scope, repo_root)
    return result


@router.post("/migrations/run", response_model=MigrationRunResponse)
async def run_migration_endpoint(
    payload: MigrationRunRequest,
    user: CurrentCodegenUser,
):
    _ = user
    if payload.scope not in VALID_MIGRATION_SCOPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scope '{payload.scope}'. Must be one of: {', '.join(VALID_MIGRATION_SCOPES)}",
        )
    try:
        result = await run_in_threadpool(_run_migration, payload.scope)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Migration failed: {exc}") from exc
    return result
