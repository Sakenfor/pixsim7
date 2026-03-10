#!/usr/bin/env python3
"""
Plugin metadata drift guard.

Fails when panel/module/devtool definition files change without updating at
least one metadata field (`updatedAt`, `changeNote`, `featureHighlights`) in
the same diff.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import List, Sequence


PROJECT_ROOT = Path(__file__).resolve().parent.parent
METADATA_PATTERN = re.compile(r"\b(updatedAt|changeNote|featureHighlights)\s*:")
IGNORE_LINE_PATTERN = re.compile(r"^\s*(//.*)?$")


def run_git(args: Sequence[str], *, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if check and result.returncode != 0:
        command = " ".join(["git", *args])
        raise RuntimeError(
            f"Command failed ({result.returncode}): {command}\n{result.stderr.strip()}"
        )
    return result.stdout


def ref_exists(ref: str) -> bool:
    result = subprocess.run(
        ["git", "rev-parse", "--verify", f"{ref}^{{commit}}"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


def read_event_before_sha() -> str | None:
    event_path = os.getenv("GITHUB_EVENT_PATH")
    if not event_path:
        return None
    payload_path = Path(event_path)
    if not payload_path.exists():
        return None
    try:
        payload = json.loads(payload_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    before = payload.get("before")
    if not isinstance(before, str):
        return None
    if before == "0000000000000000000000000000000000000000":
        return None
    return before


def resolve_base_ref(explicit_base: str | None) -> str | None:
    candidates: List[str] = []
    if explicit_base:
        candidates.append(explicit_base)

    github_base_ref = os.getenv("GITHUB_BASE_REF")
    if github_base_ref:
        candidates.append(f"origin/{github_base_ref}")
        candidates.append(github_base_ref)

    github_before = os.getenv("GITHUB_EVENT_BEFORE") or read_event_before_sha()
    if github_before and github_before != "0000000000000000000000000000000000000000":
        candidates.append(github_before)

    candidates.append("HEAD~1")

    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if ref_exists(candidate):
            return candidate
    return None


def resolve_diff_range(explicit_base: str | None, head: str) -> str | None:
    if not ref_exists(head):
        raise RuntimeError(f"Head ref does not exist: {head}")

    base_ref = resolve_base_ref(explicit_base)
    if not base_ref:
        return None

    merge_base = run_git(["merge-base", base_ref, head], check=False).strip()
    if merge_base:
        return f"{merge_base}..{head}"
    return f"{base_ref}..{head}"


def is_target_file(path: str) -> bool:
    normalized = path.replace("\\", "/")
    if not normalized.endswith((".ts", ".tsx")):
        return False

    if normalized.startswith("apps/main/src/features/panels/domain/definitions/"):
        return True
    if normalized == "apps/main/src/features/devtools/plugins/tools.ts":
        return True
    if re.match(r"^apps/main/src/features/[^/]+/module\.ts$", normalized):
        return True
    if re.match(r"^apps/main/src/app/modules/core/[^/]+\.ts$", normalized):
        return True
    if re.match(r"^apps/main/src/features/[^/]+/routes/index\.ts$", normalized):
        return True
    return False


def is_module_file(path: str) -> bool:
    normalized = path.replace("\\", "/")
    return bool(
        re.match(r"^apps/main/src/features/[^/]+/module\.ts$", normalized)
        or re.match(r"^apps/main/src/app/modules/core/[^/]+\.ts$", normalized)
        or re.match(r"^apps/main/src/features/[^/]+/routes/index\.ts$", normalized)
    )


def file_contains_module_definition(path: str) -> bool:
    file_path = PROJECT_ROOT / path
    if not file_path.exists():
        return True
    content = file_path.read_text(encoding="utf-8", errors="ignore")
    return "defineModule(" in content or bool(re.search(r":\s*Module\s*=", content))


def get_changed_files(diff_range: str) -> List[str]:
    output = run_git(["diff", "--name-only", diff_range, "--"])
    return [line.strip() for line in output.splitlines() if line.strip()]


def get_changed_lines(diff_range: str, path: str) -> List[str]:
    patch = run_git(["diff", "--unified=0", diff_range, "--", path])
    changed: List[str] = []
    for line in patch.splitlines():
        if line.startswith(("+++", "---", "@@")):
            continue
        if line.startswith("+") or line.startswith("-"):
            changed.append(line[1:])
    return changed


def has_substantive_changes(lines: List[str]) -> bool:
    for line in lines:
        if IGNORE_LINE_PATTERN.match(line):
            continue
        if line.strip().startswith(("import ", "export ")):
            continue
        return True
    return False


def has_metadata_change(lines: List[str]) -> bool:
    return any(METADATA_PATTERN.search(line) for line in lines)


def check_metadata(diff_range: str) -> int:
    changed_files = get_changed_files(diff_range)
    target_files = [path for path in changed_files if is_target_file(path)]

    if not target_files:
        print("[meta-check] No target definition files changed.")
        return 0

    missing: List[str] = []
    for path in sorted(target_files):
        if is_module_file(path) and not file_contains_module_definition(path):
            continue
        changed_lines = get_changed_lines(diff_range, path)
        if not changed_lines:
            continue
        if not has_substantive_changes(changed_lines):
            continue
        if not has_metadata_change(changed_lines):
            missing.append(path)

    if missing:
        print("[meta-check] Metadata updates missing for modified definition files:")
        for path in missing:
            print(f"  - {path}")
        print(
            "[meta-check] Add/refresh at least one of: updatedAt, changeNote, featureHighlights."
        )
        return 1

    print(
        f"[meta-check] OK: metadata changed where required ({len(target_files)} file(s) checked)."
    )
    return 0


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check plugin metadata updates for definition edits."
    )
    parser.add_argument(
        "--base",
        help="Explicit base ref/commit for diff calculation (defaults to PR base or previous commit).",
    )
    parser.add_argument(
        "--head",
        default="HEAD",
        help="Head ref/commit for diff calculation (default: HEAD).",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    diff_range = resolve_diff_range(args.base, args.head)

    if not diff_range:
        print("[meta-check] Could not determine a base commit. Skipping.")
        return 0

    print(f"[meta-check] Diff range: {diff_range}")
    return check_metadata(diff_range)


if __name__ == "__main__":
    sys.exit(main())
