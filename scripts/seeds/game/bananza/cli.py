from __future__ import annotations

import argparse
import asyncio
import os
import time
from pathlib import Path
from typing import Dict, Iterable

from .seed_data import DEMO_PROJECT_NAME, DEMO_WORLD_NAME


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Seed a Bananza Boat gameplay slice (world, NPCs, locations, schedules, behavior). "
            "Primitives and templates must be loaded from content packs before running. "
            "Project snapshot bundles always come from the canonical project export contract."
        )
    )
    parser.add_argument(
        "--mode",
        choices=["api", "direct"],
        default="api",
        help=(
            "Seeder mode. "
            "'api' uses HTTP endpoints (recommended). "
            "'direct' writes world rows directly, but snapshot bundles still use export format."
        ),
    )
    parser.add_argument(
        "--owner-user-id",
        type=int,
        default=1,
        help="Owner user id for direct mode only (default: 1). Ignored in API mode.",
    )
    parser.add_argument(
        "--world-name",
        type=str,
        default=DEMO_WORLD_NAME,
        help=f"World name to create or reuse (default: {DEMO_WORLD_NAME!r}).",
    )
    parser.add_argument(
        "--project-name",
        type=str,
        default=DEMO_PROJECT_NAME,
        help=f"Saved project snapshot name to create or update (default: {DEMO_PROJECT_NAME!r}).",
    )
    parser.add_argument(
        "--project-id",
        type=int,
        default=None,
        help="Existing project snapshot id to overwrite directly (default: auto-detect by name).",
    )
    parser.add_argument(
        "--prune-duplicate-projects",
        action=argparse.BooleanOptionalAction,
        default=True,
        help=(
            "When seeding through API mode, remove extra snapshots from the same seed provenance "
            "(default: true)."
        ),
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help=(
            "Watch Bananza seed files and rerun seeding automatically when they change. "
            "Useful for live authoring loops."
        ),
    )
    parser.add_argument(
        "--watch-interval",
        type=float,
        default=1.5,
        help="Polling interval in seconds for --watch mode (default: 1.5).",
    )
    parser.add_argument(
        "--api-base",
        type=str,
        default=os.getenv("PIXSIM_API_BASE", "http://localhost:8000"),
        help="API base URL for API mode (default: env PIXSIM_API_BASE or http://localhost:8000).",
    )
    parser.add_argument(
        "--auth-token",
        type=str,
        default=None,
        help="Bearer token for API mode (default: env PIXSIM_AUTH_TOKEN or login).",
    )
    parser.add_argument(
        "--username",
        type=str,
        default=os.getenv("PIXSIM_USERNAME", "admin"),
        help="Login username for API mode when token is not provided (default: admin).",
    )
    parser.add_argument(
        "--password",
        type=str,
        default=os.getenv("PIXSIM_PASSWORD", "admin"),
        help="Login password for API mode when token is not provided (default: admin).",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    world_name = str(args.world_name).strip() or DEMO_WORLD_NAME
    project_name = str(args.project_name).strip() or DEMO_PROJECT_NAME
    project_id = int(args.project_id) if args.project_id is not None else None

    if str(args.mode) != "direct" and int(args.owner_user_id) != 1:
        print("note: --owner-user-id is ignored in API mode.")

    def _run_once() -> None:
        if str(args.mode) == "direct":
            from .flows.direct_flow import seed_bananza_boat_slice

            asyncio.run(
                seed_bananza_boat_slice(
                    owner_user_id=int(args.owner_user_id),
                    world_name=world_name,
                    project_name=project_name,
                    project_id=project_id,
                )
            )
            return

        from .flows.api_flow import seed_bananza_boat_slice_via_api

        asyncio.run(
            seed_bananza_boat_slice_via_api(
                world_name=world_name,
                project_name=project_name,
                project_id=project_id,
                prune_duplicate_projects=bool(args.prune_duplicate_projects),
                api_base=str(args.api_base).strip(),
                auth_token=(str(args.auth_token).strip() if args.auth_token is not None else None),
                username=str(args.username).strip() or "admin",
                password=str(args.password).strip() or "admin",
            )
        )

    if not bool(args.watch):
        _run_once()
        return

    watch_interval = max(0.2, float(args.watch_interval))
    watch_root = Path(__file__).resolve().parent
    snapshot = _build_watch_snapshot(watch_root)
    print(
        f"[watch] bananza seeder watching {watch_root} "
        f"({len(snapshot)} files), interval={watch_interval:.2f}s"
    )

    try:
        try:
            _run_once()
        except Exception as exc:
            print(f"[watch] seed failed: {exc}")

        while True:
            time.sleep(watch_interval)
            current = _build_watch_snapshot(watch_root)
            if current == snapshot:
                continue
            changed = _diff_watch_snapshot(snapshot, current)
            snapshot = current
            print(f"[watch] changes detected ({len(changed)} files). reseeding...")
            for path in changed[:12]:
                print(f"  - {path}")
            if len(changed) > 12:
                print(f"  ... and {len(changed) - 12} more")
            try:
                _run_once()
            except Exception as exc:
                print(f"[watch] seed failed: {exc}")
    except KeyboardInterrupt:
        print("[watch] stopped")


def _iter_watch_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".py", ".yaml", ".yml", ".json", ".md"}:
            continue
        if "__pycache__" in path.parts:
            continue
        yield path


def _build_watch_snapshot(root: Path) -> Dict[str, int]:
    state: Dict[str, int] = {}
    for path in _iter_watch_files(root):
        rel = path.relative_to(root).as_posix()
        try:
            state[rel] = path.stat().st_mtime_ns
        except FileNotFoundError:
            continue
    return state


def _diff_watch_snapshot(before: Dict[str, int], after: Dict[str, int]) -> list[str]:
    all_paths = set(before.keys()) | set(after.keys())
    changed = [path for path in sorted(all_paths) if before.get(path) != after.get(path)]
    return changed


if __name__ == "__main__":
    main()
