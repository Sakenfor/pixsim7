#!/usr/bin/env python3
"""
Plan governance CLI.

Provides `sync` and `check` subcommands that replace the TS scripts
(sync_plan_registry.ts, check_plan_registry.ts) as the single source
of governance behavior.

Usage:
    python scripts/plan_governance_cli.py sync [--check]
    python scripts/plan_governance_cli.py check

Environment variables (check mode):
    STRICT_PLAN_DOCS=1          Enable all strict checks
    STRICT_PLAN_METADATA=1      Metadata warnings -> errors
    STRICT_PLAN_PATH_REFS=1     Path-ref warnings -> errors
    STRICT_PLAN_RULEBOOK=1      Architecture doc warnings -> errors
    PLAN_BASE_SHA=<sha>         Git base SHA for drift check
    PLAN_HEAD_SHA=<sha>         Git head SHA for drift check
    PLAN_PATH_REF_IGNORE_FILE   Path to ignore-patterns file
    PLAN_PATH_REF_IGNORE_PATTERNS  Comma-separated ignore regexes
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pixsim7.backend.main.services.docs.plan_governance import (
    GovernanceResult,
    check_registry,
    config_from_env,
    sync_registry,
)


def _to_posix(p: str) -> str:
    return p.replace("\\", "/")


def _print_result(result: GovernanceResult) -> None:
    if result.warnings:
        print("Warnings:")
        for w in result.warnings:
            print(f"  - {w}")
        print()

    if result.errors:
        print("Errors:", file=sys.stderr)
        for e in result.errors:
            print(f"  - {e}", file=sys.stderr)
        print(file=sys.stderr)


def cmd_sync(args: argparse.Namespace) -> int:
    """Run sync or sync --check."""
    check_only = args.check
    result = sync_registry(PROJECT_ROOT, check_only=check_only)

    _print_result(result)

    if check_only:
        if result.ok:
            print("docs/plans/registry.yaml is in sync with manifests.")
            print("docs/plans/README.md plan index is in sync with manifests.")
            return 0
        else:
            print("Run: pnpm docs:plans:sync", file=sys.stderr)
            return 1

    if result.ok:
        print(
            f"Wrote {_to_posix('docs/plans/registry.yaml')} from active manifests."
        )
        print(
            f"Updated plan index in {_to_posix('docs/plans/README.md')}."
        )
        return 0
    else:
        return 1


def cmd_check(args: argparse.Namespace) -> int:
    """Run all governance checks."""
    config = config_from_env()

    registry_path = _to_posix("docs/plans/registry.yaml")
    ignore_file_display = ""
    if config.path_ref_ignore_file:
        ignore_file_display = _to_posix(config.path_ref_ignore_file)
    else:
        default_ignore = PROJECT_ROOT / "docs" / "plans" / "path-ref-ignores.txt"
        if default_ignore.exists():
            ignore_file_display = _to_posix(
                str(default_ignore.relative_to(PROJECT_ROOT))
            )

    print("=" * 60)
    print("Plan Registry Check")
    print("=" * 60)
    print(f"Registry: {registry_path}")
    print(f"Strict docs: {'on' if config.strict_plan_docs else 'off'}")
    print(f"Strict metadata: {'on' if config.strict_plan_docs or config.strict_plan_metadata else 'off'}")
    print(f"Strict path refs: {'on' if config.strict_plan_docs or config.strict_plan_path_refs else 'off'}")
    print(f"Strict rulebook: {'on' if config.strict_plan_docs or config.strict_plan_rulebook else 'off'}")
    if ignore_file_display:
        print(f"Path-ref ignore file: {ignore_file_display}")
    if config.path_ref_ignore_patterns:
        print(f"Path-ref ignore patterns (env): {', '.join(config.path_ref_ignore_patterns)}")
    print()

    result = check_registry(PROJECT_ROOT, config)

    _print_result(result)

    if result.ok:
        print("Plan registry check passed.")
        return 0
    else:
        print(
            f"Plan registry check failed with {len(result.errors)} error(s).",
            file=sys.stderr,
        )
        return 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Plan governance CLI (sync + check)",
    )
    subparsers = parser.add_subparsers(dest="command")

    sync_parser = subparsers.add_parser(
        "sync",
        help="Generate registry.yaml and update README plan index",
    )
    sync_parser.add_argument(
        "--check",
        action="store_true",
        help="Validate sync status without writing files",
    )

    subparsers.add_parser(
        "check",
        help="Validate registry, manifests, metadata, and references",
    )

    # Strip bare "--" separators injected by pnpm when passing extra args
    argv = [a for a in sys.argv[1:] if a != "--"]
    args = parser.parse_args(argv)

    if args.command == "sync":
        return cmd_sync(args)
    elif args.command == "check":
        return cmd_check(args)
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
