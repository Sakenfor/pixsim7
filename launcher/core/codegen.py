"""
Codegen task discovery for launcher tools.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
import re
import subprocess
import sys
import time


DEFAULT_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class CodegenTask:
    id: str
    description: str
    script: str
    supports_check: bool = False
    groups: List[str] = field(default_factory=list)


@dataclass
class CodegenRunResult:
    task_id: str
    ok: bool
    exit_code: Optional[int]
    duration_ms: int
    stdout: str
    stderr: str


def load_codegen_tasks(root_dir: Optional[Path] = None) -> List[CodegenTask]:
    root = root_dir or DEFAULT_ROOT
    manifest_path = root / "tools" / "codegen" / "manifest.ts"
    if not manifest_path.exists():
        return []

    try:
        content = manifest_path.read_text(encoding="utf-8")
    except Exception:
        return []

    match = re.search(r"export\s+const\s+CODEGEN_TASKS[^=]*=\s*\[", content)
    if not match:
        return []

    start = match.end() - 1
    bracket_count = 0
    end = start
    for i, char in enumerate(content[start:], start):
        if char == "[":
            bracket_count += 1
        elif char == "]":
            bracket_count -= 1
            if bracket_count == 0:
                end = i + 1
                break

    array_str = content[start:end]
    tasks: List[CodegenTask] = []
    task_pattern = re.compile(r"\{([^{}]+)\}", re.DOTALL)

    for task_match in task_pattern.finditer(array_str):
        task_content = task_match.group(1)

        id_match = re.search(r"id:\s*['\"]([^'\"]+)['\"]", task_content)
        desc_match = re.search(r"description:\s*['\"]([^'\"]+)['\"]", task_content)
        script_match = re.search(r"script:\s*['\"]([^'\"]+)['\"]", task_content)
        check_match = re.search(r"supportsCheck:\s*(true|false)", task_content)
        groups_match = re.search(r"groups:\s*\[([^\]]*)\]", task_content)

        if not id_match:
            continue

        groups: List[str] = []
        if groups_match:
            groups_str = groups_match.group(1)
            groups = re.findall(r"['\"]([^'\"]+)['\"]", groups_str)

        tasks.append(
            CodegenTask(
                id=id_match.group(1),
                description=desc_match.group(1) if desc_match else "",
                script=script_match.group(1) if script_match else "",
                supports_check=(check_match and check_match.group(1) == "true"),
                groups=groups,
            )
        )

    return tasks


def run_codegen_task(
    task_id: str,
    check_mode: bool = False,
    root_dir: Optional[Path] = None,
    timeout_s: int = 180,
) -> CodegenRunResult:
    root = root_dir or DEFAULT_ROOT
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

    start = time.time()

    try:
        result = subprocess.run(
            [pnpm_cmd, *args],
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
        duration_ms = int((time.time() - start) * 1000)
        return CodegenRunResult(
            task_id=task_id,
            ok=result.returncode == 0,
            exit_code=result.returncode,
            duration_ms=duration_ms,
            stdout=result.stdout or "",
            stderr=result.stderr or "",
        )
    except subprocess.TimeoutExpired as exc:
        duration_ms = int((time.time() - start) * 1000)
        return CodegenRunResult(
            task_id=task_id,
            ok=False,
            exit_code=None,
            duration_ms=duration_ms,
            stdout=exc.stdout or "",
            stderr=(exc.stderr or "") + "\nCommand timed out.",
        )
    except FileNotFoundError as exc:
        duration_ms = int((time.time() - start) * 1000)
        return CodegenRunResult(
            task_id=task_id,
            ok=False,
            exit_code=None,
            duration_ms=duration_ms,
            stdout="",
            stderr=f"Failed to run pnpm: {exc}",
        )
