"""
Backend codegen task discovery and execution.

This is the backend-authoritative interface used by devtools/admin UI.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import re
import subprocess
import sys
import time


@dataclass(frozen=True)
class CodegenTask:
    id: str
    description: str
    script: str
    supports_check: bool = False
    groups: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class CodegenRunResult:
    task_id: str
    ok: bool
    exit_code: int | None
    duration_ms: int
    stdout: str
    stderr: str


def _resolve_repo_root() -> Path:
    """
    Resolve repository root by finding tools/codegen/manifest.ts.
    """
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "tools" / "codegen" / "manifest.ts").exists():
            return parent
    # Fallback for atypical runtime layouts.
    return here.parents[4] if len(here.parents) > 4 else here.parent


def load_codegen_tasks(root_dir: Path | None = None) -> list[CodegenTask]:
    """
    Load codegen tasks from tools/codegen/manifest.ts.
    """
    root = root_dir or _resolve_repo_root()
    manifest_path = root / "tools" / "codegen" / "manifest.ts"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Codegen manifest not found: {manifest_path}")

    content = manifest_path.read_text(encoding="utf-8")

    match = re.search(r"export\s+const\s+CODEGEN_TASKS[^=]*=\s*\[", content)
    if not match:
        raise ValueError(f"Could not find CODEGEN_TASKS in: {manifest_path}")

    start = match.end() - 1
    bracket_count = 0
    end = start
    for index, char in enumerate(content[start:], start):
        if char == "[":
            bracket_count += 1
        elif char == "]":
            bracket_count -= 1
            if bracket_count == 0:
                end = index + 1
                break

    array_str = content[start:end]
    task_pattern = re.compile(r"\{([^{}]+)\}", re.DOTALL)

    tasks: list[CodegenTask] = []
    for task_match in task_pattern.finditer(array_str):
        task_content = task_match.group(1)

        id_match = re.search(r"id:\s*['\"]([^'\"]+)['\"]", task_content)
        desc_match = re.search(r"description:\s*['\"]([^'\"]+)['\"]", task_content)
        script_match = re.search(r"script:\s*['\"]([^'\"]+)['\"]", task_content)
        check_match = re.search(r"supportsCheck:\s*(true|false)", task_content)
        groups_match = re.search(r"groups:\s*\[([^\]]*)\]", task_content)

        if not id_match:
            continue

        groups: list[str] = []
        if groups_match:
            groups = re.findall(r"['\"]([^'\"]+)['\"]", groups_match.group(1))

        tasks.append(
            CodegenTask(
                id=id_match.group(1),
                description=desc_match.group(1) if desc_match else "",
                script=script_match.group(1) if script_match else "",
                supports_check=bool(check_match and check_match.group(1) == "true"),
                groups=groups,
            )
        )

    return tasks


def run_codegen_task(
    task_id: str,
    check_mode: bool = False,
    root_dir: Path | None = None,
    timeout_s: int = 300,
) -> CodegenRunResult:
    """
    Run one codegen task via the repo's unified codegen runner.
    """
    root = root_dir or _resolve_repo_root()
    tasks = load_codegen_tasks(root)
    task_map = {task.id: task for task in tasks}
    task = task_map.get(task_id)

    if not task:
        raise ValueError(f"Unknown codegen task: {task_id}")
    if check_mode and not task.supports_check:
        raise ValueError(f"Task '{task_id}' does not support check mode")

    pnpm_cmd = "pnpm.cmd" if sys.platform == "win32" else "pnpm"
    args = ["codegen", "--", "--only", task_id]
    if check_mode:
        args.append("--check")

    start_time = time.time()

    try:
        result = subprocess.run(
            [pnpm_cmd, *args],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=timeout_s,
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
            stderr=f"{exc.stderr or ''}\nCommand timed out.",
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

