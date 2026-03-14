from __future__ import annotations

from pathlib import Path

from scripts.seeds.game.bananza import cli

TEST_SUITE = {
    "id": "bananza-runtime-preferences",
    "label": "Bananza Runtime Preferences Tests",
    "kind": "integration",
    "category": "scripts/bananza",
    "subcategory": "runtime-preferences",
    "covers": ["scripts/seeds/game/bananza/cli.py"],
    "order": 51,
}


def test_read_runtime_preferences_prefers_nested_runtime_meta() -> None:
    snapshot = {
        "provenance": {
            "meta": {
                "bananza_runtime": {
                    "seeder_mode": "direct",
                    "sync_mode": "none",
                    "watch_enabled": True,
                },
                "bananza_seeder_mode": "api",
                "bananza_sync_mode": "two_way",
                "bananza_watch_enabled": False,
            }
        }
    }

    preferences = cli._read_runtime_preferences_from_snapshot(snapshot)

    assert preferences == {
        "mode": "direct",
        "sync_mode": "none",
        "watch": True,
    }


def test_read_runtime_preferences_supports_flat_meta_fallback() -> None:
    snapshot = {
        "provenance": {
            "meta": {
                "bananza_seeder_mode": "api",
                "bananza_sync_mode": "file_to_backend",
                "bananza_watch_enabled": "enabled",
            }
        }
    }

    preferences = cli._read_runtime_preferences_from_snapshot(snapshot)

    assert preferences == {
        "mode": "api",
        "sync_mode": "file_to_backend",
        "watch": True,
    }


def test_read_runtime_preferences_supports_project_runtime_keys() -> None:
    snapshot = {
        "provenance": {
            "meta": {
                "project_runtime": {
                    "mode": "api",
                    "sync_mode": "backend_to_file",
                    "watch_enabled": False,
                },
                "project_runtime_mode": "direct",
                "project_sync_mode": "none",
                "project_watch_enabled": True,
            }
        }
    }

    preferences = cli._read_runtime_preferences_from_snapshot(snapshot)

    assert preferences == {
        "mode": "api",
        "sync_mode": "backend_to_file",
        "watch": False,
    }


def test_read_runtime_preferences_prefers_canonical_when_legacy_conflicts() -> None:
    snapshot = {
        "provenance": {
            "meta": {
                "project_runtime": {
                    "mode": "api",
                    "sync_mode": "two_way",
                    "watch_enabled": True,
                },
                "bananza_runtime": {
                    "seeder_mode": "direct",
                    "sync_mode": "none",
                    "watch_enabled": False,
                },
            }
        }
    }

    preferences = cli._read_runtime_preferences_from_snapshot(snapshot)

    assert preferences == {
        "mode": "api",
        "sync_mode": "two_way",
        "watch": True,
    }


def test_resolve_runtime_config_precedence() -> None:
    project_preferences = {
        "mode": "direct",
        "sync_mode": "backend_to_file",
        "watch": True,
    }
    resolved = cli._resolve_runtime_config(
        explicit_mode="api",
        explicit_sync_mode=None,
        explicit_watch=False,
        project_preferences=project_preferences,
    )

    assert resolved["mode"] == "api"
    assert resolved["sync_mode"] == "backend_to_file"
    assert resolved["watch"] is False
    assert resolved["used_project_mode"] is False
    assert resolved["used_project_sync_mode"] is True
    assert resolved["used_project_watch"] is False


def test_select_runtime_preference_snapshot_prefers_non_legacy() -> None:
    snapshots = [
        {
            "id": 200,
            "name": "Bananza Boat Seed Project",
            "updated_at": "2026-03-06T10:00:00+00:00",
            "provenance": {"kind": "seed", "source_key": cli.BOOTSTRAP_PROFILE},
        },
        {
            "id": 150,
            "name": "Bananza Boat Seed Project",
            "updated_at": "2026-03-05T10:00:00+00:00",
            "provenance": {"kind": "import", "source_key": "bananza.bootstrap"},
        },
        {
            "id": 300,
            "name": "Unrelated Project",
            "updated_at": "2026-03-06T12:00:00+00:00",
            "provenance": {"kind": "import", "source_key": "other"},
        },
    ]

    selected = cli._select_runtime_preference_snapshot(
        snapshots,
        project_name="Bananza Boat Seed Project",
    )

    assert selected is not None
    assert selected["id"] == 150


def test_select_runtime_preference_snapshot_uses_latest_legacy_when_needed() -> None:
    snapshots = [
        {
            "id": 9,
            "name": "Bananza Boat Seed Project",
            "updated_at": "2026-03-01T10:00:00+00:00",
            "provenance": {"kind": "seed", "source_key": cli.BOOTSTRAP_PROFILE},
        },
        {
            "id": 7,
            "name": "Bananza Boat Seed Project",
            "updated_at": "2026-02-28T10:00:00+00:00",
            "provenance": {"kind": "demo", "source_key": "legacy.demo"},
        },
    ]

    selected = cli._select_runtime_preference_snapshot(
        snapshots,
        project_name="Bananza Boat Seed Project",
    )

    assert selected is not None
    assert selected["id"] == 9


def test_iter_watch_files_filters_extensions_and_pycache(tmp_path: Path) -> None:
    (tmp_path / "keep.py").write_text("print('ok')\n", encoding="utf-8")
    (tmp_path / "keep.yaml").write_text("x: 1\n", encoding="utf-8")
    (tmp_path / "skip.txt").write_text("ignore\n", encoding="utf-8")
    pycache_dir = tmp_path / "__pycache__"
    pycache_dir.mkdir()
    (pycache_dir / "cached.py").write_text("print('cached')\n", encoding="utf-8")

    observed = sorted(path.relative_to(tmp_path).as_posix() for path in cli._iter_watch_files(tmp_path))

    assert observed == ["keep.py", "keep.yaml"]


def test_watch_snapshot_diff_detects_add_remove_and_modify(tmp_path: Path) -> None:
    alpha = tmp_path / "alpha.py"
    beta = tmp_path / "beta.json"
    alpha.write_text("alpha = 1\n", encoding="utf-8")
    beta.write_text("{\"v\":1}\n", encoding="utf-8")

    before = cli._build_watch_snapshot(tmp_path)

    alpha.write_text("alpha = 2\n", encoding="utf-8")
    beta.unlink()
    (tmp_path / "gamma.md").write_text("# note\n", encoding="utf-8")

    after = cli._build_watch_snapshot(tmp_path)
    changed = cli._diff_watch_snapshot(before, after)

    assert "alpha.py" in changed
    assert "beta.json" in changed
    assert "gamma.md" in changed
