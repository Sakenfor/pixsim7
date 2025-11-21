#!/usr/bin/env python3
"""
Orphan Router Detection Script

Scans pixsim7_backend/api/v1/*.py for APIRouter instances and verifies
that each router has a corresponding route plugin manifest.

This prevents situations where routes are defined but never registered
due to missing manifest.py files.

Usage:
    python scripts/check_orphan_routers.py

Exit codes:
    0 - All routers have manifests
    1 - Orphan routers detected
    2 - Script error
"""

import ast
import sys
from pathlib import Path
from typing import Set, List, Tuple


# Whitelisted internal routers that don't need manifests
# (e.g., routers that are included by other routers)
INTERNAL_ROUTERS_WHITELIST = set([
    # Add any internal-only routers here
    # Example: "internal_health"
])


class RouterVisitor(ast.NodeVisitor):
    """AST visitor to find APIRouter instances"""

    def __init__(self):
        self.has_router = False
        self.router_names = []

    def visit_Assign(self, node):
        """Check for router = APIRouter() assignments"""
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == 'router':
                self.has_router = True
                self.router_names.append('router')
        self.generic_visit(node)


def find_routers_in_api(api_dir: Path) -> Set[str]:
    """
    Scan api/v1/*.py files for router instances.

    Returns set of module names that define routers (e.g., 'auth', 'logs')
    """
    routers = set()

    if not api_dir.exists():
        print(f"Warning: API directory not found: {api_dir}")
        return routers

    for py_file in api_dir.glob("*.py"):
        if py_file.name.startswith("_"):
            continue

        try:
            with open(py_file, 'r', encoding='utf-8') as f:
                tree = ast.parse(f.read(), filename=str(py_file))

            visitor = RouterVisitor()
            visitor.visit(tree)

            if visitor.has_router:
                module_name = py_file.stem
                routers.add(module_name)
                print(f"✓ Found router in: {py_file.name}")

        except SyntaxError as e:
            print(f"Warning: Syntax error in {py_file}: {e}")
        except Exception as e:
            print(f"Warning: Error parsing {py_file}: {e}")

    return routers


def find_route_manifests(routes_dir: Path) -> Set[str]:
    """
    Scan routes/*/manifest.py files.

    Returns set of route plugin IDs (directory names)
    """
    manifests = set()

    if not routes_dir.exists():
        print(f"Warning: Routes directory not found: {routes_dir}")
        return manifests

    for manifest_file in routes_dir.glob("*/manifest.py"):
        plugin_id = manifest_file.parent.name
        manifests.add(plugin_id)
        print(f"✓ Found manifest: routes/{plugin_id}/manifest.py")

    return manifests


def check_orphan_routers() -> Tuple[bool, List[str]]:
    """
    Check for orphan routers (routers without manifests).

    Returns:
        (all_ok, list of orphan router names)
    """
    # Determine paths
    repo_root = Path(__file__).parent.parent
    api_dir = repo_root / "pixsim7_backend" / "api" / "v1"
    routes_dir = repo_root / "pixsim7_backend" / "routes"

    print("=" * 60)
    print("Orphan Router Detection")
    print("=" * 60)
    print()

    print("Scanning for routers in API...")
    routers = find_routers_in_api(api_dir)
    print(f"Found {len(routers)} router modules\n")

    print("Scanning for route manifests...")
    manifests = find_route_manifests(routes_dir)
    print(f"Found {len(manifests)} route manifests\n")

    # Find orphans (routers without manifests)
    orphans = routers - manifests - INTERNAL_ROUTERS_WHITELIST

    print("=" * 60)
    if orphans:
        print("❌ ORPHAN ROUTERS DETECTED")
        print("=" * 60)
        print()
        print("The following routers exist in api/v1/ but have no route manifest:")
        print()
        for orphan in sorted(orphans):
            print(f"  - {orphan}")
            print(f"    Expected: pixsim7_backend/routes/{orphan}/manifest.py")
        print()
        print("To fix:")
        print("  1. Create the missing manifest.py file(s)")
        print("  2. Or add to INTERNAL_ROUTERS_WHITELIST if internal-only")
        print()
        return False, list(orphans)
    else:
        print("✅ ALL ROUTERS HAVE MANIFESTS")
        print("=" * 60)
        print()
        print(f"Verified {len(routers)} routers")
        print(f"All routers are properly registered or whitelisted")
        print()
        return True, []


def main():
    """Main entry point"""
    try:
        all_ok, orphans = check_orphan_routers()

        if all_ok:
            sys.exit(0)
        else:
            sys.exit(1)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(2)


if __name__ == "__main__":
    main()
