from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from pixsim7.backend.main.services.docs import plans as plans_service


def _write_bundle(
    repo_root: Path,
    bundle_dir_name: str,
    *,
    manifest_name: str = "manifest.yaml",
    manifest_overrides: dict[str, Any] | None = None,
) -> None:
    bundle_dir = repo_root / "docs" / "plans" / "active" / bundle_dir_name
    bundle_dir.mkdir(parents=True, exist_ok=True)
    (bundle_dir / "plan.md").write_text("# Plan\n", encoding="utf-8")

    manifest = {
        "id": bundle_dir_name,
        "title": f"Plan {bundle_dir_name}",
        "status": "active",
        "stage": "proposed",
        "owner": "docs lane",
        "last_updated": "2026-03-13",
        "plan_path": "./plan.md",
        "code_paths": [],
        "companions": [],
        "handoffs": [],
        "tags": [],
        "depends_on": [],
    }
    if manifest_overrides:
        manifest.update(manifest_overrides)

    (bundle_dir / manifest_name).write_text(
        yaml.safe_dump(manifest, sort_keys=False),
        encoding="utf-8",
    )


def test_build_plans_index_rejects_plan_path_outside_repo(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _write_bundle(
        tmp_path,
        "escape-plan",
        manifest_overrides={"plan_path": "../../../../../outside.md"},
    )
    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)

    index = plans_service.build_plans_index()

    assert "escape-plan" not in index["entries"]
    assert any("plan_path escapes repo root" in err for err in index["errors"])


def test_build_plans_index_reports_duplicate_ids(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _write_bundle(tmp_path, "bundle-a", manifest_overrides={"id": "shared-plan", "title": "Plan A"})
    _write_bundle(tmp_path, "bundle-b", manifest_overrides={"id": "shared-plan", "title": "Plan B"})
    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)

    index = plans_service.build_plans_index()

    assert len(index["entries"]) == 1
    assert index["entries"]["shared-plan"].title == "Plan A"
    assert any("Duplicate plan id 'shared-plan'" in err for err in index["errors"])


def test_build_plans_index_rejects_non_list_manifest_fields(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _write_bundle(
        tmp_path,
        "bad-tags",
        manifest_overrides={"tags": "not-a-list"},
    )
    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)

    index = plans_service.build_plans_index()

    assert "bad-tags" not in index["entries"]
    assert any("tags must be a list of strings" in err for err in index["errors"])


def test_build_plans_index_discovers_manifest_yml(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _write_bundle(tmp_path, "manifest-yml", manifest_name="manifest.yml")
    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)

    index = plans_service.build_plans_index()

    assert "manifest-yml" in index["entries"]
    assert index["errors"] == []


def test_build_plans_index_discovers_batches_markdown_recursively(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _write_bundle(tmp_path, "batch-plan")
    bundle_dir = tmp_path / "docs" / "plans" / "active" / "batch-plan"
    (bundle_dir / "batches" / "core" / "ops").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "batches" / "core" / "ops" / "bp-b01.md").write_text(
        "# Batch\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)
    index = plans_service.build_plans_index()

    entry = index["entries"]["batch-plan"]
    assert (
        "docs/plans/active/batch-plan/batches/core/ops/bp-b01.md"
        in entry.companions
    )
    assert index["errors"] == []


def test_build_plans_index_dedupes_explicit_and_auto_discovered_companions(
    tmp_path: Path,
    monkeypatch,
) -> None:
    companion_path = "docs/plans/active/dedupe-plan/batches/bp-b01.md"
    _write_bundle(
        tmp_path,
        "dedupe-plan",
        manifest_overrides={"companions": [companion_path]},
    )
    bundle_dir = tmp_path / "docs" / "plans" / "active" / "dedupe-plan"
    (bundle_dir / "batches").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "batches" / "bp-b01.md").write_text("# Batch\n", encoding="utf-8")

    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)
    index = plans_service.build_plans_index()

    entry = index["entries"]["dedupe-plan"]
    assert entry.companions.count(companion_path) == 1


def test_build_plans_index_discovers_tasks_and_appendices_markdown_recursively(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _write_bundle(tmp_path, "task-appendix-plan")
    bundle_dir = tmp_path / "docs" / "plans" / "active" / "task-appendix-plan"
    (bundle_dir / "tasks" / "phase-1").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "appendices" / "notes").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "tasks" / "phase-1" / "t1.md").write_text("# Task 1\n", encoding="utf-8")
    (bundle_dir / "appendices" / "notes" / "a1.md").write_text("# Appendix 1\n", encoding="utf-8")

    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)
    index = plans_service.build_plans_index()

    entry = index["entries"]["task-appendix-plan"]
    assert "docs/plans/active/task-appendix-plan/tasks/phase-1/t1.md" in entry.companions
    assert "docs/plans/active/task-appendix-plan/appendices/notes/a1.md" in entry.companions
    assert index["errors"] == []


def test_build_plans_index_ignores_nested_appendix_manifests_as_plan_manifests(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _write_bundle(tmp_path, "nested-manifest-plan")
    bundle_dir = tmp_path / "docs" / "plans" / "active" / "nested-manifest-plan"
    (bundle_dir / "batches").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "batches" / "manifest.yaml").write_text(
        "tasks:\n  - file: b1.md\n",
        encoding="utf-8",
    )
    (bundle_dir / "batches" / "b1.md").write_text("# Batch 1\n", encoding="utf-8")

    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)
    index = plans_service.build_plans_index()

    assert "nested-manifest-plan" in index["entries"]
    assert index["errors"] == []


def test_build_plans_index_appendix_manifest_supports_tasks_and_exclude(
    tmp_path: Path,
    monkeypatch,
) -> None:
    _write_bundle(tmp_path, "appendix-manifest-plan")
    bundle_dir = tmp_path / "docs" / "plans" / "active" / "appendix-manifest-plan"
    (bundle_dir / "batches" / "drafts").mkdir(parents=True, exist_ok=True)
    (bundle_dir / "batches" / "preferred.md").write_text("# Preferred\n", encoding="utf-8")
    (bundle_dir / "batches" / "zzz.md").write_text("# ZZZ\n", encoding="utf-8")
    (bundle_dir / "batches" / "drafts" / "drop.md").write_text("# Drop\n", encoding="utf-8")
    (bundle_dir / "batches" / "manifest.yaml").write_text(
        yaml.safe_dump(
            {
                "tasks": [{"file": "preferred.md"}],
                "exclude": ["drafts/**"],
            },
            sort_keys=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(plans_service, "_resolve_repo_root", lambda: tmp_path)
    index = plans_service.build_plans_index()

    entry = index["entries"]["appendix-manifest-plan"]
    preferred = "docs/plans/active/appendix-manifest-plan/batches/preferred.md"
    zzz = "docs/plans/active/appendix-manifest-plan/batches/zzz.md"
    dropped = "docs/plans/active/appendix-manifest-plan/batches/drafts/drop.md"

    assert preferred in entry.companions
    assert zzz in entry.companions
    assert dropped not in entry.companions
    assert entry.companions.index(preferred) < entry.companions.index(zzz)
