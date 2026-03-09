from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

try:
    from scripts.tests.catalog_loader import ROOT, CatalogSuite, load_catalog
except ImportError:
    from catalog_loader import ROOT, CatalogSuite, load_catalog


ALLOWED_SUITE_KINDS = {"unit", "contract", "integration", "e2e", "smoke"}
ALLOWED_SUITE_LAYERS = {"backend", "frontend", "scripts"}
REQUIRED_SUITE_FIELDS = ("category", "subcategory", "kind")


def _validate_suite(
    suite: CatalogSuite,
    *,
    seen_ids: set[str],
) -> list[str]:
    errors: list[str] = []
    suite_label = suite.id or "<missing-id>"

    if not suite.id:
        errors.append("suite is missing required field: id")
    elif suite.id in seen_ids:
        errors.append(f"duplicate suite id: {suite.id}")
    else:
        seen_ids.add(suite.id)

    if not suite.path:
        errors.append(f"suite '{suite_label}' is missing required field: path")
    elif not (ROOT / suite.path).exists():
        errors.append(f"suite '{suite_label}' path does not exist: {suite.path}")

    if not suite.layer:
        errors.append(f"suite '{suite_label}' is missing required field: layer")
    elif suite.layer not in ALLOWED_SUITE_LAYERS:
        errors.append(f"suite '{suite_label}' has invalid layer '{suite.layer}'")

    for field in REQUIRED_SUITE_FIELDS:
        value = getattr(suite, field)
        if not value:
            errors.append(f"suite '{suite_label}' is missing required field: {field}")

    if suite.kind and suite.kind not in ALLOWED_SUITE_KINDS:
        errors.append(f"suite '{suite_label}' has invalid kind '{suite.kind}'")

    if not suite.covers:
        errors.append(f"suite '{suite_label}' is missing required field: covers")
    else:
        for cover in suite.covers:
            if not (ROOT / cover).exists():
                errors.append(f"suite '{suite_label}' cover path does not exist: {cover}")

    return errors


def validate_catalog() -> tuple[list[str], dict[str, Any]]:
    profiles, suites = load_catalog()

    errors: list[str] = []
    profile_ids: set[str] = set()
    for profile in profiles:
        if not profile.id:
            errors.append("profile is missing required field: id")
            continue
        if profile.id in profile_ids:
            errors.append(f"duplicate profile id: {profile.id}")
            continue
        profile_ids.add(profile.id)

    suite_ids: set[str] = set()
    for suite in suites:
        errors.extend(_validate_suite(suite, seen_ids=suite_ids))

    summary = {
        "catalog_path": str((ROOT / "apps/main/src/features/devtools/services/testCatalogRegistry.ts").as_posix()),
        "profile_count": len(profiles),
        "suite_count": len(suites),
        "unique_profile_ids": len(profile_ids),
        "unique_suite_ids": len(suite_ids),
    }
    return errors, summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Validate test catalog metadata in testCatalogRegistry.ts "
            "(required suite fields, path existence, duplicate ids)."
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON output.",
    )
    args = parser.parse_args()

    errors, summary = validate_catalog()
    ok = not errors

    if args.json:
        print(
            json.dumps(
                {
                    "ok": ok,
                    "summary": summary,
                    "errors": errors,
                },
                indent=2,
                sort_keys=False,
            )
        )
    else:
        if ok:
            print(
                "[test-catalog] OK "
                f"profiles={summary['profile_count']} suites={summary['suite_count']}"
            )
        else:
            print("[test-catalog] FAIL")
            for error in errors:
                print(f"[test-catalog] {error}")

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
