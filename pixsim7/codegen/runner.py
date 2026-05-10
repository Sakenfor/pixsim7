"""
Codegen task execution.

Shells out to `pnpm codegen -- --only <id> [--check]` so the manifest's `args`
(e.g., `--include-tags ...`) flow through the unified TS runner at
`tools/codegen/runner.ts`. The runner enforces `checkOnly` itself; we also
enforce here so the foot-gun is closed at every layer (a check-only task that
clobbers the shared openapi output directory with just its tag-slice would be
silently destructive).
"""

from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from .manifest import CodegenTask, _resolve_repo_root, load_codegen_tasks

__all__ = ["CodegenRunResult", "run_codegen_task"]


_DEFAULT_TIMEOUT_S = 300


@dataclass(frozen=True)
class CodegenRunResult:
    task_id: str
    ok: bool
    exit_code: int | None
    duration_ms: int
    stdout: str
    stderr: str


def _resolve_timeout(task: CodegenTask, override_s: int | None) -> int:
    """Pick a timeout in seconds — explicit override > task config > default."""
    if override_s is not None:
        return override_s
    if task.timeout_ms is not None:
        # Round up so we don't kill a task right at its declared budget.
        return max(1, (task.timeout_ms + 999) // 1000)
    return _DEFAULT_TIMEOUT_S


def run_codegen_task(
    task_id: str,
    check_mode: bool = False,
    root_dir: Path | None = None,
    timeout_s: int | None = None,
) -> CodegenRunResult:
    """
    Run one codegen task via the repo's unified `pnpm codegen` runner.

    Raises ValueError for unknown task ids, for `check_mode=False` on a task
    declared `checkOnly`, and for `check_mode=True` on a task that doesn't
    declare `supportsCheck`. Subprocess errors are returned as a non-ok result
    rather than raised — callers want to surface stdout/stderr to the UI.
    """
    root = root_dir or _resolve_repo_root()
    tasks = load_codegen_tasks(root)
    task_map = {task.id: task for task in tasks}
    task = task_map.get(task_id)

    if not task:
        raise ValueError(f"Unknown codegen task: {task_id}")
    if check_mode and not task.supports_check:
        raise ValueError(f"Task '{task_id}' does not support check mode")
    if task.check_only and not check_mode:
        # Closes the shared-output-dir foot-gun: scoped openapi-* tasks must
        # never run as a destructive Generate.
        raise ValueError(
            f"Task '{task_id}' is check-only; pass check_mode=True"
        )

    pnpm_cmd = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    args = ["codegen", "--", "--only", task_id]
    if check_mode:
        args.append("--check")
    # Manifest-declared CLI args (e.g., `--include-tags assets,...`) flow
    # through to `tools/codegen/runner.ts` which forwards them to the script.
    args.extend(task.args)

    effective_timeout = _resolve_timeout(task, timeout_s)
    start_time = time.time()

    try:
        result = subprocess.run(
            [pnpm_cmd, *args],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=effective_timeout,
        )
        duration_ms = int((time.time() - start_time) * 1000)
        return CodegenRunResult(
            task_id=task_id,
            ok=result.returncode == 0,
            exit_code=result.returncode,
            duration_ms=duration_ms,
            stdout=result.stdout or "",
            stderr=result.stderr or "",
        )
    except subprocess.TimeoutExpired as exc:
        duration_ms = int((time.time() - start_time) * 1000)
        return CodegenRunResult(
            task_id=task_id,
            ok=False,
            exit_code=None,
            duration_ms=duration_ms,
            stdout=exc.stdout or "",
            stderr=f"{exc.stderr or ''}\nCommand timed out after {effective_timeout}s.",
        )
    except FileNotFoundError as exc:
        duration_ms = int((time.time() - start_time) * 1000)
        return CodegenRunResult(
            task_id=task_id,
            ok=False,
            exit_code=None,
            duration_ms=duration_ms,
            stdout="",
            stderr=f"Failed to run pnpm: {exc}",
        )
