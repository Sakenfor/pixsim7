"""
Codegen task manifest parsing.

Reads the canonical `tools/codegen/manifest.ts` and extracts the task list
without requiring a TypeScript runtime — we shell out to `pnpm codegen` for
execution but the discovery happens via a lightweight regex scan.

Mirrors the shape declared in `tools/codegen/manifest.ts` (`CodegenTask`):

  - id, description, script                  (always present)
  - supportsCheck → supports_check           (default False)
  - checkOnly → check_only                   (default False — task only --check)
  - args                                      (default []   — extra CLI args)
  - outputPath → output_path                 (default None — repo-relative)
  - requires                                 (default None — service id dep)
  - timeoutMs → timeout_ms                   (default None — runner default)
  - groups                                   (default []   — UI grouping)

Add a new field by extending the dataclass and the regex lookups below; both
the launcher and backend codegen surfaces will pick it up automatically.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class CodegenTask:
    id: str
    description: str
    script: str
    supports_check: bool = False
    check_only: bool = False
    args: list[str] = field(default_factory=list)
    output_path: str | None = None
    requires: str | None = None
    timeout_ms: int | None = None
    groups: list[str] = field(default_factory=list)


def _resolve_repo_root() -> Path:
    """
    Resolve repository root by finding tools/codegen/manifest.ts.

    Walks up from this file until it finds the manifest, then returns that
    parent directory. Falls back to a 4-up parent for atypical layouts.
    """
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "tools" / "codegen" / "manifest.ts").exists():
            return parent
    return here.parents[4] if len(here.parents) > 4 else here.parent


def _extract_array_block(content: str, anchor_pattern: str) -> str | None:
    """
    Find an exported array literal and return its [...] body as a string.

    Used to pull `CODEGEN_TASKS = [...]` out of the manifest, then again to
    pull `args: [...]` lists out of individual task entries. Tracks bracket
    depth so nested arrays don't close us early.
    """
    match = re.search(anchor_pattern, content)
    if not match:
        return None
    start = match.end() - 1
    depth = 0
    for index, char in enumerate(content[start:], start):
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return content[start : index + 1]
    return None


def _parse_args_list(task_content: str) -> list[str]:
    """
    Parse `args: ['--include-tags', 'a,b,c']` into a Python list of strings.

    Returns an empty list when no `args` field is present.
    """
    match = re.search(r"args\s*:\s*\[", task_content)
    if not match:
        return []
    start = match.end() - 1
    depth = 0
    for index, char in enumerate(task_content[start:], start):
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                inner = task_content[start + 1 : index]
                return re.findall(r"['\"]([^'\"]*)['\"]", inner)
    return []


def load_codegen_tasks(root_dir: Path | None = None) -> list[CodegenTask]:
    """
    Load codegen tasks from `tools/codegen/manifest.ts`.

    Returns the parsed list in declaration order. Raises FileNotFoundError if
    the manifest is missing and ValueError if the `CODEGEN_TASKS` export is
    not found — both indicate a broken repo layout, not a recoverable case.
    """
    root = root_dir or _resolve_repo_root()
    manifest_path = root / "tools" / "codegen" / "manifest.ts"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Codegen manifest not found: {manifest_path}")

    content = manifest_path.read_text(encoding="utf-8")
    array_str = _extract_array_block(
        content, r"export\s+const\s+CODEGEN_TASKS[^=]*=\s*\["
    )
    if array_str is None:
        raise ValueError(f"Could not find CODEGEN_TASKS in: {manifest_path}")

    # Each task entry has shape `{ ... }` with no nested braces (args is a
    # bracketed list, not an object). Plain non-greedy brace match suffices.
    task_pattern = re.compile(r"\{([^{}]+)\}", re.DOTALL)

    tasks: list[CodegenTask] = []
    for task_match in task_pattern.finditer(array_str):
        task_content = task_match.group(1)

        id_match = re.search(r"id:\s*['\"]([^'\"]+)['\"]", task_content)
        if not id_match:
            continue

        desc_match = re.search(r"description:\s*['\"]([^'\"]*)['\"]", task_content)
        script_match = re.search(r"script:\s*['\"]([^'\"]+)['\"]", task_content)
        supports_match = re.search(r"supportsCheck:\s*(true|false)", task_content)
        check_only_match = re.search(r"checkOnly:\s*(true|false)", task_content)
        output_match = re.search(r"outputPath:\s*['\"]([^'\"]+)['\"]", task_content)
        requires_match = re.search(r"requires:\s*['\"]([^'\"]+)['\"]", task_content)
        timeout_match = re.search(r"timeoutMs:\s*(\d+)", task_content)
        groups_match = re.search(r"groups:\s*\[([^\]]*)\]", task_content)

        groups: list[str] = []
        if groups_match:
            groups = re.findall(r"['\"]([^'\"]+)['\"]", groups_match.group(1))

        tasks.append(
            CodegenTask(
                id=id_match.group(1),
                description=desc_match.group(1) if desc_match else "",
                script=script_match.group(1) if script_match else "",
                supports_check=bool(supports_match and supports_match.group(1) == "true"),
                check_only=bool(check_only_match and check_only_match.group(1) == "true"),
                args=_parse_args_list(task_content),
                output_path=output_match.group(1) if output_match else None,
                requires=requires_match.group(1) if requires_match else None,
                timeout_ms=int(timeout_match.group(1)) if timeout_match else None,
                groups=groups,
            )
        )

    return tasks
