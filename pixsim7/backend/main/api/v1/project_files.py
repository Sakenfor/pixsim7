"""
Project file access API — read-only access for AI agents reviewing plans/code.

Scoped to the project root, with path traversal protection and sensitive
file blocking. Designed to be discovered via meta contracts so the MCP
proxy auto-generates tools from it.
"""
from __future__ import annotations

import fnmatch
import re
from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

router = APIRouter(prefix="/files", tags=["files"])

_MAX_FILE_SIZE = 200_000  # 200KB
_SENSITIVE_PATTERNS = {".env", "credentials", "secret", ".key", ".pem", "id_rsa"}
_SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", ".next", ".tox"}
_TEXT_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml",
    ".toml", ".md", ".txt", ".css", ".html", ".sql", ".sh", ".cfg",
    ".env.example", ".gitignore", ".dockerignore",
}

_project_root: str | None = None


def _get_project_root() -> Path:
    """Resolve project root from CWD or known markers."""
    global _project_root
    if _project_root:
        return Path(_project_root)

    # Try CWD first, then walk up to find repo root
    cwd = Path.cwd()
    for candidate in [cwd, *cwd.parents]:
        if (candidate / ".git").exists() or (candidate / "pixsim7").is_dir():
            _project_root = str(candidate)
            return candidate
    _project_root = str(cwd)
    return cwd


def _safe_resolve(relative_path: str) -> Path | None:
    """Resolve a relative path safely within the project root."""
    root = _get_project_root()
    try:
        resolved = (root / relative_path).resolve()
        if not str(resolved).startswith(str(root.resolve())):
            return None
        name_lower = resolved.name.lower()
        for pattern in _SENSITIVE_PATTERNS:
            if pattern in name_lower:
                return None
        return resolved
    except (ValueError, OSError):
        return None


# ── Schemas ──────────────────────────────────────────────────────


class FileReadResponse(BaseModel):
    path: str
    total_lines: int
    from_line: int
    to_line: int
    content: str


class FileListEntry(BaseModel):
    path: str
    is_dir: bool
    size: Optional[int] = None


class FileListResponse(BaseModel):
    directory: str
    entries: List[FileListEntry]
    total: int
    truncated: bool = False


class SearchMatch(BaseModel):
    file: str
    line: int
    text: str


class SearchResponse(BaseModel):
    pattern: str
    matches: List[SearchMatch]
    total: int
    truncated: bool = False


# ── Endpoints ────────────────────────────────────────────────────


@router.get("/read", response_model=FileReadResponse)
async def read_project_file(
    path: str = Query(..., description="Relative path to file within the project"),
    offset: int = Query(1, ge=1, description="Start line (1-based)"),
    limit: int = Query(500, ge=1, le=2000, description="Max lines to return"),
):
    """Read a project file with line numbers. Max 200KB, sensitive files blocked."""
    resolved = _safe_resolve(path)
    if not resolved:
        return FileReadResponse(path=path, total_lines=0, from_line=0, to_line=0,
                                content=f"Error: path '{path}' is outside project or blocked")
    if not resolved.exists():
        return FileReadResponse(path=path, total_lines=0, from_line=0, to_line=0,
                                content=f"Error: file not found: {path}")
    if not resolved.is_file():
        return FileReadResponse(path=path, total_lines=0, from_line=0, to_line=0,
                                content=f"Error: not a file: {path}")
    if resolved.stat().st_size > _MAX_FILE_SIZE:
        return FileReadResponse(path=path, total_lines=0, from_line=0, to_line=0,
                                content=f"Error: file too large ({resolved.stat().st_size:,} bytes)")

    try:
        lines = resolved.read_text(encoding="utf-8", errors="replace").splitlines()
        selected = lines[offset - 1: offset - 1 + limit]
        numbered = [f"{offset + i:>5}\t{line}" for i, line in enumerate(selected)]
        return FileReadResponse(
            path=path,
            total_lines=len(lines),
            from_line=offset,
            to_line=offset + len(selected) - 1,
            content="\n".join(numbered),
        )
    except Exception as e:
        return FileReadResponse(path=path, total_lines=0, from_line=0, to_line=0,
                                content=f"Error: {e}")


@router.get("/list", response_model=FileListResponse)
async def list_project_files(
    path: str = Query("", description="Relative directory path (default: root)"),
    pattern: str = Query("", description="Glob pattern to filter (e.g. '*.py')"),
):
    """List files in a project directory with sizes."""
    root = _get_project_root()
    resolved = _safe_resolve(path) if path else root.resolve()
    if not resolved or not resolved.is_dir():
        return FileListResponse(directory=path or ".", entries=[], total=0)

    try:
        if pattern:
            raw = sorted(resolved.glob(pattern))
        else:
            raw = sorted(resolved.iterdir())

        entries: list[FileListEntry] = []
        for entry in raw[:500]:
            rel = str(entry.relative_to(root.resolve()))
            if entry.is_dir():
                if entry.name in _SKIP_DIRS:
                    continue
                entries.append(FileListEntry(path=rel, is_dir=True))
            else:
                name_lower = entry.name.lower()
                if any(p in name_lower for p in _SENSITIVE_PATTERNS):
                    continue
                entries.append(FileListEntry(path=rel, is_dir=False, size=entry.stat().st_size))

        return FileListResponse(
            directory=path or ".",
            entries=entries,
            total=len(entries),
            truncated=len(raw) > 500,
        )
    except Exception as e:
        return FileListResponse(directory=path or ".", entries=[], total=0)


@router.get("/search", response_model=SearchResponse)
async def search_project_files(
    pattern: str = Query(..., description="Text or regex pattern"),
    path: str = Query("", description="Directory to search (default: root)"),
    glob: str = Query("", description="File glob filter (e.g. '*.py')"),
    max_results: int = Query(50, ge=1, le=200, description="Max matches"),
):
    """Search for a pattern across project files."""
    root = _get_project_root()
    search_dir = _safe_resolve(path) if path else root.resolve()
    if not search_dir or not search_dir.is_dir():
        return SearchResponse(pattern=pattern, matches=[], total=0)

    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error:
        return SearchResponse(pattern=pattern, matches=[], total=0)

    matches: list[SearchMatch] = []

    def walk(directory: Path, depth: int = 0) -> None:
        if depth > 10 or len(matches) >= max_results:
            return
        try:
            for entry in sorted(directory.iterdir()):
                if len(matches) >= max_results:
                    return
                if entry.is_dir():
                    if entry.name not in _SKIP_DIRS:
                        walk(entry, depth + 1)
                elif entry.is_file():
                    if glob and not fnmatch.fnmatch(entry.name, glob):
                        continue
                    if not glob and entry.suffix.lower() not in _TEXT_EXTENSIONS:
                        continue
                    if entry.stat().st_size > _MAX_FILE_SIZE:
                        continue
                    name_lower = entry.name.lower()
                    if any(p in name_lower for p in _SENSITIVE_PATTERNS):
                        continue
                    try:
                        content = entry.read_text(encoding="utf-8", errors="replace")
                        for line_no, line in enumerate(content.splitlines(), 1):
                            if regex.search(line):
                                rel = str(entry.relative_to(root.resolve()))
                                matches.append(SearchMatch(
                                    file=rel, line=line_no, text=line.strip()[:200],
                                ))
                                if len(matches) >= max_results:
                                    return
                    except (OSError, UnicodeDecodeError):
                        continue
        except PermissionError:
            pass

    walk(search_dir)

    return SearchResponse(
        pattern=pattern,
        matches=matches,
        total=len(matches),
        truncated=len(matches) >= max_results,
    )
