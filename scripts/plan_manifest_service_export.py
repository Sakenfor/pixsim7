#!/usr/bin/env python3
"""
Export plan manifest records using the backend docs service parser.

DEPRECATED: All governance logic has moved to
  pixsim7/backend/main/services/docs/plan_governance.py
  scripts/plan_governance_cli.py

This file is retained as the IPC bridge for any remaining TS callers.
No new callers should be added.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from pixsim7.backend.main.services.docs.plans import PLAN_SCOPES, build_plans_index


def _parse_scopes(raw: str | None) -> tuple[str, ...]:
    if not raw or not raw.strip():
        return tuple(PLAN_SCOPES)

    scopes: list[str] = []
    allowed = set(PLAN_SCOPES)
    for token in raw.split(","):
        scope = token.strip()
        if not scope:
            continue
        if scope not in allowed:
            raise ValueError(
                f"Invalid scope '{scope}'. Expected one of: {', '.join(PLAN_SCOPES)}"
            )
        if scope not in scopes:
            scopes.append(scope)

    return tuple(scopes or PLAN_SCOPES)


def _entry_to_manifest(entry: Any) -> dict[str, Any]:
    manifest_path = entry.manifest_path or f"docs/plans/{entry.scope}/{entry.id}/manifest.yaml"
    manifest_path = str(PurePosixPath(manifest_path))
    manifest_dir = str(PurePosixPath(manifest_path).parent)
    return {
        "scope": entry.scope,
        "manifest_path": manifest_path,
        "manifest_dir": manifest_dir,
        "id": entry.id,
        "title": entry.title,
        "status": entry.status,
        "stage": entry.stage,
        "owner": entry.owner,
        "last_updated": entry.last_updated,
        "plan_path": entry.plan_path,
        "code_paths": list(entry.code_paths or []),
        "companions": list(entry.companions or []),
        "handoffs": list(entry.handoffs or []),
        "tags": list(entry.tags or []),
        "depends_on": list(entry.depends_on or []),
        "priority": entry.priority or "normal",
        "summary": entry.summary or "",
    }


def _validate_records(manifests: Iterable[dict[str, Any]]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    id_to_path: dict[str, str] = {}
    plan_path_to_id: dict[str, str] = {}

    for manifest in manifests:
        manifest_id = str(manifest.get("id") or "").strip()
        manifest_path = str(manifest.get("manifest_path") or "").strip()
        plan_path = str(manifest.get("plan_path") or "").strip()
        scope = str(manifest.get("scope") or "").strip()
        status = str(manifest.get("status") or "").strip()

        existing_id = id_to_path.get(manifest_id)
        if existing_id:
            errors.append(
                f'Duplicate manifest id "{manifest_id}": {existing_id}, {manifest_path}'
            )
        else:
            id_to_path[manifest_id] = manifest_path

        existing_plan = plan_path_to_id.get(plan_path)
        if existing_plan:
            errors.append(
                f'Duplicate plan_path "{plan_path}" used by manifest ids "{existing_plan}" and "{manifest_id}"'
            )
        else:
            plan_path_to_id[plan_path] = manifest_id

        if scope == "active" and status != "active":
            warnings.append(
                f'Active manifest {manifest_path} has status "{status}" (expected "active")'
            )

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--project-root",
        type=str,
        default=None,
        help="Optional project root to chdir into before loading manifests.",
    )
    parser.add_argument(
        "--scopes",
        type=str,
        default="active,done,parked",
        help="Comma-separated scope list (active,done,parked).",
    )
    args = parser.parse_args()

    if args.project_root:
        project_root = Path(args.project_root).resolve()
        if not project_root.exists():
            print(
                json.dumps(
                    {
                        "manifests": [],
                        "errors": [f"Project root does not exist: {project_root}"],
                        "warnings": [],
                    }
                )
            )
            return 0
        os.chdir(project_root)

    try:
        scopes = _parse_scopes(args.scopes)
    except ValueError as exc:
        print(
            json.dumps(
                {"manifests": [], "errors": [str(exc)], "warnings": []}
            )
        )
        return 0

    index = build_plans_index(scopes=scopes)
    entries = index.get("entries", {})
    manifests = [_entry_to_manifest(entry) for entry in entries.values()]
    manifests.sort(key=lambda m: (str(m["manifest_path"]), str(m["id"])))

    errors = list(index.get("errors", []) or [])
    validation_errors, warnings = _validate_records(manifests)
    errors.extend(validation_errors)

    payload = {
        "manifests": manifests,
        "errors": errors,
        "warnings": warnings,
    }
    json.dump(payload, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
