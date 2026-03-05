from __future__ import annotations

import argparse
import asyncio
import os
import time
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

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
            "When seeding through API mode, remove extra snapshots with the same project name "
            "(default: true)."
        ),
    )
    parser.add_argument(
        "--project-file",
        type=str,
        default=None,
        help=(
            "Optional path to a local project bundle file used for API project sync. "
            "Default: ./.pixsim7/bananza/<project-name>.json."
        ),
    )
    parser.add_argument(
        "--sync-mode",
        choices=["two_way", "backend_to_file", "file_to_backend", "none"],
        default="two_way",
        help=(
            "API mode project sync strategy: "
            "'two_way' (default), 'backend_to_file', 'file_to_backend', or 'none'."
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
    mode = str(args.mode)
    world_name = str(args.world_name).strip() or DEMO_WORLD_NAME
    project_name = str(args.project_name).strip() or DEMO_PROJECT_NAME
    project_id = int(args.project_id) if args.project_id is not None else None
    api_base = str(args.api_base).strip()
    username = str(args.username).strip() or "admin"
    password = str(args.password).strip() or "admin"
    explicit_auth_token = (str(args.auth_token).strip() if args.auth_token is not None else None)
    project_file = (str(args.project_file).strip() if args.project_file is not None else None) or None
    sync_mode = str(args.sync_mode).strip().lower()
    cached_auth_token: Optional[str] = explicit_auth_token

    if mode != "direct" and int(args.owner_user_id) != 1:
        print("note: --owner-user-id is ignored in API mode.")
    if mode == "direct" and sync_mode != "none":
        print("note: --sync-mode applies only to API mode; ignoring in direct mode.")

    def _get_api_auth_token() -> str:
        nonlocal cached_auth_token
        if cached_auth_token:
            return cached_auth_token

        from .flows.api_flow import resolve_api_auth_token

        cached_auth_token = asyncio.run(
            resolve_api_auth_token(
                api_base=api_base,
                auth_token=None,
                username=username,
                password=password,
            )
        )
        return cached_auth_token

    def _sync_once(*, source_world_id: Optional[int]) -> Optional[Dict[str, Any]]:
        if mode != "api" or sync_mode == "none":
            return None

        from .flows.api_flow import sync_project_snapshot_file_via_api

        sync_result = asyncio.run(
            sync_project_snapshot_file_via_api(
                api_base=api_base,
                auth_token=_get_api_auth_token(),
                username=username,
                password=password,
                project_name=project_name,
                project_id=project_id,
                source_world_id=source_world_id,
                project_file=project_file,
                sync_mode=sync_mode,
            )
        )
        return sync_result if isinstance(sync_result, dict) else None

    def _run_once() -> Dict[str, Any]:
        if mode == "direct":
            from .flows.direct_flow import seed_bananza_boat_slice

            result = asyncio.run(
                seed_bananza_boat_slice(
                    owner_user_id=int(args.owner_user_id),
                    world_name=world_name,
                    project_name=project_name,
                    project_id=project_id,
                )
            )
            return result if isinstance(result, dict) else {}

        from .flows.api_flow import seed_bananza_boat_slice_via_api

        result = asyncio.run(
            seed_bananza_boat_slice_via_api(
                world_name=world_name,
                project_name=project_name,
                project_id=project_id,
                prune_duplicate_projects=bool(args.prune_duplicate_projects),
                api_base=api_base,
                auth_token=_get_api_auth_token(),
                username=username,
                password=password,
            )
        )
        return result if isinstance(result, dict) else {}

    def _print_sync_result(sync_result: Optional[Dict[str, Any]]) -> None:
        if not isinstance(sync_result, dict):
            return
        action = str(sync_result.get("action") or "noop")
        project_file_label = str(sync_result.get("project_file") or "")
        if action == "noop":
            return
        print(
            "[sync] "
            f"action={action} "
            f"mode={sync_result.get('mode')} "
            f"project_id={sync_result.get('project_id')} "
            f"project_name={sync_result.get('project_name')!r} "
            f"project_file={project_file_label}"
        )
        if sync_result.get("bundle_hash"):
            print(f"[sync] bundle_hash={sync_result.get('bundle_hash')}")

    if not bool(args.watch):
        seed_result = _run_once()
        sync_result = _sync_once(source_world_id=_to_optional_int(seed_result.get("source_world_id")))
        _print_sync_result(sync_result)
        return

    watch_interval = max(0.2, float(args.watch_interval))
    watch_root = Path(__file__).resolve().parent
    snapshot = _build_watch_snapshot(watch_root)
    project_file_path = (
        _resolve_project_file_path(project_file, project_name=project_name)
        if mode == "api" and sync_mode != "none"
        else None
    )
    project_file_mtime = _read_mtime_ns(project_file_path)
    print(
        f"[watch] bananza seeder watching {watch_root} "
        f"({len(snapshot)} files), interval={watch_interval:.2f}s"
    )
    if project_file_path is not None:
        print(
            f"[watch] sync mode={sync_mode} "
            f"project_file={project_file_path}"
        )

    try:
        last_seed_result: Dict[str, Any] = {}
        try:
            last_seed_result = _run_once()
        except Exception as exc:
            print(f"[watch] seed failed: {exc}")
        try:
            sync_result = _sync_once(
                source_world_id=_to_optional_int(last_seed_result.get("source_world_id"))
            )
            _print_sync_result(sync_result)
        except Exception as exc:
            print(f"[watch] sync failed: {exc}")
        project_file_mtime = _read_mtime_ns(project_file_path)

        while True:
            time.sleep(watch_interval)
            current = _build_watch_snapshot(watch_root)
            seed_changed = current != snapshot
            changed: list[str] = []
            if seed_changed:
                changed = _diff_watch_snapshot(snapshot, current)
                snapshot = current
                print(f"[watch] changes detected ({len(changed)} files). reseeding...")
                for path in changed[:12]:
                    print(f"  - {path}")
                if len(changed) > 12:
                    print(f"  ... and {len(changed) - 12} more")
                try:
                    last_seed_result = _run_once()
                except Exception as exc:
                    print(f"[watch] seed failed: {exc}")

            latest_project_file_mtime = _read_mtime_ns(project_file_path)
            project_file_changed = latest_project_file_mtime != project_file_mtime
            project_file_mtime = latest_project_file_mtime
            if project_file_changed and project_file_path is not None and not seed_changed:
                print(f"[watch] project file changed: {project_file_path}")

            if mode == "api" and sync_mode != "none":
                try:
                    sync_result = _sync_once(
                        source_world_id=_to_optional_int(last_seed_result.get("source_world_id"))
                    )
                    _print_sync_result(sync_result)
                except Exception as exc:
                    print(f"[watch] sync failed: {exc}")
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


def _to_optional_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _resolve_project_file_path(project_file: Optional[str], *, project_name: str) -> Path:
    raw = str(project_file or "").strip()
    if raw:
        return Path(raw).expanduser().resolve()

    safe_name = "".join(ch if ch.isalnum() or ch in ("_", "-", ".") else "_" for ch in project_name.strip())
    safe_name = safe_name or "bananza_project"
    return (Path.cwd() / ".pixsim7" / "bananza" / f"{safe_name}.json").resolve()


def _read_mtime_ns(path: Optional[Path]) -> Optional[int]:
    if path is None:
        return None
    try:
        return path.stat().st_mtime_ns
    except FileNotFoundError:
        return None


if __name__ == "__main__":
    main()
