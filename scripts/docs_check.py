#!/usr/bin/env python3
"""
Documentation Path Validator

Validates that all file paths referenced in documentation exist.
Also validates paths and Python module imports in app_map.sources.json.

Usage:
    python scripts/docs_check.py

Exit codes:
    0 - All paths valid
    1 - Missing paths detected
    2 - Script error
"""

import json
import re
import sys
from pathlib import Path
from typing import NamedTuple


class PathError(NamedTuple):
    """Represents a missing path error."""
    source_file: str
    line_number: int | None
    path: str
    path_type: str  # "file", "directory", "module"


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent


def is_url(path: str) -> bool:
    """Check if a string is a URL."""
    return path.startswith(("http://", "https://", "mailto:", "ftp://"))


def is_placeholder(path: str) -> bool:
    """Check if a path is a placeholder that should be ignored."""
    placeholders = [
        "<",
        ">",
        "${",
        "{{",
        "...",
        "example",
        "your-",
        "/path/to/",
        "localhost",
    ]
    path_lower = path.lower()
    return any(p in path_lower for p in placeholders)


def should_skip_link_path(path: str) -> bool:
    """Check if a markdown link path should be skipped."""
    # Skip URLs and anchors
    if is_url(path) or path.startswith("#"):
        return True

    # Skip placeholders
    if is_placeholder(path):
        return True

    # Skip API routes (start with / but don't have file extension)
    if path.startswith("/") and not any(path.endswith(ext) for ext in [".md", ".py", ".ts", ".tsx", ".json"]):
        # Check if it looks like an API route
        if "/api/" in path or re.match(r"^/[a-z-]+$", path):
            return True

    # Skip command examples
    if path.startswith("python ") or path.startswith("git "):
        return True

    return False


def is_valid_doc_path(path: str) -> bool:
    """Check if a path looks like a valid documentation reference."""
    # Must have a file extension we care about
    valid_extensions = [".md", ".py", ".ts", ".tsx", ".json", ".yaml", ".yml"]

    # Or be a directory reference (ends with /)
    if path.endswith("/"):
        return True

    # Check for valid extensions
    return any(path.endswith(ext) for ext in valid_extensions)


def extract_paths_from_markdown(content: str, file_path: Path) -> list[tuple[int, str]]:
    """Extract file paths from markdown content with line numbers."""
    paths = []
    lines = content.split("\n")
    in_code_block = False

    for line_num, line in enumerate(lines, 1):
        # Track code blocks
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            continue

        # Skip content inside code blocks
        if in_code_block:
            continue

        # Match markdown links: [text](path)
        for match in re.finditer(r'\[([^\]]*)\]\(([^)]+)\)', line):
            path = match.group(2)

            # Skip if should be skipped
            if should_skip_link_path(path):
                continue

            # Remove anchor from path
            path = path.split("#")[0]

            # Only validate paths that look like real file references
            if path and is_valid_doc_path(path):
                paths.append((line_num, path))

    return paths


def resolve_path(path: str, source_file: Path, project_root: Path) -> Path | None:
    """Resolve a path relative to source file or project root."""
    # Clean the path
    path = path.strip()

    # Handle paths relative to source file
    if path.startswith("./") or path.startswith("../"):
        resolved = (source_file.parent / path).resolve()
        try:
            resolved.relative_to(project_root)
            return resolved
        except ValueError:
            return None

    # Handle absolute paths from project root
    return project_root / path


def check_file_path(path: str, source_file: Path, project_root: Path) -> bool:
    """Check if a file path exists."""
    resolved = resolve_path(path, source_file, project_root)
    if resolved is None:
        return False

    # Check if file or directory exists
    return resolved.exists()


def check_python_module(module: str, project_root: Path) -> bool:
    """Check if a Python module exists as a file or package."""
    # Convert module path to file path
    # e.g., pixsim7.backend.main.api.v1.assets -> pixsim7/backend/main/api/v1/assets.py
    #       or pixsim7/backend/main/api/v1/assets/__init__.py

    parts = module.split(".")
    base_path = project_root / "/".join(parts)

    # Check for module file
    if (base_path.with_suffix(".py")).exists():
        return True

    # Check for package directory with __init__.py
    if (base_path / "__init__.py").exists():
        return True

    # Check if it's a directory (package without explicit __init__.py in modern Python)
    if base_path.is_dir():
        return True

    return False


def validate_markdown_files(project_root: Path) -> list[PathError]:
    """Validate paths in markdown documentation files."""
    errors = []

    # Files to check
    doc_patterns = [
        "README.md",
        "AI_README.md",
        "DEVELOPMENT_GUIDE.md",
        "docs/**/*.md",
    ]

    md_files = []
    for pattern in doc_patterns:
        if "*" in pattern:
            md_files.extend(project_root.glob(pattern))
        else:
            path = project_root / pattern
            if path.exists():
                md_files.append(path)

    for md_file in md_files:
        try:
            content = md_file.read_text(encoding="utf-8")
        except Exception as e:
            print(f"Warning: Could not read {md_file}: {e}")
            continue

        paths = extract_paths_from_markdown(content, md_file)

        for line_num, path in paths:
            if not check_file_path(path, md_file, project_root):
                rel_source = md_file.relative_to(project_root)
                errors.append(PathError(
                    source_file=str(rel_source),
                    line_number=line_num,
                    path=path,
                    path_type="file"
                ))

    return errors


def validate_registry(project_root: Path) -> list[PathError]:
    """Validate paths and modules in app_map.sources.json."""
    errors = []
    registry_path = project_root / "docs" / "app_map.sources.json"

    if not registry_path.exists():
        print(f"Warning: Registry not found: {registry_path}")
        return errors

    try:
        with open(registry_path, "r", encoding="utf-8") as f:
            registry = json.load(f)
    except Exception as e:
        print(f"Warning: Could not parse registry: {e}")
        return errors

    entries = registry.get("entries", [])

    for entry in entries:
        entry_id = entry.get("id", "unknown")

        # Check doc paths
        for doc_path in entry.get("docs", []):
            full_path = project_root / doc_path
            if not full_path.exists():
                errors.append(PathError(
                    source_file="docs/app_map.sources.json",
                    line_number=None,
                    path=f"{doc_path} (entry: {entry_id})",
                    path_type="file"
                ))

        # Check frontend paths
        for fe_path in entry.get("frontend", []):
            full_path = project_root / fe_path
            if not full_path.exists():
                errors.append(PathError(
                    source_file="docs/app_map.sources.json",
                    line_number=None,
                    path=f"{fe_path} (entry: {entry_id})",
                    path_type="directory"
                ))

        # Check backend modules
        for module in entry.get("backend", []):
            if not check_python_module(module, project_root):
                errors.append(PathError(
                    source_file="docs/app_map.sources.json",
                    line_number=None,
                    path=f"{module} (entry: {entry_id})",
                    path_type="module"
                ))

    return errors


def main():
    """Run all documentation path validations."""
    project_root = get_project_root()

    print("=" * 60)
    print("Documentation Path Validator")
    print("=" * 60)
    print(f"Project root: {project_root}")
    print()

    all_errors: list[PathError] = []

    # Validate markdown files
    print("Checking markdown documentation...")
    md_errors = validate_markdown_files(project_root)
    all_errors.extend(md_errors)
    print(f"  Found {len(md_errors)} issues in markdown files")

    # Validate registry
    print("Checking app_map.sources.json...")
    registry_errors = validate_registry(project_root)
    all_errors.extend(registry_errors)
    print(f"  Found {len(registry_errors)} issues in registry")

    print()

    if all_errors:
        print("=" * 60)
        print("ERRORS: Missing paths detected")
        print("=" * 60)
        print()

        # Group by source file
        by_source: dict[str, list[PathError]] = {}
        for error in all_errors:
            if error.source_file not in by_source:
                by_source[error.source_file] = []
            by_source[error.source_file].append(error)

        for source, errors in sorted(by_source.items()):
            print(f"{source}:")
            for error in errors:
                line_info = f":{error.line_number}" if error.line_number else ""
                print(f"  [{error.path_type}] {error.path}{line_info}")
            print()

        print(f"Total: {len(all_errors)} missing paths")
        sys.exit(1)
    else:
        print("=" * 60)
        print("All documentation paths are valid!")
        print("=" * 60)
        sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Script error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(2)
