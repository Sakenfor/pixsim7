"""Git tooling integration for Launcher GUI.

Provides functions to:
- Enumerate commit groups and detect changed paths.
- Perform dry-run or actual staged commits for selected groups.

This mirrors logic from scripts/commit_groups.ps1 but implemented in Python for GUI usage.
"""
from __future__ import annotations
import subprocess
import os
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

@dataclass
class CommitGroup:
    key: str
    message: str
    paths: List[str]

# Definition of commit groups (keep in sync with commit_groups.ps1)
GROUPS: List[CommitGroup] = [
    CommitGroup(
        key="docs",
        message="docs: architecture & logging updates",
        paths=[
            "docs/ARCHITECTURE_AUDIT_CLAUDE_TASKS.md",
            "docs/SCENE_EDITOR_CLAUDE_TASKS.md",
            "docs/CONTROL_CENTER_REFACTOR_CLAUDE.md",
            "docs/PROVIDER_ACCOUNT_STRATEGY.md",
            "docs/GAME_BACKEND_SIM_SPEC.md",
            "pixsim7_backend/PIXVERSE_INTEGRATION.md",
            "LOGGING_STRUCTURE.md",
        ],
    ),
    CommitGroup(
        key="pipeline",
        message="feat(pipeline): submission pipeline + artifact model integration",
        paths=[
            "pixsim7_backend/domain/generation_artifact.py",
            "pixsim7_backend/services/submission",
            "pixsim7_backend/workers/job_processor.py",
        ],
    ),
    CommitGroup(
        key="upload",
        message="feat(upload): provider-preferring asset upload & image processing",
        paths=[
            "pixsim7_backend/services/upload",
            "pixsim7_backend/shared/image_utils.py",
            "pixsim7_backend/api/v1/assets.py",
        ],
    ),
    CommitGroup(
        key="logging",
        message="feat(logging): shared logging package & middleware wiring",
        paths=[
            "pixsim_logging",
            "pixsim7_backend/api/middleware.py",
            "pixsim7_backend/requirements.txt",
        ],
    ),
    CommitGroup(
        key="frontend",
        message="feat(frontend): scene editor expansion & layout updates",
        paths=[
            "frontend/src/components",
            "frontend/src/modules/scene-builder",
            "frontend/src/stores",
            "frontend/src/App.tsx",
            "frontend/src/routes",
            "frontend/tailwind.config.ts",
            "frontend/tsconfig.app.json",
        ],
    ),
    CommitGroup(
        key="launcher",
        message="feat(devtools): add local launcher GUI",
        paths=["scripts/launcher.py", "scripts/launcher_gui"],
    ),
    CommitGroup(
        key="config",
        message="chore(config): workspace & environment setup",
        paths=[
            "environment.yml",
            "pnpm-workspace.yaml",
            "tsconfig.base.json",
            "package.json",
            "frontend/package.json",
        ],
    ),
    CommitGroup(
        key="tests",
        message="test: pipeline, upload, scene editor runtime",
        paths=[
            "tests/test_submission_pipeline.py",
            "tests/test_upload_service.py",
            "tests/pipeline_test_runner.py",
            "tests/test_node_palette_integration.ts",
            "tests/test_scene_runtime_mapping.ts",
        ],
    ),
]


def _run_git(args: List[str]) -> Tuple[int, str, str]:
    proc = subprocess.Popen([
        "git", *args
    ], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, err = proc.communicate()
    return proc.returncode, out, err


def detect_changes(group: CommitGroup) -> Dict[str, List[str]]:
    """Return a dict with keys 'modified' and 'untracked' listing paths inside the group that have changes."""
    modified: List[str] = []
    untracked: List[str] = []
    # git status porcelain for each path root
    code, out, err = _run_git(["status", "--porcelain", *group.paths])
    if code != 0:
        return {"modified": [], "untracked": [], "error": [err.strip()] if err else []}
    for line in out.splitlines():
        if not line.strip():
            continue
        status_code = line[:2]
        path = line[3:]
        if status_code == "??":
            untracked.append(path)
        else:
            modified.append(path)
    return {"modified": modified, "untracked": untracked}


def dry_run(selected_keys: List[str], show_unchanged: bool = True) -> str:
    lines = []
    for g in GROUPS:
        if selected_keys and g.key not in selected_keys:
            continue
        changes = detect_changes(g)
        total = len(changes["modified"]) + len(changes["untracked"])
        if total == 0:
            if show_unchanged:
                lines.append(f"[skip] {g.key}: no changes")
            continue
        lines.append(f"[plan] {g.key}: commit message -> '{g.message}'")
        for p in changes["modified"]:
            lines.append(f"  M {p}")
        for p in changes["untracked"]:
            lines.append(f"  ?? {p}")
    return "\n".join(lines)


def count_changes(selected_keys: List[str]) -> int:
    total = 0
    for g in GROUPS:
        if selected_keys and g.key not in selected_keys:
            continue
        changes = detect_changes(g)
        total += len(changes["modified"]) + len(changes["untracked"])
    return total


def commit_groups(selected_keys: List[str], require_changes: bool = True, message_override: Optional[Dict[str, str]] = None) -> List[Tuple[str, str]]:
    """Perform commits for the selected group keys.
    Returns list of (group_key, result_message). Does not push.
    """
    results: List[Tuple[str, str]] = []
    for g in GROUPS:
        if selected_keys and g.key not in selected_keys:
            continue
        changes = detect_changes(g)
        total = len(changes["modified"]) + len(changes["untracked"])
        if total == 0 and require_changes:
            results.append((g.key, "no changes"))
            continue
        # Stage paths (only those that exist)
        existing = [p for p in g.paths if os.path.exists(os.path.join(ROOT, p))]
        if not existing:
            results.append((g.key, "paths missing"))
            continue
        code, out, err = _run_git(["add", *existing])
        if code != 0:
            results.append((g.key, f"git add failed: {err.strip()}"))
            continue
        # Check if anything staged
        code_diff, out_diff, err_diff = _run_git(["diff", "--cached", "--name-only"])
        if code_diff != 0 or not out_diff.strip():
            results.append((g.key, "nothing staged"))
            continue
        commit_msg = g.message
        if message_override and g.key in message_override:
            msg = message_override[g.key].strip()
            if msg:
                commit_msg = msg
        code_commit, out_commit, err_commit = _run_git(["commit", "-m", commit_msg])
        if code_commit != 0:
            results.append((g.key, f"commit failed: {err_commit.strip()}"))
        else:
            results.append((g.key, "committed"))
    return results

