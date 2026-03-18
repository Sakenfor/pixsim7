"""Infer source-file ``covers`` for test suites from their imports.

Usage:
    # Audit all suites — show which have source covers and which don't
    python scripts/tests/infer_covers.py

    # Show inferred covers for a specific test file
    python scripts/tests/infer_covers.py pixsim7/backend/tests/api/test_meta_contracts_index.py

    # Dry-run patch: print what covers would be added to TEST_SUITE dicts
    python scripts/tests/infer_covers.py --patch

    # Apply: rewrite TEST_SUITE covers in-place (only adds, doesn't remove)
    python scripts/tests/infer_covers.py --patch --write
"""
from __future__ import annotations

import ast
import argparse
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

# Packages that map to source directories
_PACKAGE_ROOTS = {
    "pixsim7.backend.main": "pixsim7/backend/main",
    "pixsim7.backend.tests": "pixsim7/backend/tests",
}


def _resolve_import_to_path(module_name: str) -> str | None:
    """Resolve a dotted Python module name to a repo-relative file path."""
    for pkg_prefix, dir_prefix in _PACKAGE_ROOTS.items():
        if not module_name.startswith(pkg_prefix):
            continue
        suffix = module_name[len(pkg_prefix):].lstrip(".")
        parts = suffix.split(".") if suffix else []
        if not parts:
            continue

        # Try as module file first, then as package dir
        rel = dir_prefix + "/" + "/".join(parts)
        if (ROOT / f"{rel}.py").exists():
            return f"{rel}.py"
        if (ROOT / rel / "__init__.py").exists():
            return rel
    return None


def _extract_imports(file_path: Path) -> list[str]:
    """Extract all imported module names from a Python file via AST."""
    try:
        source = file_path.read_text(encoding="utf-8-sig")
        tree = ast.parse(source, filename=str(file_path))
    except (SyntaxError, UnicodeDecodeError):
        return []

    modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                modules.append(node.module)
    return modules


def _is_source_path(path: str) -> bool:
    """Check if a path points to source (not tests/migrations/scripts)."""
    # Normalize: ensure we catch both /tests/ and /tests at end
    p = path.rstrip("/") + "/"
    return (
        "/tests/" not in p
        and "/__tests__/" not in p
        and "/migrations/" not in p
        and not p.startswith("scripts/tests/")
    )


def infer_covers_for_file(file_path: Path) -> list[str]:
    """Infer source-file covers from a test file's imports."""
    imports = _extract_imports(file_path)
    covers: list[str] = []
    seen: set[str] = set()

    for module_name in imports:
        resolved = _resolve_import_to_path(module_name)
        if resolved is None:
            continue
        if not _is_source_path(resolved):
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        covers.append(resolved)

    return sorted(covers)


def _extract_test_suite_node(tree: ast.Module) -> ast.Assign | None:
    """Find the AST node for the TEST_SUITE assignment."""
    for node in ast.iter_child_nodes(tree):
        if not isinstance(node, ast.Assign):
            continue
        if len(node.targets) != 1:
            continue
        target = node.targets[0]
        if isinstance(target, ast.Name) and target.id == "TEST_SUITE":
            return node
    return None


def _extract_covers_from_suite(raw: dict[str, Any]) -> list[str]:
    """Get current covers list from a TEST_SUITE dict."""
    covers = raw.get("covers", [])
    return list(covers) if isinstance(covers, list) else []


def audit_all_suites() -> None:
    """Print coverage audit for all discovered suites."""
    from pixsim7.backend.main.services.testing.discovery import discover_suites, _extract_test_suite

    suites = discover_suites(ROOT)
    needs_backfill: list[tuple[str, str, list[str]]] = []

    for suite in suites:
        existing_covers = list(suite.covers)
        has_source = any(_is_source_path(c) for c in existing_covers)

        if has_source:
            continue

        # Infer from imports
        suite_file = ROOT / suite.path
        if suite_file.is_dir():
            # conftest-based suite — scan conftest and all test files in dir
            inferred: list[str] = []
            for py in sorted(suite_file.rglob("*.py")):
                if py.name.startswith("test_") or py.name == "conftest.py":
                    inferred.extend(infer_covers_for_file(py))
            # Deduplicate
            seen: set[str] = set()
            unique: list[str] = []
            for p in inferred:
                if p not in seen:
                    seen.add(p)
                    unique.append(p)
            inferred = unique
        else:
            inferred = infer_covers_for_file(suite_file)

        if inferred:
            needs_backfill.append((suite.id, suite.path, inferred))

    if not needs_backfill:
        print("All suites already have source-pointed covers.")
        return

    print(f"\n{len(needs_backfill)} suite(s) need covers backfill:\n")
    for suite_id, path, inferred in needs_backfill:
        print(f"  {suite_id} ({path})")
        for c in inferred[:10]:
            print(f"    + {c}")
        if len(inferred) > 10:
            print(f"    ... and {len(inferred) - 10} more")
        print()


def show_file_covers(file_path_str: str) -> None:
    """Show inferred covers for a specific test file."""
    file_path = ROOT / file_path_str
    if not file_path.exists():
        print(f"File not found: {file_path_str}", file=sys.stderr)
        sys.exit(1)

    inferred = infer_covers_for_file(file_path)
    if not inferred:
        print(f"No source imports found in {file_path_str}")
        return

    print(f"Inferred covers for {file_path_str}:\n")
    for c in inferred:
        print(f"  {c}")
    print(f"\nAs TEST_SUITE covers:\n")
    print('    "covers": [')
    for c in inferred:
        print(f'        "{c}",')
    print("    ],")


def patch_suites(write: bool = False) -> None:
    """Scan all test files with TEST_SUITE dicts and add inferred source covers."""
    from pixsim7.backend.main.services.testing.discovery import _extract_test_suite

    scan_roots = [
        ROOT / "pixsim7" / "backend" / "tests",
        ROOT / "scripts",
    ]

    patched = 0
    skipped = 0

    for scan_root in scan_roots:
        if not scan_root.is_dir():
            continue
        for py_file in sorted(scan_root.rglob("*.py")):
            if not (py_file.name.startswith("test_") or py_file.name == "conftest.py"):
                continue

            raw = _extract_test_suite(py_file)
            if raw is None:
                continue

            existing_covers = _extract_covers_from_suite(raw)
            has_source = any(_is_source_path(c) for c in existing_covers)
            if has_source:
                skipped += 1
                continue

            inferred = infer_covers_for_file(py_file)
            if not inferred:
                continue

            # Merge: keep existing + add inferred
            merged = list(existing_covers)
            for c in inferred:
                if c not in merged:
                    merged.append(c)

            rel = py_file.relative_to(ROOT).as_posix()
            suite_id = raw.get("id", "?")

            if write:
                _rewrite_covers_in_file(py_file, merged)
                print(f"  PATCHED {rel} ({suite_id}): +{len(inferred)} source paths")
            else:
                print(f"  {rel} ({suite_id}):")
                for c in inferred:
                    print(f"    + {c}")

            patched += 1

    verb = "patched" if write else "would patch"
    print(f"\n{verb}: {patched}, already good: {skipped}")


def _rewrite_covers_in_file(file_path: Path, new_covers: list[str]) -> None:
    """Rewrite the covers list in a TEST_SUITE dict literal in-place."""
    source = file_path.read_text(encoding="utf-8-sig")
    tree = ast.parse(source, filename=str(file_path))
    node = _extract_test_suite_node(tree)
    if node is None:
        return

    # Find the covers key in the dict node
    if not isinstance(node.value, ast.Dict):
        return

    for i, key in enumerate(node.value.keys):
        if isinstance(key, ast.Constant) and key.value == "covers":
            value_node = node.value.values[i]
            # Get the source range for the covers value
            start_line = value_node.lineno
            end_line = value_node.end_lineno or start_line
            start_col = value_node.col_offset
            end_col = value_node.end_col_offset or (start_col + 1)

            lines = source.splitlines(keepends=True)

            # Build replacement
            indent = " " * start_col
            if len(new_covers) <= 2:
                replacement = "[" + ", ".join(f'"{c}"' for c in new_covers) + "]"
            else:
                inner = ",\n".join(f'{indent}    "{c}"' for c in new_covers)
                replacement = f"[\n{inner},\n{indent}]"

            # Replace the value in source
            if start_line == end_line:
                line = lines[start_line - 1]
                lines[start_line - 1] = line[:start_col] + replacement + line[end_col:]
            else:
                # Multi-line: replace from start to end
                first_line = lines[start_line - 1]
                last_line = lines[end_line - 1]
                lines[start_line - 1] = first_line[:start_col] + replacement + last_line[end_col:]
                del lines[start_line:end_line]

            file_path.write_text("".join(lines), encoding="utf-8")
            return


def main() -> None:
    parser = argparse.ArgumentParser(description="Infer source-file covers for test suites")
    parser.add_argument("file", nargs="?", help="Specific test file to analyze")
    parser.add_argument("--patch", action="store_true", help="Show/apply patches for suites missing source covers")
    parser.add_argument("--write", action="store_true", help="With --patch, apply changes in-place")
    args = parser.parse_args()

    if args.file:
        show_file_covers(args.file)
    elif args.patch:
        patch_suites(write=args.write)
    else:
        audit_all_suites()


if __name__ == "__main__":
    main()
