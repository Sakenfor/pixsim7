from __future__ import annotations

import argparse
from dataclasses import dataclass
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Sequence, Tuple


ROOT = Path(__file__).resolve().parents[2]
TEST_CATALOG_REGISTRY_TS = ROOT / "apps" / "main" / "src" / "features" / "devtools" / "services" / "testCatalogRegistry.ts"

FAST_BACKEND_TARGETS = [
    "pixsim7/backend/tests/test_extension_contract.py",
    "pixsim7/backend/tests/test_game_project_bundle_modules.py",
    "pixsim7/backend/tests/domain/game/test_project_runtime_meta.py",
    "pixsim7/backend/tests/services/ownership",
    "scripts/seeds/game/bananza/tests/test_cli_runtime_preferences.py",
]

PROJECT_BUNDLE_BACKEND_TARGETS = [
    "pixsim7/backend/tests/test_extension_contract.py",
    "pixsim7/backend/tests/test_game_project_bundle_modules.py",
    "pixsim7/backend/tests/domain/game/test_project_runtime_meta.py",
    "pixsim7/backend/tests/services/ownership",
    "scripts/seeds/game/bananza/tests/test_cli_runtime_preferences.py",
    "scripts/seeds/game/bananza/tests/test_project_sync_and_registration.py",
]

FAST_FRONTEND_TARGETS = [
    "apps/main/src/lib/game/projectBundle/__tests__",
]

FULL_BACKEND_TARGETS = [
    "pixsim7/backend/tests",
    "scripts/seeds/game/bananza/tests",
    "tests",
]

FULL_FRONTEND_TARGETS = [
    "apps/main/src",
]


@dataclass(frozen=True)
class SuiteCoverMapping:
    id: str
    path: str
    layer: str
    covers: tuple[str, ...]


_SUITE_COVER_MAPPINGS_CACHE: tuple[SuiteCoverMapping, ...] | None = None


def _run_git_command(args: Sequence[str]) -> list[str]:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    return [line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()]


def _changed_files() -> list[str]:
    paths = set(_run_git_command(["diff", "--name-only"]))
    paths.update(_run_git_command(["diff", "--cached", "--name-only"]))
    paths.update(_run_git_command(["ls-files", "--others", "--exclude-standard"]))
    return sorted(paths)


def _existing_paths(paths: Iterable[str]) -> list[str]:
    return sorted({path for path in paths if (ROOT / path).exists()})


def _compact_targets(paths: Iterable[str]) -> list[str]:
    normalized = sorted({path.replace("\\", "/").rstrip("/") for path in paths if path})
    compacted: list[str] = []

    for path in sorted(normalized, key=lambda item: (item.count("/"), len(item), item)):
        skip = False
        for kept in compacted:
            kept_path = ROOT / kept
            if kept_path.is_dir() and (path == kept or path.startswith(f"{kept}/")):
                skip = True
                break
        if not skip:
            compacted.append(path)

    return compacted


def _extract_array_literal(source: str, marker: str) -> str | None:
    marker_index = source.find(marker)
    if marker_index < 0:
        return None

    start = source.find("[", marker_index)
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if in_string:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == "'":
                in_string = False
            continue

        if char == "'":
            in_string = True
            continue
        if char == "[":
            depth += 1
            continue
        if char == "]":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]

    return None


def _extract_object_literals(array_literal: str) -> list[str]:
    objects: list[str] = []
    depth = 0
    in_string = False
    escaped = False
    object_start = -1

    for index, char in enumerate(array_literal):
        if in_string:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == "'":
                in_string = False
            continue

        if char == "'":
            in_string = True
            continue
        if char == "{":
            if depth == 0:
                object_start = index
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0 and object_start >= 0:
                objects.append(array_literal[object_start : index + 1])
                object_start = -1

    return objects


def _extract_field_value(obj_literal: str, field_name: str) -> str | None:
    match = re.search(rf"{re.escape(field_name)}:\s*'([^']+)'", obj_literal)
    if not match:
        return None
    return match.group(1)


def _extract_covers(obj_literal: str) -> tuple[str, ...]:
    covers_match = re.search(r"covers:\s*\[(.*?)\]", obj_literal, flags=re.DOTALL)
    if not covers_match:
        return tuple()
    covers = tuple(
        entry.strip()
        for entry in re.findall(r"'([^']+)'", covers_match.group(1))
        if entry.strip()
    )
    return covers


def _load_suite_cover_mappings() -> tuple[SuiteCoverMapping, ...]:
    global _SUITE_COVER_MAPPINGS_CACHE
    if _SUITE_COVER_MAPPINGS_CACHE is not None:
        return _SUITE_COVER_MAPPINGS_CACHE

    if not TEST_CATALOG_REGISTRY_TS.exists():
        _SUITE_COVER_MAPPINGS_CACHE = tuple()
        return _SUITE_COVER_MAPPINGS_CACHE

    source = TEST_CATALOG_REGISTRY_TS.read_text(encoding="utf-8")
    array_literal = _extract_array_literal(source, "const BUILTIN_SUITES")
    if not array_literal:
        _SUITE_COVER_MAPPINGS_CACHE = tuple()
        return _SUITE_COVER_MAPPINGS_CACHE

    mappings: list[SuiteCoverMapping] = []
    for obj_literal in _extract_object_literals(array_literal):
        suite_id = _extract_field_value(obj_literal, "id")
        suite_path = _extract_field_value(obj_literal, "path")
        layer = _extract_field_value(obj_literal, "layer")
        if not suite_id or not suite_path or not layer:
            continue

        covers = _extract_covers(obj_literal)
        if not covers:
            covers = (suite_path,)

        mappings.append(
            SuiteCoverMapping(
                id=suite_id,
                path=suite_path,
                layer=layer,
                covers=tuple(item.replace("\\", "/").rstrip("/") for item in covers),
            )
        )

    _SUITE_COVER_MAPPINGS_CACHE = tuple(mappings)
    return _SUITE_COVER_MAPPINGS_CACHE


def _matches_cover(path: str, cover: str) -> bool:
    normalized_path = path.replace("\\", "/").rstrip("/")
    normalized_cover = cover.replace("\\", "/").rstrip("/")
    if normalized_path == normalized_cover:
        return True
    return normalized_path.startswith(f"{normalized_cover}/")


def _targets_from_catalog_metadata(
    paths: Iterable[str],
) -> tuple[list[str], list[str], set[str], set[str]]:
    mappings = _load_suite_cover_mappings()
    if not mappings:
        return [], [], set(), set()

    backend_targets: set[str] = set()
    frontend_targets: set[str] = set()
    backend_matched_paths: set[str] = set()
    frontend_matched_paths: set[str] = set()

    for path in paths:
        normalized_path = path.replace("\\", "/").rstrip("/")
        for mapping in mappings:
            if not any(_matches_cover(normalized_path, cover) for cover in mapping.covers):
                continue

            if mapping.layer in {"backend", "scripts"}:
                backend_targets.add(mapping.path)
                backend_matched_paths.add(normalized_path)
            elif mapping.layer == "frontend":
                frontend_targets.add(mapping.path)
                frontend_matched_paths.add(normalized_path)

    return (
        _compact_targets(_existing_paths(backend_targets)),
        _compact_targets(_existing_paths(frontend_targets)),
        backend_matched_paths,
        frontend_matched_paths,
    )


def _normalize_test_file_target(path: str) -> str:
    normalized = path.replace("\\", "/").rstrip("/")
    if normalized.endswith("/conftest.py") or normalized.endswith("/__init__.py"):
        return normalized.rsplit("/", 1)[0]
    return normalized


def _backend_targets_from_changed(paths: Iterable[str]) -> list[str]:
    targets: set[str] = set()
    for path in paths:
        normalized = path.replace("\\", "/")
        if not normalized.endswith(".py"):
            continue

        if normalized.startswith("pixsim7/backend/main/tests/"):
            # Compatibility read for legacy paths; canonical location is backend/tests.
            targets.add(
                _normalize_test_file_target(
                    normalized.replace(
                        "pixsim7/backend/main/tests/",
                        "pixsim7/backend/tests/",
                        1,
                    )
                )
            )
            continue

        if normalized.startswith("pixsim7/backend/tests/") or normalized.startswith(
            "tests/"
        ) or normalized.startswith("scripts/seeds/game/bananza/tests/"):
            targets.add(_normalize_test_file_target(normalized))
            continue

        if normalized.startswith("pixsim7/backend/main/services/ownership/"):
            targets.add("pixsim7/backend/tests/services/ownership")
        if normalized == "pixsim7/backend/main/shared/extension_contract.py":
            targets.add("pixsim7/backend/tests/test_extension_contract.py")
        if normalized in {
            "pixsim7/backend/main/domain/game/project_runtime_meta.py",
            "pixsim7/backend/main/domain/game/schemas/project_bundle.py",
            "pixsim7/backend/main/api/v1/game_worlds.py",
        }:
            targets.add("pixsim7/backend/tests/test_game_project_bundle_modules.py")
            targets.add("pixsim7/backend/tests/domain/game/test_project_runtime_meta.py")
        if normalized.startswith("scripts/seeds/game/bananza/"):
            targets.add("scripts/seeds/game/bananza/tests")

    return _compact_targets(_existing_paths(targets))


def _frontend_targets_from_changed(paths: Iterable[str]) -> list[str]:
    targets: set[str] = set()
    for path in paths:
        normalized = path.replace("\\", "/")
        if not normalized.startswith("apps/main/src/"):
            continue

        if normalized.endswith(".test.ts") or normalized.endswith(".test.tsx"):
            targets.add(normalized)
            continue

        if normalized.startswith("apps/main/src/lib/game/projectBundle/"):
            targets.add("apps/main/src/lib/game/projectBundle/__tests__")

    return _compact_targets(_existing_paths(targets))


def _build_profile_targets(profile: str) -> Tuple[list[str], list[str]]:
    if profile == "fast":
        return _compact_targets(_existing_paths(FAST_BACKEND_TARGETS)), _compact_targets(
            _existing_paths(FAST_FRONTEND_TARGETS)
        )
    if profile == "full":
        return _compact_targets(_existing_paths(FULL_BACKEND_TARGETS)), _compact_targets(
            _existing_paths(FULL_FRONTEND_TARGETS)
        )
    if profile == "project-bundle":
        return _compact_targets(_existing_paths(PROJECT_BUNDLE_BACKEND_TARGETS)), _compact_targets(
            _existing_paths(FAST_FRONTEND_TARGETS)
        )
    if profile == "changed":
        changed = _changed_files()
        backend_from_metadata, frontend_from_metadata, backend_matched, frontend_matched = (
            _targets_from_catalog_metadata(changed)
        )
        unmatched_for_backend = [
            path
            for path in changed
            if path.replace("\\", "/").rstrip("/") not in backend_matched
        ]
        unmatched_for_frontend = [
            path
            for path in changed
            if path.replace("\\", "/").rstrip("/") not in frontend_matched
        ]

        backend = _compact_targets(
            _existing_paths(
                [
                    *backend_from_metadata,
                    *_backend_targets_from_changed(unmatched_for_backend),
                ]
            )
        )
        frontend = _compact_targets(
            _existing_paths(
                [
                    *frontend_from_metadata,
                    *_frontend_targets_from_changed(unmatched_for_frontend),
                ]
            )
        )
        if backend or frontend:
            return backend, frontend
        return _compact_targets(_existing_paths(FAST_BACKEND_TARGETS)), _compact_targets(
            _existing_paths(FAST_FRONTEND_TARGETS)
        )
    raise ValueError(f"Unsupported profile: {profile}")


def _run_command(cmd: Sequence[str], *, dry_run: bool) -> int:
    print(f"[tests] {' '.join(cmd)}")
    if dry_run:
        return 0
    result = subprocess.run(cmd, cwd=ROOT, check=False)
    return int(result.returncode)


def _commands_for_targets(
    backend_targets: list[str],
    frontend_targets: list[str],
    *,
    backend_only: bool,
    frontend_only: bool,
) -> list[Tuple[str, list[str]]]:
    commands: list[Tuple[str, list[str]]] = []

    if not frontend_only and backend_targets:
        commands.append(("backend", [sys.executable, "-m", "pytest", *backend_targets]))

    if not backend_only and frontend_targets:
        pnpm_path = shutil.which("pnpm") or shutil.which("pnpm.cmd")
        if pnpm_path is None:
            raise RuntimeError("pnpm is required for frontend test execution")
        commands.append(("frontend", [pnpm_path, "dlx", "vitest", "run", *frontend_targets]))

    return commands


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Unified test runner profiles for backend/frontend suites.",
    )
    parser.add_argument(
        "profile",
        choices=["changed", "fast", "project-bundle", "full"],
        help="Test profile to execute.",
    )
    parser.add_argument(
        "--backend-only",
        action="store_true",
        help="Run only backend pytest commands.",
    )
    parser.add_argument(
        "--frontend-only",
        action="store_true",
        help="Run only frontend vitest commands.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="Print resolved commands without executing them.",
    )
    args = parser.parse_args()

    if args.backend_only and args.frontend_only:
        print("[tests] --backend-only and --frontend-only are mutually exclusive")
        return 2

    backend_targets, frontend_targets = _build_profile_targets(args.profile)
    commands = _commands_for_targets(
        backend_targets,
        frontend_targets,
        backend_only=args.backend_only,
        frontend_only=args.frontend_only,
    )

    if not commands:
        print("[tests] No commands to run for the selected profile and flags.")
        return 0

    if args.list:
        print(f"[tests] profile={args.profile}")
        print(f"[tests] backend targets={backend_targets}")
        print(f"[tests] frontend targets={frontend_targets}")
        for label, cmd in commands:
            print(f"[tests] {label}: {' '.join(cmd)}")
        return 0

    failures = 0
    for label, cmd in commands:
        print(f"[tests] running {label} suite...")
        failures += 1 if _run_command(cmd, dry_run=False) != 0 else 0

    if failures:
        print(f"[tests] completed with {failures} failing suite(s)")
        return 1

    print("[tests] all requested suites passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
