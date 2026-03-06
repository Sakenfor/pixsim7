from __future__ import annotations

from scripts.seeds.game.bananza import cli


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
