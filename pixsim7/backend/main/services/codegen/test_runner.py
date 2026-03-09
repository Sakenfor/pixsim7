"""
Backend test runner helpers.

Provides a guarded, profile-based interface for running the repository test
profiles via ``scripts/tests/run.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess
import sys
import time
from typing import Literal


TestProfile = Literal["changed", "fast", "project-bundle", "full"]

VALID_TEST_PROFILES: tuple[TestProfile, ...] = (
    "changed",
    "fast",
    "project-bundle",
    "full",
)


@dataclass(frozen=True)
class DevtoolsTestRunResult:
    profile: TestProfile
    ok: bool
    exit_code: int | None
    duration_ms: int
    stdout: str
    stderr: str
    backend_only: bool = False
    frontend_only: bool = False
    list_only: bool = False


def _resolve_repo_root() -> Path:
    """
    Resolve repository root by finding scripts/tests/run.py.
    """
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "scripts" / "tests" / "run.py").exists():
            return parent
    return here.parents[4] if len(here.parents) > 4 else here.parent


def run_test_profile(
    profile: TestProfile,
    backend_only: bool = False,
    frontend_only: bool = False,
    list_only: bool = False,
    root_dir: Path | None = None,
    timeout_s: int = 1800,
) -> DevtoolsTestRunResult:
    """
    Run one test profile via scripts/tests/run.py and return process output.
    """
    if profile not in VALID_TEST_PROFILES:
        raise ValueError(f"Unsupported test profile: {profile}")
    if backend_only and frontend_only:
        raise ValueError("--backend-only and --frontend-only are mutually exclusive")

    root = root_dir or _resolve_repo_root()
    runner = root / "scripts" / "tests" / "run.py"
    if not runner.exists():
        raise FileNotFoundError(f"Unified test runner not found: {runner}")

    cmd = [sys.executable, str(runner), profile]
    if backend_only:
        cmd.append("--backend-only")
    if frontend_only:
        cmd.append("--frontend-only")
    if list_only:
        cmd.append("--list")

    start = time.monotonic()
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return DevtoolsTestRunResult(
            profile=profile,
            ok=proc.returncode == 0,
            exit_code=proc.returncode,
            duration_ms=elapsed_ms,
            stdout=proc.stdout or "",
            stderr=proc.stderr or "",
            backend_only=backend_only,
            frontend_only=frontend_only,
            list_only=list_only,
        )
    except subprocess.TimeoutExpired as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return DevtoolsTestRunResult(
            profile=profile,
            ok=False,
            exit_code=None,
            duration_ms=elapsed_ms,
            stdout=exc.stdout or "",
            stderr=f"{exc.stderr or ''}\nTest run timed out.",
            backend_only=backend_only,
            frontend_only=frontend_only,
            list_only=list_only,
        )
