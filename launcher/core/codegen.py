"""
Codegen task discovery for launcher tools.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
import re


DEFAULT_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class CodegenTask:
    id: str
    description: str
    script: str
    supports_check: bool = False
    groups: List[str] = field(default_factory=list)


def load_codegen_tasks(root_dir: Optional[Path] = None) -> List[CodegenTask]:
    root = root_dir or DEFAULT_ROOT
    manifest_path = root / "scripts" / "codegen.manifest.ts"
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
