#!/usr/bin/env python3
"""
Documentation Lifecycle Check Script

Validates documentation lifecycle rules to prevent drift:
1. Warns if backend routes lack manifests
2. Checks if RECENT_CHANGES_* files are tracked in DOCUMENTATION_CHANGELOG.md

Usage:
    python scripts/check_docs_lifecycle.py

Exit codes:
    0 - All checks passed
    1 - Lifecycle violations detected
    2 - Script error
"""

import sys
from pathlib import Path
from typing import List, Set


def find_routes_without_manifests(backend_dir: Path) -> List[str]:
    """Find backend routes that lack manifest.py files."""
    routes_dir = backend_dir / "routes"

    if not routes_dir.exists():
        return []

    missing_manifests = []

    # Check each subdirectory in routes/
    for route_dir in routes_dir.iterdir():
        if not route_dir.is_dir():
            continue

        # Skip __pycache__ and hidden directories
        if route_dir.name.startswith('__') or route_dir.name.startswith('.'):
            continue

        # Check if manifest.py exists
        manifest_file = route_dir / "manifest.py"
        if not manifest_file.exists():
            missing_manifests.append(str(route_dir.relative_to(backend_dir)))

    return missing_manifests


def find_recent_changes_files(docs_dir: Path) -> Set[str]:
    """Find all RECENT_CHANGES_*.md files."""
    recent_changes = set()

    for file in docs_dir.glob("RECENT_CHANGES_*.md"):
        recent_changes.add(file.name)

    return recent_changes


def check_recent_changes_in_changelog(
    changelog_path: Path,
    recent_changes_files: Set[str]
) -> List[str]:
    """Check if RECENT_CHANGES files are mentioned in DOCUMENTATION_CHANGELOG.md."""
    if not changelog_path.exists():
        return list(recent_changes_files)

    changelog_content = changelog_path.read_text()

    untracked = []
    for filename in recent_changes_files:
        # Check if the filename is mentioned anywhere in the changelog
        if filename not in changelog_content and f"docs/{filename}" not in changelog_content:
            untracked.append(filename)

    return untracked


def main():
    """Run all documentation lifecycle checks."""
    project_root = Path(__file__).parent.parent
    backend_dir = project_root / "pixsim7" / "backend" / "main"
    docs_dir = project_root / "docs"
    changelog_path = project_root / "DOCUMENTATION_CHANGELOG.md"

    print("=" * 60)
    print("Documentation Lifecycle Check")
    print("=" * 60)
    print()

    has_errors = False

    # Check 1: Routes without manifests
    print("📋 Checking for routes without manifests...")
    missing_manifests = find_routes_without_manifests(backend_dir)

    if missing_manifests:
        print("⚠️  WARNING: Found routes without manifest.py:")
        for route in missing_manifests:
            print(f"   - {route}/")
        print()
        print("   Each route directory should have a manifest.py file.")
        print("   See existing routes for examples.")
        print()
        has_errors = True
    else:
        print("✅ All routes have manifests")
    print()

    # Check 2: RECENT_CHANGES tracking
    print("📋 Checking RECENT_CHANGES_* files...")
    recent_changes = find_recent_changes_files(docs_dir)

    if recent_changes:
        print(f"   Found {len(recent_changes)} RECENT_CHANGES file(s):")
        for filename in sorted(recent_changes):
            print(f"   - {filename}")
        print()

        untracked = check_recent_changes_in_changelog(changelog_path, recent_changes)

        if untracked:
            print("⚠️  WARNING: RECENT_CHANGES files not mentioned in DOCUMENTATION_CHANGELOG.md:")
            for filename in sorted(untracked):
                print(f"   - {filename}")
            print()
            print("   Add these files to DOCUMENTATION_CHANGELOG.md or move their")
            print("   content to canonical docs if changes have settled.")
            print()
            has_errors = True
        else:
            print("✅ All RECENT_CHANGES files are tracked in DOCUMENTATION_CHANGELOG.md")
    else:
        print("ℹ️  No RECENT_CHANGES files found")
    print()

    # Summary
    print("=" * 60)
    if has_errors:
        print("❌ Documentation lifecycle violations detected")
        print("=" * 60)
        sys.exit(1)
    else:
        print("✅ All documentation lifecycle checks passed")
        print("=" * 60)
        sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ Script error: {e}", file=sys.stderr)
        sys.exit(2)
