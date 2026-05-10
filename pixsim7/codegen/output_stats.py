"""
Output-stats introspection for codegen tasks.

For a given task id, walk its known output path and report file count,
total size, last-modified time, most-recent file, and (for openapi) the
number of generated symbols. Pure local-filesystem introspection — both
the launcher (your dev machine) and the backend (its filesystem) can use
the same shape so the launcher Codegen tab and any future server-side
panel speak the same dialect.

Returned shape (mirrors `CodegenOutputStats` in `apps/launcher/src/api/tools.ts`):

    {
      ok: bool,                   # False on hard errors (e.g., repo root missing)
      task_id: str,
      output_path?: str,          # repo-relative
      kind?: 'file' | 'directory',
      exists?: bool,
      file_count?: int,
      total_bytes?: int,
      last_modified?: float,      # epoch seconds (most-recent mtime)
      most_recent_file?: str,     # repo-relative
      symbol_count?: int,         # openapi only — `export ` lines in model/index.ts
      error?: str,                # set when ok is False
    }
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .manifest import load_codegen_tasks

# Lazy cache: id → repo-relative output path. Populated on first call so we
# don't reparse the manifest on every output-stats request, but kept in a
# module-level dict so a `pnpm` change to manifest.ts is picked up after a
# reload (the dict is invalidated by process restart, which is the same
# lifecycle as the launcher's other caches).
TASK_OUTPUT_PATHS: dict[str, str] = {}


def _ensure_paths_loaded(repo_root: Path) -> None:
    """Populate TASK_OUTPUT_PATHS from the manifest if it's empty."""
    if TASK_OUTPUT_PATHS:
        return
    try:
        for task in load_codegen_tasks(repo_root):
            if task.output_path:
                TASK_OUTPUT_PATHS[task.id] = task.output_path
    except Exception:
        # Defensive — leave the cache empty so callers fall back to error path.
        pass


def _resolve_output_path(task_id: str, repo_root: Path) -> str | None:
    """
    Find a task's output path, falling back to the longest matching parent.

    Scoped tasks like `openapi-assets` intentionally leave `outputPath` unset
    in the manifest because they share their parent's directory; we resolve
    them here by stripping suffixes until we find a known parent.
    """
    _ensure_paths_loaded(repo_root)
    direct = TASK_OUTPUT_PATHS.get(task_id)
    if direct:
        return direct
    # Walk back to the longest known prefix: `openapi-assets` → `openapi`.
    candidate = task_id
    while "-" in candidate:
        candidate = candidate.rsplit("-", 1)[0]
        if candidate in TASK_OUTPUT_PATHS:
            return TASK_OUTPUT_PATHS[candidate]
    return None


def _count_openapi_exports(index_path: Path) -> int | None:
    """
    Count `export ` lines in the openapi index file.

    The launcher uses this to display the size of the generated surface.
    Returns None if the file is missing or unreadable.
    """
    try:
        text = index_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    return sum(1 for line in text.splitlines() if line.lstrip().startswith("export "))


def _walk_directory_stats(target: Path, repo_root: Path) -> dict[str, Any]:
    """Aggregate file count, total bytes, and most-recent file under a directory."""
    file_count = 0
    total_bytes = 0
    most_recent_mtime = 0.0
    most_recent: Path | None = None
    for entry in target.rglob("*"):
        if not entry.is_file():
            continue
        try:
            stat = entry.stat()
        except OSError:
            continue
        file_count += 1
        total_bytes += stat.st_size
        if stat.st_mtime > most_recent_mtime:
            most_recent_mtime = stat.st_mtime
            most_recent = entry
    out: dict[str, Any] = {
        "kind": "directory",
        "exists": True,
        "file_count": file_count,
        "total_bytes": total_bytes,
    }
    if most_recent is not None:
        out["last_modified"] = most_recent_mtime
        out["most_recent_file"] = str(most_recent.relative_to(repo_root)).replace("\\", "/")
    return out


def _file_stats(target: Path, repo_root: Path) -> dict[str, Any]:
    """Stats for a single-file output."""
    try:
        stat = target.stat()
    except OSError as exc:
        return {"kind": "file", "exists": True, "error": f"stat failed: {exc}"}
    return {
        "kind": "file",
        "exists": True,
        "file_count": 1,
        "total_bytes": stat.st_size,
        "last_modified": stat.st_mtime,
        "most_recent_file": str(target.relative_to(repo_root)).replace("\\", "/"),
    }


def compute_task_output_stats(task_id: str, repo_root: Path) -> dict[str, Any]:
    """
    Compute filesystem stats for a codegen task's declared output.

    Always returns a dict (never raises). On unrecoverable paths (no output
    declared, missing file/dir) the dict has `ok: False` plus an `error`
    string the UI can surface verbatim.
    """
    output_path = _resolve_output_path(task_id, repo_root)
    if not output_path:
        return {
            "ok": False,
            "task_id": task_id,
            "error": "no output_path declared for this task",
        }

    target = repo_root / output_path
    base: dict[str, Any] = {
        "ok": True,
        "task_id": task_id,
        "output_path": output_path,
    }

    if not target.exists():
        base.update({
            "ok": False,
            "kind": "directory" if output_path.endswith("/") else "file",
            "exists": False,
            "error": f"output path does not exist: {output_path}",
        })
        return base

    if target.is_dir():
        base.update(_walk_directory_stats(target, repo_root))
        # Openapi outputs ship a model/index.ts; expose its export count so the
        # UI can show "regenerated N symbols" without re-parsing the spec.
        if task_id.startswith("openapi"):
            index_path = target / "model" / "index.ts"
            if index_path.is_file():
                count = _count_openapi_exports(index_path)
                if count is not None:
                    base["symbol_count"] = count
    else:
        base.update(_file_stats(target, repo_root))

    return base
